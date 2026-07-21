import sqlite3
from typing import Any


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def create_page(db: sqlite3.Connection, payload: dict) -> dict:
    cursor = db.execute(
        """
        INSERT INTO document_pages (
            owner_id, document_id, source_id, page_number, text_content,
            normalized_text, character_count, extraction_status, error_message,
            created_at, updated_at, deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            payload["owner_id"],
            payload["document_id"],
            payload["source_id"],
            payload["page_number"],
            payload["text_content"],
            payload["normalized_text"],
            payload["character_count"],
            payload["extraction_status"],
            payload.get("error_message"),
            payload["created_at"],
            payload["updated_at"],
        ),
    )
    return get_page(db, payload["owner_id"], cursor.lastrowid, include_deleted=True)


def get_page(db: sqlite3.Connection, owner_id: int, page_id: int, *, include_deleted: bool = False) -> dict | None:
    sql = "SELECT * FROM document_pages WHERE owner_id = ? AND id = ?"
    params: list[Any] = [owner_id, page_id]
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    return row_to_dict(db.execute(sql, params).fetchone())


def get_page_by_number(db: sqlite3.Connection, owner_id: int, document_id: int, page_number: int, *, include_deleted: bool = False) -> dict | None:
    sql = "SELECT * FROM document_pages WHERE owner_id = ? AND document_id = ? AND page_number = ?"
    params: list[Any] = [owner_id, document_id, page_number]
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    return row_to_dict(db.execute(sql, params).fetchone())


def list_pages(db: sqlite3.Connection, owner_id: int, document_id: int, *, include_deleted: bool = False) -> list[dict]:
    sql = "SELECT * FROM document_pages WHERE owner_id = ? AND document_id = ?"
    params: list[Any] = [owner_id, document_id]
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    sql += " ORDER BY page_number ASC"
    return [dict(row) for row in db.execute(sql, params).fetchall()]


def soft_delete_pages_for_document(db: sqlite3.Connection, owner_id: int, document_id: int, deleted_at: str) -> None:
    db.execute(
        "UPDATE document_pages SET deleted_at = ?, updated_at = ? WHERE owner_id = ? AND document_id = ? AND deleted_at IS NULL",
        (deleted_at, deleted_at, owner_id, document_id),
    )


def restore_pages_for_document(db: sqlite3.Connection, owner_id: int, document_id: int, deleted_at: str, restored_at: str) -> None:
    db.execute(
        "UPDATE document_pages SET deleted_at = NULL, updated_at = ? WHERE owner_id = ? AND document_id = ? AND deleted_at = ?",
        (restored_at, owner_id, document_id, deleted_at),
    )
