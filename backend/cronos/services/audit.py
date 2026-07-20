from cronos.core.db import connect
from cronos.core.security import utcnow


def record(action: str, detail: str | None = None) -> None:
    with connect() as db:
        db.execute(
            "INSERT INTO audit_log (action, detail, created_at) VALUES (?, ?, ?)",
            (action, detail, utcnow().isoformat()),
        )
