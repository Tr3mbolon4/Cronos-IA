import sqlite3
from typing import Any


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def create_chunk(db: sqlite3.Connection, payload: dict) -> dict:
    cursor = db.execute(
        """
        INSERT INTO document_chunks (
            owner_id, document_id, source_id, page_id, chunk_index, text_content,
            normalized_text, character_start, character_end, token_estimate,
            content_hash, created_at, updated_at, deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            payload["owner_id"],
            payload["document_id"],
            payload["source_id"],
            payload["page_id"],
            payload["chunk_index"],
            payload["text_content"],
            payload["normalized_text"],
            payload["character_start"],
            payload["character_end"],
            payload["token_estimate"],
            payload["content_hash"],
            payload["created_at"],
            payload["updated_at"],
        ),
    )
    return get_chunk(db, payload["owner_id"], cursor.lastrowid, include_deleted=True)


def get_chunk(db: sqlite3.Connection, owner_id: int, chunk_id: int, *, include_deleted: bool = False) -> dict | None:
    sql = "SELECT * FROM document_chunks WHERE owner_id = ? AND id = ?"
    params: list[Any] = [owner_id, chunk_id]
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    return row_to_dict(db.execute(sql, params).fetchone())


def list_chunks(db: sqlite3.Connection, owner_id: int, document_id: int, filters: dict | None = None) -> dict:
    filters = filters or {}
    clauses = ["owner_id = ?", "document_id = ?"]
    params: list[Any] = [owner_id, document_id]
    if not filters.get("include_deleted"):
        clauses.append("deleted_at IS NULL")
    if filters.get("source_id") not in (None, ""):
        clauses.append("source_id = ?")
        params.append(int(filters["source_id"]))
    if filters.get("page_number") not in (None, ""):
        clauses.append("page_id IN (SELECT id FROM document_pages WHERE page_number = ?)")
        params.append(int(filters["page_number"]))
    where = " AND ".join(clauses)
    total = db.execute(f"SELECT COUNT(*) FROM document_chunks WHERE {where}", params).fetchone()[0]
    limit = min(max(int(filters.get("limit", 50)), 1), 200)
    offset = max(int(filters.get("offset", 0)), 0)
    rows = db.execute(
        f"SELECT * FROM document_chunks WHERE {where} ORDER BY chunk_index ASC LIMIT ? OFFSET ?",
        [*params, limit, offset],
    ).fetchall()
    return {"items": [dict(row) for row in rows], "total": total, "limit": limit, "offset": offset}


def find_active_duplicate(db: sqlite3.Connection, owner_id: int, source_id: int, page_id: int, content_hash: str) -> dict | None:
    return row_to_dict(
        db.execute(
            """
            SELECT * FROM document_chunks
            WHERE owner_id = ? AND source_id = ? AND page_id = ? AND content_hash = ? AND deleted_at IS NULL
            """,
            (owner_id, source_id, page_id, content_hash),
        ).fetchone()
    )


def soft_delete_chunks_for_document(db: sqlite3.Connection, owner_id: int, document_id: int, deleted_at: str) -> None:
    db.execute(
        "UPDATE document_chunks SET deleted_at = ?, updated_at = ? WHERE owner_id = ? AND document_id = ? AND deleted_at IS NULL",
        (deleted_at, deleted_at, owner_id, document_id),
    )


def restore_chunks_for_document(db: sqlite3.Connection, owner_id: int, document_id: int, deleted_at: str, restored_at: str) -> None:
    db.execute(
        "UPDATE document_chunks SET deleted_at = NULL, updated_at = ? WHERE owner_id = ? AND document_id = ? AND deleted_at = ?",
        (restored_at, owner_id, document_id, deleted_at),
    )
