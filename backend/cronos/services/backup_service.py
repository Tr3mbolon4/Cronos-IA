import shutil
from pathlib import Path

from cronos.core.config import settings
from cronos.core.security import utcnow


def backup_database_before_migration(db_path: Path | None = None) -> Path | None:
    source = db_path or settings.db_path
    if not source.exists() or source.stat().st_size == 0:
        return None

    target_dir = settings.backups_dir / "database-migrations"
    target_dir.mkdir(parents=True, exist_ok=True)
    timestamp = utcnow().strftime("%Y%m%d%H%M%S")
    target = target_dir / f"cronos-before-migration-{timestamp}.db"
    shutil.copy2(source, target)
    return target
