import json
import sqlite3
from typing import Any

from cronos.core.security import utcnow


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def get_category(db: sqlite3.Connection, category_id: int) -> dict | None:
    return row_to_dict(db.execute("SELECT * FROM memory_categories WHERE id = ?", (category_id,)).fetchone())


def list_categories(db: sqlite3.Connection) -> list[dict]:
    rows = db.execute("SELECT * FROM memory_categories ORDER BY name").fetchall()
    return [dict(row) for row in rows]


def create_memory(db: sqlite3.Connection, payload: dict) -> dict:
    cursor = db.execute(
        """
        INSERT INTO memories (
            owner_id, category_id, title, content, normalized_content,
            source_type, source_reference, confidence, importance, status,
            created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload["owner_id"],
            payload["category_id"],
            payload["title"],
            payload["content"],
            payload["normalized_content"],
            payload["source_type"],
            payload.get("source_reference"),
            payload["confidence"],
            payload["importance"],
            payload["status"],
            payload["created_at"],
            payload["updated_at"],
        ),
    )
    return get_memory(db, payload["owner_id"], cursor.lastrowid, include_deleted=True)


def get_memory(db: sqlite3.Connection, owner_id: int, memory_id: int, *, include_deleted: bool = False) -> dict | None:
    sql = "SELECT * FROM memories WHERE owner_id = ? AND id = ?"
    params: list[Any] = [owner_id, memory_id]
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    return row_to_dict(db.execute(sql, params).fetchone())


def list_memories(db: sqlite3.Connection, owner_id: int, filters: dict) -> dict:
    clauses = ["owner_id = ?"]
    params: list[Any] = [owner_id]
    if not filters.get("include_deleted"):
        clauses.append("deleted_at IS NULL")
    if filters.get("search"):
        clauses.append("(normalized_content LIKE ? OR lower(title) LIKE ?)")
        term = f"%{filters['search'].strip().lower()}%"
        params.extend([term, term])
    for key in ("category_id", "status", "source_type"):
        if filters.get(key) not in (None, ""):
            clauses.append(f"{key} = ?")
            params.append(filters[key])
    if filters.get("minimum_confidence") not in (None, ""):
        clauses.append("confidence >= ?")
        params.append(float(filters["minimum_confidence"]))
    if filters.get("minimum_importance") not in (None, ""):
        clauses.append("importance >= ?")
        params.append(int(filters["minimum_importance"]))

    where = " AND ".join(clauses)
    total = db.execute(f"SELECT COUNT(*) FROM memories WHERE {where}", params).fetchone()[0]
    order_by = filters.get("order_by") if filters.get("order_by") in {"created_at", "updated_at", "importance", "confidence", "title"} else "updated_at"
    direction = "ASC" if str(filters.get("order_direction", "")).lower() == "asc" else "DESC"
    limit = min(max(int(filters.get("limit", 50)), 1), 200)
    offset = max(int(filters.get("offset", 0)), 0)
    rows = db.execute(
        f"SELECT * FROM memories WHERE {where} ORDER BY {order_by} {direction} LIMIT ? OFFSET ?",
        [*params, limit, offset],
    ).fetchall()
    return {"items": [dict(row) for row in rows], "total": total, "limit": limit, "offset": offset}


def next_revision_number(db: sqlite3.Connection, memory_id: int) -> int:
    row = db.execute("SELECT COALESCE(MAX(revision_number), 0) + 1 FROM memory_revisions WHERE memory_id = ?", (memory_id,)).fetchone()
    return int(row[0])


def create_revision(db: sqlite3.Connection, memory: dict, changed_fields: list[str], reason: str | None) -> None:
    db.execute(
        """
        INSERT INTO memory_revisions (
            memory_id, revision_number, previous_title, previous_content,
            previous_category_id, previous_confidence, previous_importance,
            previous_status, changed_fields, change_reason, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            memory["id"],
            next_revision_number(db, memory["id"]),
            memory["title"],
            memory["content"],
            memory["category_id"],
            memory["confidence"],
            memory["importance"],
            memory["status"],
            json.dumps(changed_fields, ensure_ascii=False),
            reason,
            utcnow().isoformat(),
        ),
    )


def update_memory(db: sqlite3.Connection, owner_id: int, memory_id: int, updates: dict) -> dict:
    assignments = [f"{key} = ?" for key in updates]
    params = [*updates.values(), owner_id, memory_id]
    db.execute(f"UPDATE memories SET {', '.join(assignments)} WHERE owner_id = ? AND id = ?", params)
    return get_memory(db, owner_id, memory_id, include_deleted=True)


def list_revisions(db: sqlite3.Connection, owner_id: int, memory_id: int) -> list[dict]:
    rows = db.execute(
        """
        SELECT r.*
        FROM memory_revisions r
        JOIN memories m ON m.id = r.memory_id
        WHERE m.owner_id = ? AND r.memory_id = ?
        ORDER BY r.revision_number DESC
        """,
        (owner_id, memory_id),
    ).fetchall()
    return [dict(row) for row in rows]


def record_audit(db: sqlite3.Connection, action: str, detail: str | None = None) -> None:
    db.execute(
        "INSERT INTO audit_log (action, detail, created_at) VALUES (?, ?, ?)",
        (action, detail, utcnow().isoformat()),
    )
