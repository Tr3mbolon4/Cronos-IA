from typing import Any

from cronos.core.db import connect
from cronos.core.security import utcnow
from cronos.models.memory import normalize_memory_text
from cronos.repositories import memory_repository
from cronos.schemas.memory_schemas import (
    clean_text,
    memory_error,
    validate_confidence,
    validate_importance,
    validate_status,
)


def list_categories() -> list[dict]:
    with connect() as db:
        return memory_repository.list_categories(db)


def list_memories(owner_id: int, filters: dict) -> dict:
    prepared = dict(filters)
    if prepared.get("status"):
        prepared["status"] = validate_status(prepared["status"])
    if prepared.get("minimum_confidence") not in (None, ""):
        validate_confidence(prepared["minimum_confidence"])
    if prepared.get("minimum_importance") not in (None, ""):
        validate_importance(prepared["minimum_importance"])
    prepared["include_deleted"] = _truthy(prepared.get("include_deleted"))
    with connect() as db:
        return memory_repository.list_memories(db, owner_id, prepared)


def get_memory(owner_id: int, memory_id: int, *, include_deleted: bool = False) -> dict:
    with connect() as db:
        memory = memory_repository.get_memory(db, owner_id, memory_id, include_deleted=include_deleted)
    if not memory:
        raise memory_error("MEMORY_NOT_FOUND", "Memoria nao encontrada.", 404)
    return memory


def create_memory(owner_id: int, payload: dict) -> dict:
    title = clean_text(payload.get("title"))
    content = clean_text(payload.get("content"))
    if not title or not content:
        raise memory_error("MEMORY_VALIDATION_ERROR", "Titulo e conteudo sao obrigatorios.")
    category_id = _required_int(payload.get("category_id"), "category_id")
    confidence = validate_confidence(payload.get("confidence", 0.7))
    importance = validate_importance(payload.get("importance", 3))
    source_type = clean_text(payload.get("source_type") or "manual")
    status = payload.get("status")
    if not status:
        status = "pending_review" if source_type != "manual" and confidence < 0.6 else "active"
    status = validate_status(status)
    now = utcnow().isoformat()
    with connect() as db:
        if not memory_repository.get_category(db, category_id):
            raise memory_error("MEMORY_CATEGORY_NOT_FOUND", "Categoria de memoria nao encontrada.", 404)
        memory = memory_repository.create_memory(
            db,
            {
                "owner_id": owner_id,
                "category_id": category_id,
                "title": title,
                "content": content,
                "normalized_content": normalize_memory_text(content),
                "source_type": source_type,
                "source_reference": clean_text(payload.get("source_reference")) or None,
                "confidence": confidence,
                "importance": importance,
                "status": status,
                "created_at": now,
                "updated_at": now,
            },
        )
        memory_repository.record_audit(db, "memory.created", f"id={memory['id']} owner={owner_id}")
        return memory


def update_memory(owner_id: int, memory_id: int, payload: dict) -> dict:
    reason = clean_text(payload.get("change_reason")) or None
    with connect() as db:
        current = memory_repository.get_memory(db, owner_id, memory_id, include_deleted=True)
        if not current:
            raise memory_error("MEMORY_NOT_FOUND", "Memoria nao encontrada.", 404)
        updates, changed_fields = _memory_updates(db, current, payload)
        if not updates:
            return current
        _create_revision(db, current, changed_fields, reason)
        updates["updated_at"] = utcnow().isoformat()
        updated = memory_repository.update_memory(db, owner_id, memory_id, updates)
        memory_repository.record_audit(db, "memory.updated", f"id={memory_id} fields={','.join(changed_fields)}")
        return updated


def archive_memory(owner_id: int, memory_id: int) -> dict:
    return _change_status(owner_id, memory_id, "archived", "memory.archived")


def activate_memory(owner_id: int, memory_id: int) -> dict:
    return _change_status(owner_id, memory_id, "active", "memory.activated")


