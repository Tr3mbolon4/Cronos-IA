import re
from urllib.parse import parse_qs

from cronos.core.errors import CronosError
from cronos.services import document_ingestion_service, knowledge_service


def is_document_path(path: str) -> bool:
    return path == "/documents/import" or path.startswith("/documents/") or path == "/documents"


def handle_get(path: str, query: str, session: dict) -> object:
    owner_id = _owner_id(session)
    params = _query_params(query)
    include_deleted = _truthy(params.get("include_deleted"))
    if path == "/documents":
        return knowledge_service.list_documents(owner_id, include_deleted=include_deleted)
    if match := re.fullmatch(r"/documents/(\d+)", path):
        return knowledge_service.get_document(owner_id, int(match.group(1)), include_deleted=include_deleted)
    if match := re.fullmatch(r"/documents/(\d+)/pages", path):
        return knowledge_service.list_pages(owner_id, int(match.group(1)), include_deleted=include_deleted)
    if match := re.fullmatch(r"/documents/(\d+)/pages/(\d+)", path):
        return knowledge_service.get_page(owner_id, int(match.group(1)), int(match.group(2)), include_deleted=include_deleted)
    if match := re.fullmatch(r"/documents/(\d+)/chunks", path):
        params["include_deleted"] = include_deleted
        return knowledge_service.list_chunks(owner_id, int(match.group(1)), params)
    raise CronosError(404, "Rota nao encontrada.")


def handle_post(path: str, session: dict, *, file_payload: tuple[str, bytes] | None = None, payload: dict | None = None) -> object:
    owner_id = _owner_id(session)
    if path == "/documents/import":
        if not file_payload:
            raise CronosError(400, "Arquivo obrigatorio.")
        filename, content = file_payload
        allow_duplicate = bool(payload and _truthy(payload.get("allow_duplicate")))
        return document_ingestion_service.import_pdf(owner_id, filename, content, allow_duplicate=allow_duplicate)
    if match := re.fullmatch(r"/documents/(\d+)/restore", path):
        return knowledge_service.restore_document(owner_id, int(match.group(1)))
    if match := re.fullmatch(r"/documents/(\d+)/reindex", path):
        return knowledge_service.reindex_document(owner_id, int(match.group(1)))
    raise CronosError(404, "Rota nao encontrada.")


def handle_delete(path: str, session: dict) -> object:
    owner_id = _owner_id(session)
    if match := re.fullmatch(r"/documents/(\d+)", path):
        return knowledge_service.delete_document(owner_id, int(match.group(1)))
    raise CronosError(404, "Rota nao encontrada.")


def _owner_id(session: dict) -> int:
    return int(session["owner"]["id"])


def _query_params(query: str) -> dict:
    values = parse_qs(query, keep_blank_values=True)
    return {key: value[-1] for key, value in values.items()}


def _truthy(value: object) -> bool:
    return str(value or "").lower() in {"1", "true", "yes", "sim"}
