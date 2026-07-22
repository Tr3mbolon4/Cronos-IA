import json
import tempfile
import unittest
from pathlib import Path

from cronos.api import library_routes
from cronos.core import config
from cronos.core.db import connect, init_db
from cronos.core.errors import CronosError
from cronos.core.retrieval_config import retrieval_config
from cronos.core.security import utcnow
from cronos.repositories import retrieval_repository
from cronos.services import auth, embedding_service, retrieval_service
from cronos.services.embedding_provider import DeterministicEmbeddingProvider, LlamaCppEmbeddingProvider, LocalSemanticEmbeddingProvider


class RetrievalTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        config.settings.configure(env="test", data_dir=Path(self.tempdir.name), log_dir=Path(self.tempdir.name) / "logs")
        init_db()
        self.session = auth.create_owner("Alexandre", "senha-segura", "1234")
        self.owner_id = 1
        embedding_service.set_provider_for_tests(DeterministicEmbeddingProvider())
        self.doc1 = self.seed_document(
            "manual.pdf",
            ["cronos biblioteca memoria conhecimento", "procedimento seguro de backup local"],
        )
        self.doc2 = self.seed_document(
            "redes.pdf",
            ["redes computadores tcp ip roteamento", "seguranca firewall autenticacao"],
        )

    def tearDown(self) -> None:
        embedding_service.set_provider_for_tests(None)
        self.tempdir.cleanup()

    def test_01_lexical_retrieval_returns_chunk(self) -> None:
        result = retrieval_service.retrieve(self.owner_id, {"query": "biblioteca memoria"})
        self.assertGreater(result["total"], 0)
        self.assertEqual(result["items"][0]["document"]["filename"], "manual.pdf")

    def test_02_fallback_when_provider_unavailable(self) -> None:
        embedding_service.set_provider_for_tests(DeterministicEmbeddingProvider(available=False))
        result = retrieval_service.retrieve(self.owner_id, {"query": "backup local"})
        self.assertGreater(result["total"], 0)
        self.assertFalse(result["provider"]["available"])
        self.assertEqual(result["mode"], "lexical")

    def test_03_empty_result(self) -> None:
        result = retrieval_service.retrieve(self.owner_id, {"query": "termo inexistente absoluto"})
        self.assertEqual(result["total"], 0)

    def test_04_empty_query_rejected(self) -> None:
        with self.assertRaises(CronosError) as raised:
            retrieval_service.retrieve(self.owner_id, {"query": ""})
        self.assertEqual(raised.exception.code, "DOCUMENT_VALIDATION_ERROR")

    def test_05_index_rebuild_creates_embeddings(self) -> None:
        result = retrieval_service.rebuild_index(self.owner_id, {"force": True})
        self.assertTrue(result["provider_available"])
        self.assertEqual(result["indexed"], 4)

    def test_06_incremental_rebuild_skips_existing_embeddings(self) -> None:
        retrieval_service.rebuild_index(self.owner_id, {"force": True})
        result = retrieval_service.rebuild_index(self.owner_id, {})
        self.assertEqual(result["indexed"], 0)
        self.assertEqual(result["skipped"], 4)

    def test_07_force_rebuild_updates_without_duplicates(self) -> None:
        retrieval_service.rebuild_index(self.owner_id, {"force": True})
        retrieval_service.rebuild_index(self.owner_id, {"force": True})
        with connect() as db:
            count = db.execute("SELECT COUNT(*) FROM document_embeddings").fetchone()[0]
        self.assertEqual(count, 4)

    def test_08_status_reports_pending_and_embeddings(self) -> None:
        before = retrieval_service.index_status(self.owner_id)
        self.assertEqual(before["chunks"], 4)
        retrieval_service.rebuild_index(self.owner_id, {"force": True})
        after = retrieval_service.index_status(self.owner_id)
        self.assertEqual(after["pending"], 0)
        self.assertEqual(after["embeddings"], 4)
        self.assertEqual(after["mode"], "hybrid")

    def test_09_providers_include_fallback(self) -> None:
        providers = retrieval_service.providers()
        names = {provider["provider"] for provider in providers}
        self.assertIn("lexical-only", names)

    def test_10_semantic_score_is_returned_after_index(self) -> None:
        retrieval_service.rebuild_index(self.owner_id, {"force": True})
        result = retrieval_service.retrieve(self.owner_id, {"query": "cronos memoria"})
        self.assertGreater(result["items"][0]["score_semantic"], 0)
        self.assertEqual(result["mode"], "hybrid")

    def test_11_reranking_prefers_stronger_lexical_match(self) -> None:
        result = retrieval_service.retrieve(self.owner_id, {"query": "redes computadores tcp"})
        self.assertEqual(result["items"][0]["document"]["filename"], "redes.pdf")

    def test_12_document_filter(self) -> None:
        result = retrieval_service.retrieve(self.owner_id, {"query": "seguranca", "filters": {"document_id": self.doc2}})
        self.assertEqual(result["items"][0]["document"]["filename"], "redes.pdf")

    def test_13_page_filter(self) -> None:
        result = retrieval_service.retrieve(self.owner_id, {"query": "backup", "filters": {"page_number": 2}})
        self.assertEqual(result["items"][0]["page"]["page_number"], 2)

    def test_14_top_k_is_respected(self) -> None:
        result = retrieval_service.retrieve(self.owner_id, {"query": "cronos redes seguranca backup", "top_k": 1})
        self.assertEqual(len(result["items"]), 1)

    def test_15_top_k_is_clamped(self) -> None:
        result = retrieval_service.retrieve(self.owner_id, {"query": "cronos", "top_k": 999})
        self.assertLessEqual(result["top_k"], retrieval_config.max_top_k)

    def test_16_citation_shape(self) -> None:
        item = retrieval_service.retrieve(self.owner_id, {"query": "roteamento"})["items"][0]
        citation = item["citation"]
        self.assertIn("citation_label", citation)
        self.assertEqual(citation["page_number"], 1)

    def test_17_route_retrieve(self) -> None:
        result = library_routes.handle_post("/library/retrieve", {"query": "biblioteca"}, self.session)
        self.assertGreater(result["total"], 0)

    def test_18_route_index_status(self) -> None:
        status = library_routes.handle_get("/library/index/status", "", self.session)
        self.assertIn("chunks", status)

    def test_19_route_providers(self) -> None:
        providers = library_routes.handle_get("/library/index/providers", "", self.session)
        self.assertGreaterEqual(len(providers), 2)

    def test_20_route_rebuild(self) -> None:
        result = library_routes.handle_post("/library/index/rebuild", {"force": True}, self.session)
        self.assertEqual(result["indexed"], 4)

    def test_21_provider_swap_changes_model(self) -> None:
        embedding_service.set_provider_for_tests(DeterministicEmbeddingProvider(model_name="provider-a"))
        first = retrieval_service.rebuild_index(self.owner_id, {"force": True})
        embedding_service.set_provider_for_tests(DeterministicEmbeddingProvider(model_name="provider-b"))
        second = retrieval_service.rebuild_index(self.owner_id, {"force": True})
        self.assertEqual(first["indexed"], 4)
        self.assertEqual(second["indexed"], 4)

    def test_22_unavailable_model_does_not_index(self) -> None:
        embedding_service.set_provider_for_tests(DeterministicEmbeddingProvider(available=False))
        result = retrieval_service.rebuild_index(self.owner_id, {"force": True})
        self.assertFalse(result["provider_available"])

    def test_23_legacy_document_chunks_remain_searchable(self) -> None:
        legacy = self.seed_document("legado.pdf", ["conteudo legado pesquisavel"], source_type="legacy_import")
        result = retrieval_service.retrieve(self.owner_id, {"query": "legado pesquisavel", "filters": {"document_id": legacy}})
        self.assertEqual(result["total"], 1)

    def test_24_cross_owner_cannot_retrieve(self) -> None:
        result = retrieval_service.retrieve(2, {"query": "biblioteca"})
        self.assertEqual(result["total"], 0)

    def test_25_embedding_values_are_not_written_to_audit(self) -> None:
        retrieval_service.rebuild_index(self.owner_id, {"force": True})
        with connect() as db:
            details = " ".join(row["detail"] or "" for row in db.execute("SELECT detail FROM audit_log").fetchall())
            embedding = db.execute("SELECT embedding FROM document_embeddings LIMIT 1").fetchone()["embedding"]
        self.assertNotIn(embedding[:20], details)

    def test_26_retrieval_repository_upsert_is_idempotent(self) -> None:
        chunk = self.first_chunk()
        payload = {
            "document_id": chunk["document_id"],
            "chunk_id": chunk["id"],
            "provider": "test",
            "model": "model",
            "dimension": 2,
            "embedding": "[1,0]",
            "embedding_hash": "hash",
            "created_at": utcnow().isoformat(),
            "updated_at": utcnow().isoformat(),
        }
        with connect() as db:
            retrieval_repository.upsert_embedding(db, payload)
            retrieval_repository.upsert_embedding(db, payload)
            count = db.execute("SELECT COUNT(*) FROM document_embeddings WHERE provider = 'test'").fetchone()[0]
        self.assertEqual(count, 1)

    def test_27_semantic_only_result_can_surface(self) -> None:
        class SynonymProvider(DeterministicEmbeddingProvider):
            def _embed(self, text: str) -> list[float]:
                if "automovel" in text.lower() or "carro" in text.lower():
                    return [1.0, 0.0]
                return [0.0, 1.0]

        self.seed_document("auto.pdf", ["carro eletrico silencioso"])
        embedding_service.set_provider_for_tests(SynonymProvider(dimension=2))
        retrieval_service.rebuild_index(self.owner_id, {"force": True})
        result = retrieval_service.retrieve(self.owner_id, {"query": "automovel"})
        self.assertGreater(result["total"], 0)
        self.assertGreater(result["items"][0]["score_semantic"], 0)

    def test_28_runtime_provider_failure_falls_back_to_lexical(self) -> None:
        class FailingProvider(DeterministicEmbeddingProvider):
            def embed_documents(self, texts):
                raise RuntimeError("falha controlada do provider")

            def embed_query(self, text: str) -> list[float]:
                raise RuntimeError("falha controlada do provider")

        embedding_service.set_provider_for_tests(FailingProvider(dimension=384))
        rebuilt = retrieval_service.rebuild_index(self.owner_id, {"force": True})
        self.assertFalse(rebuilt["provider_available"])
        result = retrieval_service.retrieve(self.owner_id, {"query": "biblioteca memoria"})
        self.assertGreater(result["total"], 0)
        self.assertEqual(result["items"][0]["score_semantic"], 0)
        self.assertEqual(result["mode"], "lexical")

    def test_29_available_provider_reports_expected_dimension_384(self) -> None:
        embedding_service.set_provider_for_tests(DeterministicEmbeddingProvider(dimension=384))
        status = retrieval_service.providers()[0]
        self.assertTrue(status["available"])
        self.assertEqual(status["dimension"], 384)

    def test_30_local_semantic_provider_loads_packaged_model_offline(self) -> None:
        provider = LocalSemanticEmbeddingProvider(
            retrieval_config.model_name,
            retrieval_config.expected_dimension,
            retrieval_config.packaged_model_dir,
        )
        provider.initialize()
        self.assertTrue(provider.is_available(), provider.health().get("error"))
        self.assertEqual(provider.dimension(), 384)
        self.assertEqual(len(provider.embed_query("cronos memoria biblioteca")), 384)
        self.assertTrue(provider.health()["model_path"])

    def test_31_local_semantic_missing_model_reports_unavailable(self) -> None:
        provider = LocalSemanticEmbeddingProvider(
            retrieval_config.model_name,
            retrieval_config.expected_dimension,
            "models/missing/path with spaces",
        )
        provider.initialize()
        self.assertFalse(provider.is_available())
        self.assertIn("nao encontrado", provider.health()["error"])

    def test_32_incremental_indexing_avoids_duplicate_embeddings(self) -> None:
        embedding_service.set_provider_for_tests(DeterministicEmbeddingProvider(dimension=384))
        first = retrieval_service.rebuild_index(self.owner_id, {"force": True})
        second = retrieval_service.rebuild_index(self.owner_id, {})
        with connect() as db:
            count = db.execute("SELECT COUNT(*) FROM document_embeddings").fetchone()[0]
        self.assertEqual(first["indexed"], 4)
        self.assertEqual(second["indexed"], 0)
        self.assertEqual(second["skipped"], 4)
        self.assertEqual(count, 4)

    def test_33_llama_cpp_provider_projects_native_embedding_to_384(self) -> None:
        provider = LlamaCppEmbeddingProvider(384)
        projected = provider._to_persisted_dimension([float(index + 1) for index in range(1536)])
        self.assertEqual(len(projected), 384)
        self.assertAlmostEqual(sum(value * value for value in projected), 1.0, places=6)

    def seed_document(self, filename: str, pages: list[str], source_type: str = "upload") -> int:
        now = utcnow().isoformat()
        with connect() as db:
            cursor = db.execute(
                "INSERT INTO documents (owner_id, filename, stored_path, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (1, filename, f"documents/{filename}", "\n\n".join(pages), now, now),
            )
            document_id = cursor.lastrowid
            source_cursor = db.execute(
                """
                INSERT INTO document_sources (
                    owner_id, document_id, source_type, original_filename, stored_filename,
                    original_path, stored_path, mime_type, file_size, file_hash, page_count,
                    extraction_status, indexing_status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (1, document_id, source_type, filename, filename, None, f"documents/{filename}", "application/pdf", 10, f"hash-{document_id}", len(pages), "completed", "completed", now, now),
            )
            source_id = source_cursor.lastrowid
            for page_number, text in enumerate(pages, start=1):
                page_cursor = db.execute(
                    """
                    INSERT INTO document_pages (
                        owner_id, document_id, source_id, page_number, text_content,
                        normalized_text, character_count, extraction_status, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (1, document_id, source_id, page_number, text, text.lower(), len(text), "completed", now, now),
                )
                page_id = page_cursor.lastrowid
                db.execute(
                    """
                    INSERT INTO document_chunks (
                        owner_id, document_id, source_id, page_id, chunk_index, text_content,
                        normalized_text, character_start, character_end, token_estimate,
                        content_hash, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (1, document_id, source_id, page_id, page_number - 1, text, text.lower(), 0, len(text), max(1, len(text) // 4), f"chunk-{document_id}-{page_number}", now, now),
                )
        return document_id

    def first_chunk(self) -> dict:
        with connect() as db:
            return dict(db.execute("SELECT * FROM document_chunks ORDER BY id LIMIT 1").fetchone())


if __name__ == "__main__":
    unittest.main()
