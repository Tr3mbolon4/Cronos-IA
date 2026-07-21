MEMORY_STATUSES = {"active", "archived", "pending_review", "deleted"}

MEMORY_RELATION_TYPES = {
    "related_to",
    "depends_on",
    "derived_from",
    "supersedes",
    "contradicts",
    "part_of",
}

MEMORY_IMPORTANCE_MIN = 1
MEMORY_IMPORTANCE_MAX = 5


def normalize_memory_text(value: str) -> str:
    return " ".join(value.strip().lower().split())
