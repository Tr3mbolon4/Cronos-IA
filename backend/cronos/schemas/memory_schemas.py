from typing import Any

from cronos.core.errors import CronosError
from cronos.models.memory import (
    MEMORY_IMPORTANCE_MAX,
    MEMORY_IMPORTANCE_MIN,
    MEMORY_RELATION_TYPES,
    MEMORY_STATUSES,
)


def memory_error(code: str, message: str, status_code: int = 400, details: dict | None = None) -> CronosError:
    return CronosError(status_code, message, code=code, details=details or {})


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def validate_status(status: str) -> str:
    clean = clean_text(status)
    if clean not in MEMORY_STATUSES:
        raise memory_error(
            "MEMORY_VALIDATION_ERROR",
            "Status de memoria invalido.",
            details={"allowed": sorted(MEMORY_STATUSES)},
        )
    return clean


def validate_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError) as error:
        raise memory_error("MEMORY_VALIDATION_ERROR", "Confidence deve ser numerico.") from error
    if confidence < 0 or confidence > 1:
        raise memory_error("MEMORY_VALIDATION_ERROR", "Confidence deve ficar entre 0 e 1.")
    return confidence


def validate_importance(value: Any) -> int:
    try:
        importance = int(value)
    except (TypeError, ValueError) as error:
        raise memory_error("MEMORY_VALIDATION_ERROR", "Importance deve ser inteiro.") from error
    if importance < MEMORY_IMPORTANCE_MIN or importance > MEMORY_IMPORTANCE_MAX:
        raise memory_error(
            "MEMORY_VALIDATION_ERROR",
            "Importance deve ficar entre 1 e 5.",
            details={"scale": "1=baixa, 3=normal, 5=critica"},
        )
    return importance


def validate_relation_type(value: Any) -> str:
    relation_type = clean_text(value)
    if relation_type not in MEMORY_RELATION_TYPES:
        raise memory_error(
            "MEMORY_RELATION_INVALID",
            "Tipo de relacao de memoria invalido.",
            details={"allowed": sorted(MEMORY_RELATION_TYPES)},
        )
    return relation_type


def validate_strength(value: Any) -> float:
    try:
        strength = float(value)
    except (TypeError, ValueError) as error:
        raise memory_error("MEMORY_RELATION_INVALID", "Strength deve ser numerico.") from error
    if strength < 0 or strength > 1:
        raise memory_error("MEMORY_RELATION_INVALID", "Strength deve ficar entre 0 e 1.")
    return strength
