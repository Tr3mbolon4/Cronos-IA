from cronos.core.db import connect
from cronos.core.security import utcnow
from cronos.models.document import normalize_document_text
from cronos.repositories import (
    document_chunk_repository,
    document_page_repository,
    document_repository,
    document_source_repository,
)
from cronos.schemas.document_schemas import document_error
from cronos.services import document_citation_service, document_ingestion_service


def list_documents(owner_id: int, *, include_deleted: bool = False) -> list[dict]:
    document_ingestion_service.ensure_legacy_documents_indexed()
    with connect() as db:
        return document_repository.list_documents(db, owner_id, include_deleted=include_deleted)


def get_document(owner_id: int, document_id: int, *, include_deleted: bool = False) -> dict:
    document_ingestion_service.ensure_legacy_documents_indexed()
    with connect() as db:
        document = document_repository.get_document(db, owner_id, document_id, include_deleted=include_deleted)
        if not document:
            raise document_error("DOCUMENT_NOT_FOUND", "Documento nao encontrado.", 404)
        source = document_source_repository.get_source_for_document(db, owner_id, document_id, include_deleted=include_deleted)
        return {"document": document, "source": source}


def list_pages(owner_id: int, document_id: int, *, include_deleted: bool = False) -> list[dict]:
    _require_document(owner_id, document_id, include_deleted=include_deleted)
    with connect() as db:
        return document_page_repository.list_pages(db, owner_id, document_id, include_deleted=include_deleted)


def get_page(owner_id: int, document_id: int, page_number: int, *, include_deleted: bool = False) -> dict:
    _require_document(owner_id, document_id, include_deleted=include_deleted)
    with connect() as db:
        page = document_page_repository.get_page_by_number(db, owner_id, document_id, page_number, include_deleted=include_deleted)
        if not page:
            raise document_error("DOCUMENT_PAGE_NOT_FOUND", "Pagina de documento nao encontrada.", 404)
        return page


def list_chunks(owner_id: int, document_id: int, filters: dict) -> dict:
    _require_document(owner_id, document_id, include_deleted=filters.get("include_deleted", False))
    with connect() as db:
        return document_chunk_repository.list_chunks(db, owner_id, document_id, filters)


def get_chunk(owner_id: int, chunk_id: int, *, include_deleted: bool = False) -> dict:
    with connect() as db:
        chunk = document_chunk_repository.get_chunk(db, owner_id, chunk_id, include_deleted=include_deleted)
    if not chunk:
        raise document_error("DOCUMENT_CHUNK_NOT_FOUND", "Chunk de documento nao encontrado.", 404)
    return chunk


def delete_document(owner_id: int, document_id: int) -> dict:
    now = utcnow().isoformat()
    with connect() as db:
        document = document_repository.get_document(db, owner_id, document_id, include_deleted=True)
        if not document:
            raise document_error("DOCUMENT_NOT_FOUND", "Documento nao encontrado.", 404)
        document_chunk_repository.soft_delete_chunks_for_document(db, owner_id, document_id, now)
        document_page_repository.soft_delete_pages_for_document(db, owner_id, document_id, now)
        document_source_repository.soft_delete_sources_for_document(db, owner_id, document_id, now)
        updated = document_repository.update_document(db, owner_id, document_id, {"deleted_at": now, "updated_at": now})
        document_repository.record_audit(db, "document_deleted", f"document_id={document_id}")
        return updated


def restore_document(owner_id: int, document_id: int) -> dict:
    now = utcnow().isoformat()
    with connect() as db:
        document = document_repository.get_document(db, owner_id, document_id, include_deleted=True)
        if not document:
            raise document_error("DOCUMENT_NOT_FOUND", "Documento nao encontrado.", 404)
        deleted_at = document.get("deleted_at")
        if not deleted_at:
            return document
        document_chunk_repository.restore_chunks_for_document(db, owner_id, document_id, deleted_at, now)
        document_page_repository.restore_pages_for_document(db, owner_id, document_id, deleted_at, now)
        document_source_repository.restore_sources_for_document(db, owner_id, document_id, deleted_at, now)
        updated = document_repository.update_document(db, owner_id, document_id, {"deleted_at": None, "updated_at": now})
        document_repository.record_audit(db, "document_restored", f"document_id={document_id}")
        return updated


def reindex_document(owner_id: int, document_id: int) -> dict:
    return document_ingestion_service.reindex_document(owner_id, document_id)


def search_library(owner_id: int, filters: dict) -> dict:
    document_ingestion_service.ensure_legacy_documents_indexed()
    query = str(filters.get("query") or "").strip()
    if not query:
        raise document_error("DOCUMENT_VALIDATION_ERROR", "Query obrigatoria.")
    terms = [term for term in normalize_document_text(query).split() if len(term) > 2]
    if not terms:
        raise document_error("DOCUMENT_VALIDATION_ERROR", "Query sem termos pesquisaveis.")

    clauses = ["c.owner_id = ?", "c.deleted_at IS NULL", "d.deleted_at IS NULL", "p.deleted_at IS NULL", "s.deleted_at IS NULL"]
    params: list = [owner_id]
    for key, alias in (("document_id", "c.document_id"), ("source_id", "c.source_id")):
        if filters.get(key) not in (None, ""):
            clauses.append(f"{alias} = ?")
            params.append(int(filters[key]))
    if filters.get("page_number") not in (None, ""):
        clauses.append("p.page_number = ?")
        params.append(int(filters["page_number"]))
    if filters.get("include_deleted"):
        clauses = ["c.owner_id = ?"]
        params = [owner_id]

    where = " AND ".join(clauses)
    with connect() as db:
        rows = db.execute(
            f"""
            SELECT c.*, d.filename AS document_title, s.original_filename, p.page_number, p.id AS selected_page_id
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            JOIN document_sources s ON s.id = c.source_id
            JOIN document_pages p ON p.id = c.page_id
            WHERE {where}
            ORDER BY c.id ASC
            """,
            params,
        ).fetchall()
        ranked = []
        for row in rows:
            chunk = dict(row)
            score = sum(chunk["normalized_text"].count(term) for term in terms)
            if score <= 0:
                continue
            normalized_score = min(1.0, score / max(len(terms), 1))
            document = {"id": chunk["document_id"], "filename": chunk["document_title"]}
            source = {"id": chunk["source_id"], "original_filename": chunk["original_filename"]}
            page = {"id": chunk["page_id"], "page_number": chunk["page_number"]}
            citation = document_citation_service.build_citation(document, source, page, chunk, relevance_score=normalized_score)
            ranked.append({"score": normalized_score, "chunk": chunk, "document": document, "page": page, "excerpt": citation["excerpt"], "citation": citation})
        ranked.sort(key=lambda item: item["score"], reverse=True)
        limit = min(max(int(filters.get("limit", 20)), 1), 100)
        offset = max(int(filters.get("offset", 0)), 0)
        return {"items": ranked[offset : offset + limit], "total": len(ranked), "limit": limit, "offset": offset}


def _require_document(owner_id: int, document_id: int, *, include_deleted: bool = False) -> dict:
    with connect() as db:
        document = document_repository.get_document(db, owner_id, document_id, include_deleted=include_deleted)
    if not document:
        raise document_error("DOCUMENT_NOT_FOUND", "Documento nao encontrado.", 404)
    return document
