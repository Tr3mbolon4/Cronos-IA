from typing import Any

from cronos.core.errors import CronosError
from cronos.models.document import DOCUMENT_SOURCE_TYPES, EXTRACTION_STATUSES, INDEXING_STATUSES


def document_error(code: str, message: str, status_code: int = 400, details: dict | None = None) -> CronosError:
    return CronosError(status_code, message, code=code, details=details or {})


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def validate_source_type(value: Any) -> str:
    source_type = clean_text(value)
    if source_type not in DOCUMENT_SOURCE_TYPES:
        raise document_error("DOCUMENT_VALIDATION_ERROR", "Tipo de fonte de documento invalido.", details={"allowed": sorted(DOCUMENT_SOURCE_TYPES)})
    return source_type


def validate_extraction_status(value: Any) -> str:
    status = clean_text(value)
    if status not in EXTRACTION_STATUSES:
        raise document_error("DOCUMENT_VALIDATION_ERROR", "Status de extracao invalido.", details={"allowed": sorted(EXTRACTION_STATUSES)})
    return status


def validate_indexing_status(value: Any) -> str:
    status = clean_text(value)
    if status not in INDEXING_STATUSES:
        raise document_error("DOCUMENT_VALIDATION_ERROR", "Status de indexacao invalido.", details={"allowed": sorted(INDEXING_STATUSES)})
    return status


def sanitize_error_message(value: Any) -> str | None:
    message = clean_text(value)
    if not message:
        return None
    return message.replace("\r", " ").replace("\n", " ")[:240]
