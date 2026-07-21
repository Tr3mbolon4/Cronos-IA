import sqlite3
from typing import Any


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def create_document(db: sqlite3.Connection, payload: dict) -> dict:
    cursor = db.execute(
        """
        INSERT INTO documents (owner_id, filename, stored_path, text, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            payload["owner_id"],
            payload["filename"],
            payload["stored_path"],
            payload["text"],
            payload["created_at"],
            payload["updated_at"],
        ),
    )
    return get_document(db, payload["owner_id"], cursor.lastrowid, include_deleted=True)


def update_document(db: sqlite3.Connection, owner_id: int, document_id: int, updates: dict) -> dict:
    assignments = [f"{key} = ?" for key in updates]
    db.execute(
        f"UPDATE documents SET {', '.join(assignments)} WHERE owner_id = ? AND id = ?",
        [*updates.values(), owner_id, document_id],
    )
    return get_document(db, owner_id, document_id, include_deleted=True)


def get_document(db: sqlite3.Connection, owner_id: int, document_id: int, *, include_deleted: bool = False) -> dict | None:
    sql = "SELECT * FROM documents WHERE owner_id = ? AND id = ?"
    params: list[Any] = [owner_id, document_id]
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    return row_to_dict(db.execute(sql, params).fetchone())


def list_documents(db: sqlite3.Connection, owner_id: int, *, include_deleted: bool = False) -> list[dict]:
    sql = "SELECT id, filename, stored_path, created_at, updated_at, deleted_at FROM documents WHERE owner_id = ?"
    params: list[Any] = [owner_id]
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    sql += " ORDER BY id DESC"
    return [dict(row) for row in db.execute(sql, params).fetchall()]


def record_audit(db: sqlite3.Connection, action: str, detail: str | None = None) -> None:
    from cronos.core.security import utcnow

    db.execute(
        "INSERT INTO audit_log (action, detail, created_at) VALUES (?, ?, ?)",
        (action, detail, utcnow().isoformat()),
    )
