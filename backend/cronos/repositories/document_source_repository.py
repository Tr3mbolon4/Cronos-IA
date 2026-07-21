import sqlite3
from typing import Any


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def create_source(db: sqlite3.Connection, payload: dict) -> dict:
    cursor = db.execute(
        """
        INSERT INTO document_sources (
            owner_id, document_id, source_type, original_filename, stored_filename,
            original_path, stored_path, mime_type, file_size, file_hash, page_count,
            language, extraction_status, indexing_status, error_code, error_message,
            created_at, updated_at, indexed_at, deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            payload["owner_id"],
            payload["document_id"],
            payload["source_type"],
            payload["original_filename"],
            payload.get("stored_filename"),
            payload.get("original_path"),
            payload.get("stored_path"),
            payload.get("mime_type"),
            payload.get("file_size", 0),
            payload.get("file_hash"),
            payload.get("page_count", 0),
            payload.get("language"),
            payload["extraction_status"],
            payload["indexing_status"],
            payload.get("error_code"),
            payload.get("error_message"),
            payload["created_at"],
            payload["updated_at"],
            payload.get("indexed_at"),
        ),
    )
    return get_source(db, payload["owner_id"], cursor.lastrowid, include_deleted=True)


def get_source(db: sqlite3.Connection, owner_id: int, source_id: int, *, include_deleted: bool = False) -> dict | None:
    sql = "SELECT * FROM document_sources WHERE owner_id = ? AND id = ?"
    params: list[Any] = [owner_id, source_id]
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    return row_to_dict(db.execute(sql, params).fetchone())


def get_source_for_document(db: sqlite3.Connection, owner_id: int, document_id: int, *, include_deleted: bool = False) -> dict | None:
    sql = "SELECT * FROM document_sources WHERE owner_id = ? AND document_id = ?"
    params: list[Any] = [owner_id, document_id]
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    sql += " ORDER BY id DESC LIMIT 1"
    return row_to_dict(db.execute(sql, params).fetchone())


def find_duplicate(db: sqlite3.Connection, owner_id: int, file_hash: str) -> dict | None:
    return row_to_dict(
        db.execute(
            """
            SELECT s.*, d.filename AS document_title
            FROM document_sources s
            JOIN documents d ON d.id = s.document_id
            WHERE s.owner_id = ? AND s.file_hash = ? AND s.deleted_at IS NULL AND d.deleted_at IS NULL
            ORDER BY s.id DESC LIMIT 1
            """,
            (owner_id, file_hash),
        ).fetchone()
    )


def update_source(db: sqlite3.Connection, owner_id: int, source_id: int, updates: dict) -> dict:
    assignments = [f"{key} = ?" for key in updates]
    db.execute(
        f"UPDATE document_sources SET {', '.join(assignments)} WHERE owner_id = ? AND id = ?",
        [*updates.values(), owner_id, source_id],
    )
    return get_source(db, owner_id, source_id, include_deleted=True)


def soft_delete_sources_for_document(db: sqlite3.Connection, owner_id: int, document_id: int, deleted_at: str) -> None:
    db.execute(
        "UPDATE document_sources SET deleted_at = ?, updated_at = ? WHERE owner_id = ? AND document_id = ? AND deleted_at IS NULL",
        (deleted_at, deleted_at, owner_id, document_id),
    )


def restore_sources_for_document(db: sqlite3.Connection, owner_id: int, document_id: int, deleted_at: str, restored_at: str) -> None:
    db.execute(
        "UPDATE document_sources SET deleted_at = NULL, updated_at = ? WHERE owner_id = ? AND document_id = ? AND deleted_at = ?",
        (restored_at, owner_id, document_id, deleted_at),
    )
