DOCUMENT_SOURCE_TYPES = {"upload", "legacy_import", "generated", "manual"}
EXTRACTION_STATUSES = {"pending", "processing", "completed", "partial", "failed"}
INDEXING_STATUSES = {"pending", "processing", "completed", "partial", "failed", "requires_reindex"}


def normalize_document_text(value: str) -> str:
    return " ".join(value.strip().lower().split())
