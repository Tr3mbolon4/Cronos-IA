import sqlite3
from typing import Any


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def list_active_chunks(db: sqlite3.Connection, owner_id: int, filters: dict | None = None) -> list[dict]:
    filters = filters or {}
    clauses = ["c.owner_id = ?", "c.deleted_at IS NULL", "d.deleted_at IS NULL", "p.deleted_at IS NULL", "s.deleted_at IS NULL"]
    params: list[Any] = [owner_id]
    if filters.get("document_id") not in (None, ""):
        clauses.append("c.document_id = ?")
        params.append(int(filters["document_id"]))
    if filters.get("source_id") not in (None, ""):
        clauses.append("c.source_id = ?")
        params.append(int(filters["source_id"]))
    if filters.get("page_number") not in (None, ""):
        clauses.append("p.page_number = ?")
        params.append(int(filters["page_number"]))
    where = " AND ".join(clauses)
    rows = db.execute(
        f"""
        SELECT
            c.*,
            d.filename AS document_title,
            d.updated_at AS document_updated_at,
            s.original_filename,
            p.page_number
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
        JOIN document_sources s ON s.id = c.source_id
        JOIN document_pages p ON p.id = c.page_id
        WHERE {where}
        ORDER BY c.id ASC
        """,
        params,
    ).fetchall()
    return [dict(row) for row in rows]


def get_embedding(db: sqlite3.Connection, chunk_id: int, provider: str, model: str) -> dict | None:
    return row_to_dict(
        db.execute(
            """
            SELECT * FROM document_embeddings
            WHERE chunk_id = ? AND provider = ? AND model = ?
            ORDER BY id DESC LIMIT 1
            """,
            (chunk_id, provider, model),
        ).fetchone()
    )


def upsert_embedding(db: sqlite3.Connection, payload: dict) -> dict:
    existing = get_embedding(db, payload["chunk_id"], payload["provider"], payload["model"])
    if existing and existing["embedding_hash"] == payload["embedding_hash"]:
        return existing
    if existing:
        db.execute(
            """
            UPDATE document_embeddings
            SET document_id = ?, dimension = ?, embedding = ?, embedding_hash = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                payload["document_id"],
                payload["dimension"],
                payload["embedding"],
                payload["embedding_hash"],
                payload["updated_at"],
                existing["id"],
            ),
        )
        return row_to_dict(db.execute("SELECT * FROM document_embeddings WHERE id = ?", (existing["id"],)).fetchone())
    cursor = db.execute(
        """
        INSERT INTO document_embeddings (
            document_id, chunk_id, provider, model, dimension,
            embedding, embedding_hash, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload["document_id"],
            payload["chunk_id"],
            payload["provider"],
            payload["model"],
            payload["dimension"],
            payload["embedding"],
            payload["embedding_hash"],
            payload["created_at"],
            payload["updated_at"],
        ),
    )
    return row_to_dict(db.execute("SELECT * FROM document_embeddings WHERE id = ?", (cursor.lastrowid,)).fetchone())


def list_embeddings(db: sqlite3.Connection, provider: str, model: str, filters: dict | None = None) -> list[dict]:
    filters = filters or {}
    clauses = ["e.provider = ?", "e.model = ?", "c.deleted_at IS NULL", "d.deleted_at IS NULL"]
    params: list[Any] = [provider, model]
    if filters.get("document_id") not in (None, ""):
        clauses.append("e.document_id = ?")
        params.append(int(filters["document_id"]))
    where = " AND ".join(clauses)
    rows = db.execute(
        f"""
        SELECT e.*, c.text_content, c.normalized_text, c.source_id, c.page_id,
               c.chunk_index, c.character_start, c.character_end,
               d.filename AS document_title, s.original_filename, p.page_number
        FROM document_embeddings e
        JOIN document_chunks c ON c.id = e.chunk_id
        JOIN documents d ON d.id = e.document_id
        JOIN document_sources s ON s.id = c.source_id
        JOIN document_pages p ON p.id = c.page_id
        WHERE {where}
        """,
        params,
    ).fetchall()
    return [dict(row) for row in rows]


def index_status(db: sqlite3.Connection, owner_id: int) -> dict:
    total_chunks = db.execute(
        """
        SELECT COUNT(*)
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE c.owner_id = ? AND c.deleted_at IS NULL AND d.deleted_at IS NULL
        """,
        (owner_id,),
    ).fetchone()[0]
    total_embeddings = db.execute(
        """
        SELECT COUNT(*)
        FROM document_embeddings e
        JOIN document_chunks c ON c.id = e.chunk_id
        JOIN documents d ON d.id = e.document_id
        WHERE c.owner_id = ? AND c.deleted_at IS NULL AND d.deleted_at IS NULL
        """,
        (owner_id,),
    ).fetchone()[0]
    return {"chunks": total_chunks, "embeddings": total_embeddings, "pending": max(total_chunks - total_embeddings, 0)}
