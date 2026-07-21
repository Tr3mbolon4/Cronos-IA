import hashlib
import shutil
from pathlib import Path
from uuid import uuid4

from cronos.core.db import connect
from cronos.core.security import utcnow
from cronos.models.document import normalize_document_text
from cronos.repositories import (
    document_chunk_repository,
    document_page_repository,
    document_repository,
    document_source_repository,
)
from cronos.schemas.document_schemas import document_error, sanitize_error_message
from cronos.services import document_chunking_service, document_extraction_service


def import_pdf(owner_id: int, filename: str, content: bytes, *, allow_duplicate: bool = False) -> dict:
    safe_name = _safe_filename(filename)
    document_extraction_service.validate_pdf_file(safe_name, content)
    file_hash = hashlib.sha256(content).hexdigest()
    now = utcnow().isoformat()

    with connect() as db:
        duplicate = document_source_repository.find_duplicate(db, owner_id, file_hash)
        if duplicate and not allow_duplicate:
            document_repository.record_audit(db, "document_duplicate_detected", f"document_id={duplicate['document_id']} hash={file_hash[:12]}")
            raise document_error(
                "DOCUMENT_DUPLICATE",
                "Documento identico ja existe.",
                409,
                {"document_id": duplicate["document_id"], "source_id": duplicate["id"], "filename": duplicate["document_title"]},
            )

    stored_filename = f"{utcnow().strftime('%Y%m%d%H%M%S')}_{uuid4().hex}_{safe_name}"
    target = _stored_path(stored_filename)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)

    try:
        extraction = document_extraction_service.extract_pdf_pages(target)
    except Exception as error:
        try:
            target.unlink(missing_ok=True)
        except Exception:
            pass
        _record_failure_audit(owner_id, "document_import_failed", f"filename={safe_name} error={sanitize_error_message(error)}")
        raise

    with connect() as db:
        document_repository.record_audit(db, "document_import_started", f"filename={safe_name} hash={file_hash[:12]}")
        document = document_repository.create_document(
            db,
            {
                "owner_id": owner_id,
                "filename": safe_name,
                "stored_path": str(target),
                "text": _legacy_text(extraction["pages"]),
                "created_at": now,
                "updated_at": now,
            },
        )
        source = document_source_repository.create_source(
            db,
            {
                "owner_id": owner_id,
                "document_id": document["id"],
                "source_type": "upload",
                "original_filename": safe_name,
                "stored_filename": stored_filename,
                "original_path": None,
                "stored_path": str(target),
                "mime_type": "application/pdf",
                "file_size": len(content),
                "file_hash": file_hash,
                "page_count": extraction["page_count"],
                "language": None,
                "extraction_status": extraction["status"],
                "indexing_status": "processing",
                "error_code": extraction["code"],
                "error_message": "PDF sem texto pesquisavel." if extraction["code"] else None,
                "created_at": now,
                "updated_at": now,
                "indexed_at": None,
            },
        )
        summary = _store_pages_and_chunks(db, owner_id, document, source, extraction["pages"], now)
        final_status = _combined_status(extraction["status"], summary["chunk_count"])
        source = document_source_repository.update_source(
            db,
            owner_id,
            source["id"],
            {"indexing_status": final_status, "updated_at": now, "indexed_at": now},
        )
        audit_action = "document_import_completed" if final_status == "completed" else "document_import_partial"
        if final_status == "failed":
            audit_action = "document_import_failed"
        document_repository.record_audit(db, audit_action, f"document_id={document['id']} pages={summary['page_count']} chunks={summary['chunk_count']}")
        return _summary(document, source, summary)


def ensure_legacy_documents_indexed() -> None:
    now = utcnow().isoformat()
    with connect() as db:
        rows = db.execute(
            """
            SELECT d.*
            FROM documents d
            LEFT JOIN document_sources s ON s.document_id = d.id
            WHERE s.id IS NULL
            """
        ).fetchall()
        for row in rows:
            document = dict(row)
            text = document.get("text") or ""
            stored_path = document.get("stored_path") or ""
            file_hash = _hash_existing_document(stored_path, text)
            source = document_source_repository.create_source(
                db,
                {
                    "owner_id": document.get("owner_id") or 1,
                    "document_id": document["id"],
                    "source_type": "legacy_import",
                    "original_filename": document["filename"],
                    "stored_filename": Path(stored_path).name if stored_path else document["filename"],
                    "original_path": stored_path if Path(stored_path).exists() else None,
                    "stored_path": stored_path,
                    "mime_type": "application/pdf",
                    "file_size": Path(stored_path).stat().st_size if stored_path and Path(stored_path).exists() else len(text.encode("utf-8")),
                    "file_hash": file_hash,
                    "page_count": 1,
                    "language": None,
                    "extraction_status": "completed" if text else "failed",
                    "indexing_status": "processing",
                    "error_code": None if text else "DOCUMENT_SCANNED_NO_TEXT",
                    "error_message": None if text else "Documento legado sem texto armazenado.",
                    "created_at": document["created_at"],
                    "updated_at": now,
                    "indexed_at": None,
                },
            )
            pages = [{"page_number": 1, "text": text, "status": "completed" if text else "failed", "error_message": None if text else "Documento legado sem texto."}]
            summary = _store_pages_and_chunks(db, document.get("owner_id") or 1, document, source, pages, now)
            document_source_repository.update_source(
                db,
                document.get("owner_id") or 1,
                source["id"],
                {"indexing_status": _combined_status(source["extraction_status"], summary["chunk_count"]), "updated_at": now, "indexed_at": now},
            )
            document_repository.record_audit(db, "document_import_completed", f"legacy_document_id={document['id']} chunks={summary['chunk_count']}")


