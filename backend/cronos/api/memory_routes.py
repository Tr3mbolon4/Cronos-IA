import re
from urllib.parse import parse_qs

from cronos.core.errors import CronosError
from cronos.services import memory_relation_service, memory_service


def is_memory_path(path: str) -> bool:
    return path == "/memory/categories" or path == "/memories" or path.startswith("/memories/") or path == "/memory-relations" or path.startswith("/memory-relations/")


def handle_get(path: str, query: str, session: dict) -> object:
    owner_id = _owner_id(session)
    params = _query_params(query)
    if path == "/memory/categories":
        return memory_service.list_categories()
    if path == "/memories":
        return memory_service.list_memories(owner_id, params)
    if match := re.fullmatch(r"/memories/(\d+)", path):
        return memory_service.get_memory(owner_id, int(match.group(1)), include_deleted=_truthy(params.get("include_deleted")))
    if match := re.fullmatch(r"/memories/(\d+)/revisions", path):
        return memory_service.list_revisions(owner_id, int(match.group(1)))
    if match := re.fullmatch(r"/memories/(\d+)/relations", path):
        return memory_relation_service.list_relations(owner_id, int(match.group(1)))
    raise CronosError(404, "Rota nao encontrada.")


def handle_post(path: str, payload: dict, session: dict) -> object:
    owner_id = _owner_id(session)
    if path == "/memories":
        return memory_service.create_memory(owner_id, payload)
    if match := re.fullmatch(r"/memories/(\d+)/restore", path):
        return memory_service.restore_memory(owner_id, int(match.group(1)))
    if match := re.fullmatch(r"/memories/(\d+)/archive", path):
        return memory_service.archive_memory(owner_id, int(match.group(1)))
    if match := re.fullmatch(r"/memories/(\d+)/activate", path):
        return memory_service.activate_memory(owner_id, int(match.group(1)))
    if path == "/memory-relations":
        return memory_relation_service.create_relation(owner_id, payload)
    raise CronosError(404, "Rota nao encontrada.")


def handle_patch(path: str, payload: dict, session: dict) -> object:
    owner_id = _owner_id(session)
    if match := re.fullmatch(r"/memories/(\d+)", path):
        return memory_service.update_memory(owner_id, int(match.group(1)), payload)
    if match := re.fullmatch(r"/memory-relations/(\d+)", path):
        return memory_relation_service.update_relation(owner_id, int(match.group(1)), payload)
    raise CronosError(404, "Rota nao encontrada.")


def handle_delete(path: str, session: dict) -> object:
    owner_id = _owner_id(session)
    if match := re.fullmatch(r"/memories/(\d+)", path):
        return memory_service.delete_memory(owner_id, int(match.group(1)))
    if match := re.fullmatch(r"/memory-relations/(\d+)", path):
        return memory_relation_service.delete_relation(owner_id, int(match.group(1)))
    raise CronosError(404, "Rota nao encontrada.")


def _owner_id(session: dict) -> int:
    return int(session["owner"]["id"])


def _query_params(query: str) -> dict:
    values = parse_qs(query, keep_blank_values=True)
    return {key: value[-1] for key, value in values.items()}


def _truthy(value: object) -> bool:
    return str(value or "").lower() in {"1", "true", "yes", "sim"}
