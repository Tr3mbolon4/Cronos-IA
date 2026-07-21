import os
import tempfile
import unittest
from pathlib import Path

from cronos.core.config import settings
from cronos.core.db import connect, init_db
from cronos.core.errors import CronosError
from cronos.api import memory_routes
from cronos.repositories import memory_repository
from cronos.services import auth, memory_relation_service, memory_service


class MemoryTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["CRONOS_ENV"] = "test"
        settings.configure(env="test", data_dir=Path(self.tmp.name), log_dir=Path(self.tmp.name) / "logs")
        settings.ensure_directories()
        init_db()
        auth.create_owner("Alexandre", "senha-segura", "1234")
        self.owner_id = 1
        self.session = auth.login("senha-segura", "1234")
        self.category_id = memory_service.list_categories()[0]["id"]

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def create_memory(self, **overrides: object) -> dict:
        payload = {
            "title": "Preferencia de interface",
            "content": "Alexandre prefere tema escuro com azul neon.",
            "category_id": self.category_id,
            "source_type": "manual",
            "confidence": 0.9,
            "importance": 4,
        }
        payload.update(overrides)
        return memory_service.create_memory(self.owner_id, payload)

    def test_memory_lifecycle_filters_revisions_and_audit(self) -> None:
        memory = self.create_memory()
        self.assertEqual(memory["status"], "active")

        listed = memory_service.list_memories(
            self.owner_id,
            {
                "search": "azul neon",
                "category_id": str(self.category_id),
                "status": "active",
                "minimum_confidence": "0.8",
                "minimum_importance": "3",
            },
        )
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["id"], memory["id"])

        updated = memory_service.update_memory(
            self.owner_id,
            memory["id"],
            {"content": "Alexandre prefere uma interface escura e segura.", "importance": 5, "change_reason": "ajuste aprovado"},
        )
        self.assertEqual(updated["importance"], 5)
        revisions = memory_service.list_revisions(self.owner_id, memory["id"])
        self.assertEqual(len(revisions), 1)
        self.assertIn("content", revisions[0]["changed_fields"])

        archived = memory_service.archive_memory(self.owner_id, memory["id"])
        self.assertEqual(archived["status"], "archived")
        restored_active = memory_service.activate_memory(self.owner_id, memory["id"])
        self.assertEqual(restored_active["status"], "active")

        deleted = memory_service.delete_memory(self.owner_id, memory["id"])
        self.assertEqual(deleted["status"], "deleted")
        self.assertIsNotNone(deleted["deleted_at"])
        self.assertEqual(memory_service.list_memories(self.owner_id, {})["total"], 0)
        self.assertEqual(memory_service.list_memories(self.owner_id, {"include_deleted": True})["total"], 1)

        restored = memory_service.restore_memory(self.owner_id, memory["id"])
        self.assertEqual(restored["status"], "active")
        self.assertIsNone(restored["deleted_at"])

        with connect() as db:
            actions = [row["action"] for row in db.execute("SELECT action FROM audit_log").fetchall()]
        self.assertIn("memory.created", actions)
        self.assertIn("memory.updated", actions)
        self.assertIn("memory.deleted", actions)
        self.assertIn("memory.restored", actions)

    def test_memory_validation_errors_are_structured(self) -> None:
        cases = [
            ({"confidence": 2}, "MEMORY_VALIDATION_ERROR"),
            ({"importance": 9}, "MEMORY_VALIDATION_ERROR"),
            ({"status": "ativa"}, "MEMORY_VALIDATION_ERROR"),
            ({"category_id": 999}, "MEMORY_CATEGORY_NOT_FOUND"),
        ]
        for overrides, code in cases:
            with self.subTest(overrides=overrides):
                with self.assertRaises(CronosError) as raised:
                    self.create_memory(**overrides)
                self.assertEqual(raised.exception.code, code)

    def test_pending_review_for_low_confidence_automatic_memory(self) -> None:
        memory = self.create_memory(source_type="document", confidence=0.4)
        self.assertEqual(memory["status"], "pending_review")

    def test_memory_relations_validate_duplicates_self_cross_owner_and_delete(self) -> None:
        source = self.create_memory(title="Fonte", content="Memoria fonte.")
        target = self.create_memory(title="Alvo", content="Memoria alvo.")
        relation = memory_relation_service.create_relation(
            self.owner_id,
            {
                "source_memory_id": source["id"],
                "target_memory_id": target["id"],
                "relation_type": "related_to",
                "strength": 0.8,
                "description": "Contexto compartilhado",
            },
        )
        self.assertEqual(relation["relation_type"], "related_to")
        self.assertEqual(len(memory_relation_service.list_relations(self.owner_id, source["id"])), 1)

        with self.assertRaises(CronosError) as duplicate:
            memory_relation_service.create_relation(
                self.owner_id,
                {"source_memory_id": source["id"], "target_memory_id": target["id"], "relation_type": "related_to"},
            )
        self.assertEqual(duplicate.exception.code, "MEMORY_RELATION_DUPLICATE")

        with self.assertRaises(CronosError) as self_relation:
            memory_relation_service.create_relation(
                self.owner_id,
                {"source_memory_id": source["id"], "target_memory_id": source["id"], "relation_type": "depends_on"},
            )
        self.assertEqual(self_relation.exception.code, "MEMORY_RELATION_INVALID")

        with self.assertRaises(CronosError) as cross_owner:
            memory_relation_service.create_relation(
                2,
                {"source_memory_id": source["id"], "target_memory_id": target["id"], "relation_type": "depends_on"},
            )
        self.assertEqual(cross_owner.exception.code, "MEMORY_RELATION_INVALID")

        deleted = memory_relation_service.delete_relation(self.owner_id, relation["id"])
        self.assertIsNotNone(deleted["deleted_at"])
        recreated = memory_relation_service.create_relation(
            self.owner_id,
            {"source_memory_id": source["id"], "target_memory_id": target["id"], "relation_type": "related_to"},
        )
        self.assertNotEqual(recreated["id"], relation["id"])

    def test_relation_validation_rejects_invalid_type_and_strength(self) -> None:
        source = self.create_memory(title="Fonte", content="Memoria fonte.")
        target = self.create_memory(title="Alvo", content="Memoria alvo.")
        with self.assertRaises(CronosError) as invalid_type:
            memory_relation_service.create_relation(
                self.owner_id,
                {"source_memory_id": source["id"], "target_memory_id": target["id"], "relation_type": "bloqueia"},
            )
        self.assertEqual(invalid_type.exception.code, "MEMORY_RELATION_INVALID")

        with self.assertRaises(CronosError) as invalid_strength:
            memory_relation_service.create_relation(
                self.owner_id,
                {"source_memory_id": source["id"], "target_memory_id": target["id"], "relation_type": "depends_on", "strength": 2},
            )
        self.assertEqual(invalid_strength.exception.code, "MEMORY_RELATION_INVALID")

    def test_failed_update_rolls_back_revision_and_memory_changes(self) -> None:
        memory = self.create_memory()
        original_record_audit = memory_repository.record_audit

        def fail_audit(*args: object, **kwargs: object) -> None:
            raise RuntimeError("audit failure")

        memory_repository.record_audit = fail_audit
        try:
            with self.assertRaises(RuntimeError):
                memory_service.update_memory(self.owner_id, memory["id"], {"title": "Nao deve persistir"})
        finally:
            memory_repository.record_audit = original_record_audit

        unchanged = memory_service.get_memory(self.owner_id, memory["id"])
        self.assertEqual(unchanged["title"], memory["title"])
        self.assertEqual(memory_service.list_revisions(self.owner_id, memory["id"]), [])

    def test_revision_failure_uses_structured_error_and_rolls_back(self) -> None:
        memory = self.create_memory()
        original_create_revision = memory_repository.create_revision

        def fail_revision(*args: object, **kwargs: object) -> None:
            raise RuntimeError("revision failure")

        memory_repository.create_revision = fail_revision
        try:
            with self.assertRaises(CronosError) as raised:
                memory_service.update_memory(self.owner_id, memory["id"], {"title": "Nao deve persistir"})
        finally:
            memory_repository.create_revision = original_create_revision

        self.assertEqual(raised.exception.code, "MEMORY_REVISION_ERROR")
        unchanged = memory_service.get_memory(self.owner_id, memory["id"])
        self.assertEqual(unchanged["title"], memory["title"])

    def test_memory_routes_expose_required_api_contract(self) -> None:
        categories = memory_routes.handle_get("/memory/categories", "", self.session)
        category_id = categories[0]["id"]
        created = memory_routes.handle_post(
            "/memories",
            {
                "title": "Contrato HTTP",
                "content": "As rotas de memoria respondem pelos endpoints da Fase 2.",
                "category_id": category_id,
            },
            self.session,
        )
        listed = memory_routes.handle_get("/memories", "search=contrato&limit=10&offset=0", self.session)
        self.assertEqual(listed["total"], 1)
        loaded = memory_routes.handle_get(f"/memories/{created['id']}", "", self.session)
        self.assertEqual(loaded["title"], "Contrato HTTP")

        patched = memory_routes.handle_patch(f"/memories/{created['id']}", {"status": "pending_review"}, self.session)
        self.assertEqual(patched["status"], "pending_review")
        archived = memory_routes.handle_post(f"/memories/{created['id']}/archive", {}, self.session)
        self.assertEqual(archived["status"], "archived")
        restored = memory_routes.handle_post(f"/memories/{created['id']}/restore", {}, self.session)
        self.assertEqual(restored["status"], "active")

        other = self.create_memory(title="Outra memoria", content="Destino de relacao.")
        relation = memory_routes.handle_post(
            "/memory-relations",
            {"source_memory_id": created["id"], "target_memory_id": other["id"], "relation_type": "part_of"},
            self.session,
        )
        relations = memory_routes.handle_get(f"/memories/{created['id']}/relations", "", self.session)
        self.assertEqual(relations[0]["id"], relation["id"])
        updated_relation = memory_routes.handle_patch(f"/memory-relations/{relation['id']}", {"strength": 0.5}, self.session)
        self.assertEqual(updated_relation["strength"], 0.5)
        deleted_relation = memory_routes.handle_delete(f"/memory-relations/{relation['id']}", self.session)
        self.assertIsNotNone(deleted_relation["deleted_at"])

        deleted = memory_routes.handle_delete(f"/memories/{created['id']}", self.session)
        self.assertEqual(deleted["status"], "deleted")
        revisions = memory_routes.handle_get(f"/memories/{created['id']}/revisions", "", self.session)
        self.assertGreaterEqual(len(revisions), 1)


if __name__ == "__main__":
    unittest.main()