def restore_memory(owner_id: int, memory_id: int) -> dict:
    with connect() as db:
        current = memory_repository.get_memory(db, owner_id, memory_id, include_deleted=True)
        if not current:
            raise memory_error("MEMORY_NOT_FOUND", "Memoria nao encontrada.", 404)
        _create_revision(db, current, ["status", "deleted_at"], "restore")
        updated = memory_repository.update_memory(
            db,
            owner_id,
            memory_id,
            {"status": "active", "deleted_at": None, "updated_at": utcnow().isoformat()},
        )
        memory_repository.record_audit(db, "memory.restored", f"id={memory_id}")
        return updated


def delete_memory(owner_id: int, memory_id: int) -> dict:
    with connect() as db:
        current = memory_repository.get_memory(db, owner_id, memory_id, include_deleted=True)
        if not current:
            raise memory_error("MEMORY_NOT_FOUND", "Memoria nao encontrada.", 404)
        _create_revision(db, current, ["status", "deleted_at"], "delete")
        now = utcnow().isoformat()
        updated = memory_repository.update_memory(
            db,
            owner_id,
            memory_id,
            {"status": "deleted", "deleted_at": now, "updated_at": now},
        )
        memory_repository.record_audit(db, "memory.deleted", f"id={memory_id}")
        return updated


def list_revisions(owner_id: int, memory_id: int) -> list[dict]:
    with connect() as db:
        if not memory_repository.get_memory(db, owner_id, memory_id, include_deleted=True):
            raise memory_error("MEMORY_NOT_FOUND", "Memoria nao encontrada.", 404)
        return memory_repository.list_revisions(db, owner_id, memory_id)


def _change_status(owner_id: int, memory_id: int, status: str, audit_action: str) -> dict:
    with connect() as db:
        current = memory_repository.get_memory(db, owner_id, memory_id, include_deleted=True)
        if not current:
            raise memory_error("MEMORY_NOT_FOUND", "Memoria nao encontrada.", 404)
        _create_revision(db, current, ["status"], status)
        updated = memory_repository.update_memory(
            db,
            owner_id,
            memory_id,
            {"status": status, "updated_at": utcnow().isoformat()},
        )
        memory_repository.record_audit(db, audit_action, f"id={memory_id}")
        return updated


def _memory_updates(db, current: dict, payload: dict) -> tuple[dict, list[str]]:
    updates: dict[str, Any] = {}
    changed: list[str] = []
    for key in ("title", "content", "source_type", "source_reference"):
        if key in payload:
            value = clean_text(payload.get(key)) or None
            if key in {"title", "content"} and not value:
                raise memory_error("MEMORY_VALIDATION_ERROR", "Titulo e conteudo sao obrigatorios.")
            if value != current[key]:
                updates[key] = value
                changed.append(key)
    if "content" in updates:
        updates["normalized_content"] = normalize_memory_text(updates["content"])
    if "category_id" in payload:
        category_id = _required_int(payload.get("category_id"), "category_id")
        if not memory_repository.get_category(db, category_id):
            raise memory_error("MEMORY_CATEGORY_NOT_FOUND", "Categoria de memoria nao encontrada.", 404)
        if category_id != current["category_id"]:
            updates["category_id"] = category_id
            changed.append("category_id")
    if "confidence" in payload:
        confidence = validate_confidence(payload.get("confidence"))
        if confidence != current["confidence"]:
            updates["confidence"] = confidence
            changed.append("confidence")
    if "importance" in payload:
        importance = validate_importance(payload.get("importance"))
        if importance != current["importance"]:
            updates["importance"] = importance
            changed.append("importance")
    if "status" in payload:
        status = validate_status(payload.get("status"))
        if status != current["status"]:
            updates["status"] = status
            changed.append("status")
    return updates, changed


def _create_revision(db, memory: dict, changed_fields: list[str], reason: str | None) -> None:
    try:
        memory_repository.create_revision(db, memory, changed_fields, reason)
    except Exception as error:
        raise memory_error("MEMORY_REVISION_ERROR", "Nao foi possivel registrar revisao.", 500) from error


def _required_int(value: Any, field: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise memory_error("MEMORY_VALIDATION_ERROR", f"{field} invalido.") from error


def _truthy(value: Any) -> bool:
    return str(value or "").lower() in {"1", "true", "yes", "sim"}
