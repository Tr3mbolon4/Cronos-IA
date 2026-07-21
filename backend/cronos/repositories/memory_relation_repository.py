import sqlite3

from cronos.core.security import utcnow


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def get_relation(db: sqlite3.Connection, owner_id: int, relation_id: int, *, include_deleted: bool = False) -> dict | None:
    sql = "SELECT * FROM memory_relations WHERE owner_id = ? AND id = ?"
    params: list = [owner_id, relation_id]
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    return row_to_dict(db.execute(sql, params).fetchone())


def list_relations_for_memory(db: sqlite3.Connection, owner_id: int, memory_id: int) -> list[dict]:
    rows = db.execute(
        """
        SELECT *
        FROM memory_relations
        WHERE owner_id = ?
          AND deleted_at IS NULL
          AND (source_memory_id = ? OR target_memory_id = ?)
        ORDER BY created_at DESC
        """,
        (owner_id, memory_id, memory_id),
    ).fetchall()
    return [dict(row) for row in rows]


def active_duplicate_exists(db: sqlite3.Connection, owner_id: int, source_id: int, target_id: int, relation_type: str, *, exclude_id: int | None = None) -> bool:
    sql = """
        SELECT id FROM memory_relations
        WHERE owner_id = ? AND source_memory_id = ? AND target_memory_id = ?
          AND relation_type = ? AND deleted_at IS NULL
    """
    params: list = [owner_id, source_id, target_id, relation_type]
    if exclude_id is not None:
        sql += " AND id != ?"
        params.append(exclude_id)
    return db.execute(sql, params).fetchone() is not None


def create_relation(db: sqlite3.Connection, payload: dict) -> dict:
    cursor = db.execute(
        """
        INSERT INTO memory_relations (
            owner_id, source_memory_id, target_memory_id, relation_type,
            strength, description, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload["owner_id"],
            payload["source_memory_id"],
            payload["target_memory_id"],
            payload["relation_type"],
            payload["strength"],
            payload.get("description"),
            payload["created_at"],
        ),
    )
    return get_relation(db, payload["owner_id"], cursor.lastrowid)


def update_relation(db: sqlite3.Connection, owner_id: int, relation_id: int, updates: dict) -> dict:
    assignments = [f"{key} = ?" for key in updates]
    db.execute(
        f"UPDATE memory_relations SET {', '.join(assignments)} WHERE owner_id = ? AND id = ?",
        [*updates.values(), owner_id, relation_id],
    )
    return get_relation(db, owner_id, relation_id, include_deleted=True)


def soft_delete_relation(db: sqlite3.Connection, owner_id: int, relation_id: int) -> dict:
    db.execute(
        "UPDATE memory_relations SET deleted_at = ? WHERE owner_id = ? AND id = ? AND deleted_at IS NULL",
        (utcnow().isoformat(), owner_id, relation_id),
    )
    return get_relation(db, owner_id, relation_id, include_deleted=True)
