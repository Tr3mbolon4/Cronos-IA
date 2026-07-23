import tempfile
import unittest
from pathlib import Path

from pypdf import PdfWriter
from reportlab.pdfgen import canvas

from cronos.core import config
from cronos.core.db import connect, init_db
from cronos.core.errors import CronosError
from cronos.core.knowledge_config import knowledge_config
from cronos.core.security import utcnow
from cronos.models.document import normalize_document_text
from cronos.api import document_routes, library_routes
from cronos.services import auth, document_extraction_service, document_ingestion_service, knowledge_service


class DocumentLibraryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        config.settings.configure(env="test", data_dir=self.root, log_dir=self.root / "logs")
        init_db()
        self.session = auth.create_owner("Alexandre", "senha-segura", "1234")
        self.owner_id = 1

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_import_textual_pdf_pages_chunks_citations_and_search(self) -> None:
        pdf = self.text_pdf(["Cronos aprende memoria permanente na pagina um.", "A biblioteca gera citacoes reais na pagina dois."])
        result = document_ingestion_service.import_pdf(self.owner_id, "manual-cronos.pdf", pdf)

        document = result["document"]
        source = result["source"]
        self.assertTrue(Path(source["stored_path"]).exists())
        self.assertEqual(source["file_hash"], __import__("hashlib").sha256(pdf).hexdigest())
        self.assertEqual(result["page_count"], 2)
        self.assertGreaterEqual(result["chunk_count"], 2)

        pages = knowledge_service.list_pages(self.owner_id, document["id"])
        self.assertEqual([page["page_number"] for page in pages], [1, 2])
        chunks = knowledge_service.list_chunks(self.owner_id, document["id"], {})
        self.assertEqual(chunks["total"], result["chunk_count"])
        for chunk in chunks["items"]:
            page = next(page for page in pages if page["id"] == chunk["page_id"])
            self.assertLessEqual(chunk["character_end"], len(page["text_content"]))
            self.assertEqual(chunk["normalized_text"], normalize_document_text(chunk["text_content"]))

        search = knowledge_service.search_library(self.owner_id, {"query": "citacoes reais", "limit": 5})
        self.assertEqual(search["total"], 1)
        item = search["items"][0]
        self.assertEqual(item["document"]["id"], document["id"])
        self.assertEqual(item["page"]["page_number"], 2)
        self.assertIn("manual-cronos.pdf - pagina 2", item["citation"]["citation_label"])

    def test_duplicate_import_resumes_existing_document_and_same_name_different_content(self) -> None:
        first = self.text_pdf(["Conteudo unico para duplicidade."])
        initial = document_ingestion_service.import_pdf(self.owner_id, "manual.pdf", first)
        duplicate = document_ingestion_service.import_pdf(self.owner_id, "manual.pdf", first)
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(duplicate["document"]["id"], initial["document"]["id"])
        self.assertGreater(duplicate["chunk_count"], 0)

        second = self.text_pdf(["Mesmo nome com conteudo diferente deve ser permitido."])
        result = document_ingestion_service.import_pdf(self.owner_id, "manual.pdf", second)
        self.assertEqual(result["document"]["filename"], "manual.pdf")

    def test_failed_duplicate_does_not_block_reprocess(self) -> None:
        blank = self.blank_pdf()
        failed = document_ingestion_service.import_pdf(self.owner_id, "scan.pdf", blank)
        self.assertEqual(failed["source"]["indexing_status"], "failed")
        retried = document_ingestion_service.import_pdf(self.owner_id, "scan.pdf", blank)
        self.assertFalse(retried.get("duplicate", False))
        self.assertNotEqual(retried["document"]["id"], failed["document"]["id"])

    def test_reindex_is_idempotent_and_preserves_file(self) -> None:
        result = document_ingestion_service.import_pdf(self.owner_id, "reindex.pdf", self.text_pdf(["Texto para reindexar."]))
        document_id = result["document"]["id"]
        stored_path = result["source"]["stored_path"]
        first = knowledge_service.reindex_document(self.owner_id, document_id)
        second = knowledge_service.reindex_document(self.owner_id, document_id)
        self.assertEqual(first["chunk_count"], second["chunk_count"])
        self.assertTrue(Path(stored_path).exists())
        active_chunks = knowledge_service.list_chunks(self.owner_id, document_id, {})
        deleted_chunks = knowledge_service.list_chunks(self.owner_id, document_id, {"include_deleted": True})
        self.assertEqual(active_chunks["total"], second["chunk_count"])
        self.assertGreaterEqual(deleted_chunks["total"], active_chunks["total"])

    def test_soft_delete_restore_and_owner_scope(self) -> None:
        result = document_ingestion_service.import_pdf(self.owner_id, "delete.pdf", self.text_pdf(["Documento restauravel."]))
        document_id = result["document"]["id"]
        deleted = knowledge_service.delete_document(self.owner_id, document_id)
        self.assertIsNotNone(deleted["deleted_at"])
        self.assertEqual(knowledge_service.list_documents(self.owner_id), [])
        self.assertEqual(knowledge_service.list_pages(self.owner_id, document_id, include_deleted=True)[0]["deleted_at"], deleted["deleted_at"])

        restored = knowledge_service.restore_document(self.owner_id, document_id)
        self.assertIsNone(restored["deleted_at"])
        self.assertEqual(len(knowledge_service.list_pages(self.owner_id, document_id)), 1)
        with self.assertRaises(CronosError) as cross_owner:
            knowledge_service.get_document(2, document_id)
        self.assertEqual(cross_owner.exception.code, "DOCUMENT_NOT_FOUND")

    def test_legacy_document_is_indexed_without_losing_text(self) -> None:
        with connect() as db:
            db.execute(
                "INSERT INTO documents (owner_id, filename, stored_path, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (1, "legado.pdf", "documents/legado.pdf", "[pagina 1]\nConteudo legado preservado.", utcnow().isoformat(), utcnow().isoformat()),
            )
        document_ingestion_service.ensure_legacy_documents_indexed()
        docs = knowledge_service.list_documents(self.owner_id)
        pages = knowledge_service.list_pages(self.owner_id, docs[0]["id"])
        self.assertEqual(pages[0]["page_number"], 1)
        self.assertIn("Conteudo legado preservado", pages[0]["text_content"])
        search = knowledge_service.search_library(self.owner_id, {"query": "legado preservado"})
        self.assertEqual(search["total"], 1)

    def test_validation_path_traversal_unsupported_missing_file_and_scanned_pdf(self) -> None:
        with self.assertRaises(CronosError) as traversal:
            document_ingestion_service.import_pdf(self.owner_id, "..\\evil.pdf", self.text_pdf(["x"]))
        self.assertEqual(traversal.exception.code, "DOCUMENT_VALIDATION_ERROR")

        with self.assertRaises(CronosError) as unsupported:
            document_ingestion_service.import_pdf(self.owner_id, "nota.txt", b"hello")
        self.assertEqual(unsupported.exception.code, "DOCUMENT_TYPE_UNSUPPORTED")

        blank = self.blank_pdf()
        scanned = document_ingestion_service.import_pdf(self.owner_id, "scan.pdf", blank)
        self.assertEqual(scanned["source"]["error_code"], "DOCUMENT_SCANNED_NO_TEXT")
        self.assertEqual(scanned["source"]["indexing_status"], "failed")

        missing = document_ingestion_service.import_pdf(self.owner_id, "missing.pdf", self.text_pdf(["Arquivo vai sumir."]))
        Path(missing["source"]["stored_path"]).unlink()
        with self.assertRaises(CronosError) as missing_error:
            knowledge_service.reindex_document(self.owner_id, missing["document"]["id"])
        self.assertEqual(missing_error.exception.code, "DOCUMENT_FILE_MISSING")

    def test_partial_page_failure_and_chunk_overlap(self) -> None:
        original = document_extraction_service.extract_pdf_pages

        def partial_extract(path: Path) -> dict:
            return {
                "pages": [
                    {"page_number": 1, "text": "A" * (knowledge_config.chunk_size + 300), "status": "completed", "error_message": None},
                    {"page_number": 2, "text": "", "status": "failed", "error_message": "Falha controlada"},
                ],
                "status": "partial",
                "code": None,
                "page_count": 2,
            }

        document_extraction_service.extract_pdf_pages = partial_extract
        try:
            result = document_ingestion_service.import_pdf(self.owner_id, "partial.pdf", self.text_pdf(["parcial"]))
        finally:
            document_extraction_service.extract_pdf_pages = original
        self.assertEqual(result["source"]["indexing_status"], "partial")
        chunks = knowledge_service.list_chunks(self.owner_id, result["document"]["id"], {})["items"]
        self.assertGreaterEqual(len(chunks), 2)
        self.assertGreater(chunks[0]["character_end"], chunks[1]["character_start"])

    def test_rollback_keeps_no_partial_records_or_full_content_in_audit(self) -> None:
        original = document_extraction_service.extract_pdf_pages

        def broken_extract(path: Path) -> dict:
            raise RuntimeError("conteudo sensivel completo nao deve ir para auditoria")

        document_extraction_service.extract_pdf_pages = broken_extract
        try:
            with self.assertRaises(RuntimeError):
                document_ingestion_service.import_pdf(self.owner_id, "broken.pdf", self.text_pdf(["segredo enorme"]))
        finally:
            document_extraction_service.extract_pdf_pages = original
        self.assertEqual(knowledge_service.list_documents(self.owner_id), [])
        with connect() as db:
            details = " ".join(row["detail"] or "" for row in db.execute("SELECT detail FROM audit_log").fetchall())
        self.assertNotIn("segredo enorme", details)

    def test_document_and_library_routes_expose_phase_3_contracts(self) -> None:
        imported = document_routes.handle_post(
            "/documents/import",
            self.session,
            file_payload=("routes.pdf", self.text_pdf(["Rotas de biblioteca pesquisavel."])),
        )
        document_id = imported["document"]["id"]
        listed = document_routes.handle_get("/documents", "", self.session)
        self.assertEqual(listed[0]["id"], document_id)
        loaded = document_routes.handle_get(f"/documents/{document_id}", "", self.session)
        self.assertEqual(loaded["document"]["id"], document_id)
        pages = document_routes.handle_get(f"/documents/{document_id}/pages", "", self.session)
        page = document_routes.handle_get(f"/documents/{document_id}/pages/1", "", self.session)
        self.assertEqual(pages[0]["id"], page["id"])
        chunks = document_routes.handle_get(f"/documents/{document_id}/chunks", "", self.session)
        chunk_id = chunks["items"][0]["id"]
        chunk = library_routes.handle_get(f"/document-chunks/{chunk_id}", "", self.session)
        self.assertEqual(chunk["id"], chunk_id)
        search = library_routes.handle_get("/library/search", "query=biblioteca", self.session)
        self.assertEqual(search["total"], 1)
        reindexed = document_routes.handle_post(f"/documents/{document_id}/reindex", self.session)
        self.assertEqual(reindexed["document"]["id"], document_id)
        deleted = document_routes.handle_delete(f"/documents/{document_id}", self.session)
        self.assertIsNotNone(deleted["deleted_at"])
        restored = document_routes.handle_post(f"/documents/{document_id}/restore", self.session)
        self.assertIsNone(restored["deleted_at"])

    def text_pdf(self, pages: list[str]) -> bytes:
        path = self.root / f"test-{len(pages)}-{abs(hash(tuple(pages)))}.pdf"
        pdf = canvas.Canvas(str(path))
        for text in pages:
            pdf.drawString(72, 720, text)
            pdf.showPage()
        pdf.save()
        return path.read_bytes()

    def blank_pdf(self) -> bytes:
        path = self.root / "blank.pdf"
        writer = PdfWriter()
        writer.add_blank_page(width=200, height=200)
        with path.open("wb") as handle:
            writer.write(handle)
        return path.read_bytes()


if __name__ == "__main__":
    unittest.main()
