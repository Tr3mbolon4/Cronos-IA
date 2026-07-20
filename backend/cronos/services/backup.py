import zipfile
from pathlib import Path

from cronos.core.config import settings
from cronos.core.errors import CronosError
from cronos.core.security import utcnow


def create_backup() -> dict:
    settings.backups_dir.mkdir(parents=True, exist_ok=True)
    backup_path = settings.backups_dir / f"cronos-backup-{utcnow().strftime('%Y%m%d-%H%M%S')}.zip"
    with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as archive:
        if settings.db_path.exists():
            archive.write(settings.db_path, "cronos.db")
        if settings.documents_dir.exists():
            for path in settings.documents_dir.rglob("*"):
                if path.is_file():
                    archive.write(path, Path("documents") / path.relative_to(settings.documents_dir))
    return {"path": str(backup_path), "filename": backup_path.name}


def restore_backup(filename: str, content: bytes) -> dict:
    if not filename.lower().endswith(".zip"):
        raise CronosError(400, "Envie um backup .zip do CRONOS.")
    if not content:
        raise CronosError(400, "Backup vazio.")
    return {
        "accepted": True,
        "message": "Arquivo recebido. Restauracao completa sera ativada com validacao, rollback e criptografia.",
    }