def reindex_document(owner_id: int, document_id: int) -> dict:
    try:
        return _reindex_document(owner_id, document_id)
    except Exception as error:
        code = getattr(error, "code", "DOCUMENT_REINDEX_FAILED")
        _record_failure_audit(owner_id, "document_reindex_failed", f"document_id={document_id} error={code}")
        if code in {"DOCUMENT_NOT_FOUND", "DOCUMENT_SOURCE_NOT_FOUND", "DOCUMENT_FILE_MISSING"}:
            raise
        raise document_error("DOCUMENT_REINDEX_FAILED", "Nao foi possivel reindexar documento.", 500, {"cause": code}) from error


def _reindex_document(owner_id: int, document_id: int) -> dict:
    now = utcnow().isoformat()
    with connect() as db:
        document = document_repository.get_document(db, owner_id, document_id, include_deleted=True)
        if not document:
            raise document_error("DOCUMENT_NOT_FOUND", "Documento nao encontrado.", 404)
        source = document_source_repository.get_source_for_document(db, owner_id, document_id, include_deleted=True)
        if not source:
            raise document_error("DOCUMENT_SOURCE_NOT_FOUND", "Fonte de documento nao encontrada.", 404)
        document_repository.record_audit(db, "document_reindex_started", f"document_id={document_id}")
        document_chunk_repository.soft_delete_chunks_for_document(db, owner_id, document_id, now)
        document_page_repository.soft_delete_pages_for_document(db, owner_id, document_id, now)
        stored_path = Path(source.get("stored_path") or document.get("stored_path") or "")
        if source["source_type"] != "legacy_import" and not stored_path.exists():
            raise document_error("DOCUMENT_FILE_MISSING", "Arquivo original do documento nao encontrado.", 404)
        if stored_path.exists() and source["source_type"] != "legacy_import":
            extraction = document_extraction_service.extract_pdf_pages(stored_path)
            pages = extraction["pages"]
            text = _legacy_text(pages)
            document_repository.update_document(db, owner_id, document_id, {"text": text, "updated_at": now})
            extraction_status = extraction["status"]
            error_code = extraction["code"]
        else:
            pages = [{"page_number": 1, "text": document.get("text") or "", "status": "completed" if document.get("text") else "failed", "error_message": None}]
            extraction_status = "completed" if document.get("text") else "failed"
            error_code = None if document.get("text") else "DOCUMENT_SCANNED_NO_TEXT"
        summary = _store_pages_and_chunks(db, owner_id, document, source, pages, now)
        final_status = _combined_status(extraction_status, summary["chunk_count"])
        source = document_source_repository.update_source(
            db,
            owner_id,
            source["id"],
            {"extraction_status": extraction_status, "indexing_status": final_status, "error_code": error_code, "updated_at": now, "indexed_at": now},
        )
        document_repository.record_audit(db, "document_reindex_completed" if final_status != "failed" else "document_reindex_failed", f"document_id={document_id} chunks={summary['chunk_count']}")
        return _summary(document, source, summary)


def _store_pages_and_chunks(db, owner_id: int, document: dict, source: dict, pages: list[dict], now: str) -> dict:
    page_count = 0
    chunk_count = 0
    for page_payload in pages:
        text = page_payload.get("text") or ""
        page = document_page_repository.create_page(
            db,
            {
                "owner_id": owner_id,
                "document_id": document["id"],
                "source_id": source["id"],
                "page_number": int(page_payload["page_number"]),
                "text_content": text,
                "normalized_text": normalize_document_text(text),
                "character_count": len(text),
                "extraction_status": page_payload.get("status") or "completed",
                "error_message": sanitize_error_message(page_payload.get("error_message")),
                "created_at": now,
                "updated_at": now,
            },
        )
        page_count += 1
        for chunk_payload in document_chunking_service.chunk_page(text):
            duplicate = document_chunk_repository.find_active_duplicate(db, owner_id, source["id"], page["id"], chunk_payload["content_hash"])
            if duplicate:
                continue
            document_chunk_repository.create_chunk(
                db,
                {
                    "owner_id": owner_id,
                    "document_id": document["id"],
                    "source_id": source["id"],
                    "page_id": page["id"],
                    "created_at": now,
                    "updated_at": now,
                    **chunk_payload,
                },
            )
            chunk_count += 1
    return {"page_count": page_count, "chunk_count": chunk_count}


def _summary(document: dict, source: dict, summary: dict) -> dict:
    return {"document": document, "source": source, **summary}


def _safe_filename(filename: str) -> str:
    safe = Path(filename).name
    if not safe or safe != filename or ".." in Path(filename).parts:
        raise document_error("DOCUMENT_VALIDATION_ERROR", "Nome de arquivo invalido.")
    return safe


def _stored_path(stored_filename: str) -> Path:
    return settings_documents_dir() / stored_filename


def settings_documents_dir() -> Path:
    from cronos.core.config import settings

    settings.documents_dir.mkdir(parents=True, exist_ok=True)
    return settings.documents_dir


def _legacy_text(pages: list[dict]) -> str:
    return "\n\n".join(f"[pagina {page['page_number']}]\n{page.get('text') or ''}".strip() for page in pages).strip()


def _combined_status(extraction_status: str, chunk_count: int) -> str:
    if extraction_status == "failed" or chunk_count == 0:
        return "failed"
    if extraction_status == "partial":
        return "partial"
    return "completed"


def _hash_existing_document(stored_path: str, text: str) -> str:
    path = Path(stored_path or "")
    if stored_path and path.exists():
        return hashlib.sha256(path.read_bytes()).hexdigest()
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _record_failure_audit(owner_id: int, action: str, detail: str) -> None:
    try:
        with connect() as db:
            document_repository.record_audit(db, action, f"owner={owner_id} {detail[:180]}")
    except Exception:
        return
