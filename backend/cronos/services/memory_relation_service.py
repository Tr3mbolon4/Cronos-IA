from typing import Any

from cronos.core.db import connect
from cronos.core.security import utcnow
from cronos.repositories import memory_relation_repository, memory_repository
from cronos.schemas.memory_schemas import clean_text, memory_error, validate_relation_type, validate_strength


def list_relations(owner_id: int, memory_id: int) -> list[dict]:
    with connect() as db:
        if not memory_repository.get_memory(db, owner_id, memory_id, include_deleted=True):
            raise memory_error("MEMORY_NOT_FOUND", "Memoria nao encontrada.", 404)
        return memory_relation_repository.list_relations_for_memory(db, owner_id, memory_id)


def create_relation(owner_id: int, payload: dict) -> dict:
    source_id = _required_int(payload.get("source_memory_id"), "source_memory_id")
    target_id = _required_int(payload.get("target_memory_id"), "target_memory_id")
    relation_type = validate_relation_type(payload.get("relation_type"))
    strength = validate_strength(payload.get("strength", 0.7))
    _validate_not_self(source_id, target_id)
    with connect() as db:
        _require_memory(db, owner_id, source_id)
        _require_memory(db, owner_id, target_id)
        if memory_relation_repository.active_duplicate_exists(db, owner_id, source_id, target_id, relation_type):
            raise memory_error("MEMORY_RELATION_DUPLICATE", "Relacao de memoria ja existe.", 409)
        relation = memory_relation_repository.create_relation(
            db,
            {
                "owner_id": owner_id,
                "source_memory_id": source_id,
                "target_memory_id": target_id,
                "relation_type": relation_type,
                "strength": strength,
                "description": clean_text(payload.get("description")) or None,
                "created_at": utcnow().isoformat(),
            },
        )
        memory_repository.record_audit(db, "memory_relation.created", f"id={relation['id']} source={source_id} target={target_id}")
        return relation


def update_relation(owner_id: int, relation_id: int, payload: dict) -> dict:
    with connect() as db:
        current = memory_relation_repository.get_relation(db, owner_id, relation_id)
        if not current:
            raise memory_error("MEMORY_NOT_FOUND", "Relacao de memoria nao encontrada.", 404)
        source_id = _optional_int(payload.get("source_memory_id"), current["source_memory_id"])
        target_id = _optional_int(payload.get("target_memory_id"), current["target_memory_id"])
        relation_type = validate_relation_type(payload.get("relation_type", current["relation_type"]))
        strength = validate_strength(payload.get("strength", current["strength"]))
        _validate_not_self(source_id, target_id)
        _require_memory(db, owner_id, source_id)
        _require_memory(db, owner_id, target_id)
        if memory_relation_repository.active_duplicate_exists(db, owner_id, source_id, target_id, relation_type, exclude_id=relation_id):
            raise memory_error("MEMORY_RELATION_DUPLICATE", "Relacao de memoria ja existe.", 409)
        description = current["description"]
        if "description" in payload:
            description = clean_text(payload.get("description")) or None
        updates = {
            "source_memory_id": source_id,
            "target_memory_id": target_id,
            "relation_type": relation_type,
            "strength": strength,
            "description": description,
        }
        relation = memory_relation_repository.update_relation(db, owner_id, relation_id, updates)
        memory_repository.record_audit(db, "memory_relation.updated", f"id={relation_id}")
        return relation


def delete_relation(owner_id: int, relation_id: int) -> dict:
    with connect() as db:
        current = memory_relation_repository.get_relation(db, owner_id, relation_id)
        if not current:
            raise memory_error("MEMORY_NOT_FOUND", "Relacao de memoria nao encontrada.", 404)
        relation = memory_relation_repository.soft_delete_relation(db, owner_id, relation_id)
        memory_repository.record_audit(db, "memory_relation.deleted", f"id={relation_id}")
        return relation


def _require_memory(db, owner_id: int, memory_id: int) -> dict:
    memory = memory_repository.get_memory(db, owner_id, memory_id, include_deleted=True)
    if not memory:
        raise memory_error("MEMORY_RELATION_INVALID", "Relacao aponta para memoria inexistente.", 400)
    return memory


def _validate_not_self(source_id: int, target_id: int) -> None:
    if source_id == target_id:
        raise memory_error("MEMORY_RELATION_INVALID", "Memoria nao pode se relacionar com ela mesma.")


def _required_int(value: Any, field: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise memory_error("MEMORY_RELATION_INVALID", f"{field} invalido.") from error


def _optional_int(value: Any, fallback: int) -> int:
    if value in (None, ""):
        return fallback
    return _required_int(value, "memory_id")
