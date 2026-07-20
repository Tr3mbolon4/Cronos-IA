import sqlite3
from contextlib import contextmanager
from pathlib import Path

from cronos.core.config import settings


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
