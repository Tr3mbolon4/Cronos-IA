import sqlite3
from contextlib import contextmanager
from pathlib import Path

from cronos.core.config import settings
from cronos.core.security import hash_secret, utcnow


@contextmanager
def connect():
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.documents_dir.mkdir(parents=True, exist_ok=True)
    settings.backups_dir.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(settings.db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db(db_path: Path | None = None) -> None:
    if db_path is not None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS owner (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                pin_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                owner_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                locked_at TEXT,
                FOREIGN KEY(owner_id) REFERENCES owner(id)
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                stored_path TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                detail TEXT,
                created_at TEXT NOT NULL
            );
            """
        )
    if settings.is_visual_test:
        seed_visual_test_owner()


def seed_visual_test_owner() -> None:
    import os

    password = os.environ.get("CRONOS_VISUAL_TEST_PASSWORD")
    pin = os.environ.get("CRONOS_VISUAL_TEST_PIN")
    if not password or not pin:
        return
    if len(password) < 8 or len(pin) < 4 or not pin.isdigit():
        raise RuntimeError("Credenciais visuais invalidas: use senha >= 8 caracteres e PIN numerico >= 4.")
    with connect() as db:
        existing = db.execute("SELECT id FROM owner WHERE id = 1").fetchone()
        if existing:
            return
        db.execute(
            """
            INSERT INTO owner (id, name, password_hash, pin_hash, created_at)
            VALUES (1, ?, ?, ?, ?)
            """,
            ("Alexandre", hash_secret(password), hash_secret(pin), utcnow().isoformat()),
        )
        db.execute(
            "INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)",
            ("assistant", "Ambiente visual-test: dados demonstrativos isolados para validacao visual.", utcnow().isoformat()),
        )
