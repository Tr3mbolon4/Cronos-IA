from urllib.parse import parse_qs

from cronos.core.errors import CronosError
from cronos.services import knowledge_service, retrieval_service


def is_library_path(path: str) -> bool:
    return path in {"/library/search", "/library/retrieve", "/library/index/status", "/library/index/providers", "/library/index/rebuild"} or path.startswith("/document-chunks/")


def handle_get(path: str, query: str, session: dict) -> object:
    owner_id = int(session["owner"]["id"])
    params = _query_params(query)
    params["include_deleted"] = str(params.get("include_deleted") or "").lower() in {"1", "true", "yes", "sim"}
    if path == "/library/search":
        return knowledge_service.search_library(owner_id, params)
    if path == "/library/index/status":
        return retrieval_service.index_status(owner_id)
    if path == "/library/index/providers":
        return retrieval_service.providers()
    if path.startswith("/document-chunks/"):
        chunk_id = int(path.removeprefix("/document-chunks/"))
        return knowledge_service.get_chunk(owner_id, chunk_id, include_deleted=params["include_deleted"])
    raise CronosError(404, "Rota nao encontrada.")


def handle_post(path: str, payload: dict, session: dict) -> object:
    owner_id = int(session["owner"]["id"])
    if path == "/library/retrieve":
        return retrieval_service.retrieve(owner_id, payload)
    if path == "/library/index/rebuild":
        return retrieval_service.rebuild_index(owner_id, payload)
    raise CronosError(404, "Rota nao encontrada.")


def _query_params(query: str) -> dict:
    values = parse_qs(query, keep_blank_values=True)
    return {key: value[-1] for key, value in values.items()}
