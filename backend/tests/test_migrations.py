import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from cronos.core import config
from cronos.core.db import init_db
from cronos.core.security import hash_secret, utcnow
from cronos.services import migration_service
from cronos.services.migration_service import MigrationError, apply_migrations


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.original_data_dir = config.settings.data_dir
        self.original_log_dir = config.settings.log_dir
        self.original_env = config.settings.env
        config.settings.configure(env="development", data_dir=Path(self.tempdir.name))

    def tearDown(self):
        config.settings.configure(
            env=self.original_env,
            data_dir=self.original_data_dir,
            log_dir=self.original_log_dir,
        )
        self.tempdir.cleanup()

    def test_migrates_legacy_0_1_database_without_data_loss(self):
        db_path = config.settings.db_path
        self._create_legacy_database(db_path)

        result = apply_migrations(db_path)

        self.assertEqual(result.applied, ["0001_base_schema", "0002_memory_knowledge_schema"])
        self.assertIsNotNone(result.backup_path)
        self.assertTrue(result.backup_path.exists())
        with closing(sqlite3.connect(db_path)) as connection:
            owner = connection.execute("SELECT name FROM owner WHERE id = 1").fetchone()[0]
            document_count = connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
            migrations = {
                row[0] for row in connection.execute("SELECT version FROM schema_migrations").fetchall()
            }
            categories = connection.execute("SELECT COUNT(*) FROM memory_categories").fetchone()[0]
            memory_tables = connection.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'memories'"
            ).fetchone()[0]

        self.assertEqual(owner, "Alexandre")
        self.assertEqual(document_count, 1)
        self.assertIn("0001_base_schema", migrations)
        self.assertIn("0002_memory_knowledge_schema", migrations)
        self.assertEqual(categories, 10)
        self.assertEqual(memory_tables, 1)

    def test_init_db_is_idempotent_after_migrations(self):
        init_db()
        first_backups = self._migration_backups()
        init_db()
        second_backups = self._migration_backups()

        self.assertEqual(first_backups, second_backups)
        with closing(sqlite3.connect(config.settings.db_path)) as connection:
            count = connection.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
        self.assertEqual(count, 2)

    def test_failed_migration_creates_backup_and_keeps_legacy_data(self):
        db_path = config.settings.db_path
        self._create_legacy_database(db_path)
        original_migrations = migration_service.MIGRATIONS
        migration_service.MIGRATIONS = [
            *original_migrations,
            {"version": "9999_broken", "description": "Broken migration", "sql": "CREATE TABLE broken ("},
        ]
        try:
            with self.assertRaises(MigrationError):
                apply_migrations(db_path)
        finally:
            migration_service.MIGRATIONS = original_migrations

        backups = self._migration_backups()
        self.assertEqual(len(backups), 1)
        with closing(sqlite3.connect(db_path)) as connection:
            owner = connection.execute("SELECT name FROM owner WHERE id = 1").fetchone()[0]
            broken = connection.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'broken'"
            ).fetchone()[0]
        self.assertEqual(owner, "Alexandre")
        self.assertEqual(broken, 0)

    def _migration_backups(self) -> list[Path]:
        backup_dir = config.settings.backups_dir / "database-migrations"
        if not backup_dir.exists():
            return []
        return sorted(backup_dir.glob("*.db"))

    def _create_legacy_database(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(db_path)) as connection:
            connection.executescript(
                """
                CREATE TABLE owner (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    pin_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE sessions (
                    token TEXT PRIMARY KEY,
                    owner_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    locked_at TEXT
                );
                CREATE TABLE messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    stored_path TEXT NOT NULL,
                    text TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action TEXT NOT NULL,
                    detail TEXT,
                    created_at TEXT NOT NULL
                );
                """
            )
            connection.execute(
                """
                INSERT INTO owner (id, name, password_hash, pin_hash, created_at)
                VALUES (1, ?, ?, ?, ?)
                """,
                ("Alexandre", hash_secret("senha-segura"), hash_secret("1234"), utcnow().isoformat()),
            )
            connection.execute(
                """
                INSERT INTO documents (filename, stored_path, text, created_at)
                VALUES (?, ?, ?, ?)
                """,
                ("manual.pdf", "documents/manual.pdf", "[pagina 1]\nConteudo legado", utcnow().isoformat()),
            )
            connection.commit()


if __name__ == "__main__":
    unittest.main()
