import os
import uuid
from datetime import timezone
from pathlib import Path

from cronos.core.security import utcnow


def _default_data_dir() -> Path:
    env_dir = os.environ.get("CRONOS_DATA_DIR")
    if env_dir:
        return Path(env_dir)
    if os.environ.get("CRONOS_ENV") == "visual-test":
        return Path(__file__).resolve().parents[3] / "data" / "visual-test"
    if os.environ.get("CRONOS_ENV") in {"desktop", "production"}:
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            return Path(local_app_data) / "CRONOS"
    return Path(__file__).resolve().parents[3] / "data"


def _default_resource_dir() -> Path:
    env_dir = os.environ.get("CRONOS_RESOURCE_DIR")
    if env_dir:
        return Path(env_dir)
    packaged_dir = getattr(__import__("sys"), "_MEIPASS", None)
    if packaged_dir:
        return Path(packaged_dir)
    return Path(__file__).resolve().parents[3] / "frontend" / "src-tauri" / "resources"


class Settings:
    def __init__(self) -> None:
        self.app_name = "CRONOS"
        self.version = "0.2.0"
        self.env = os.environ.get("CRONOS_ENV", "development")
        self.data_dir = _default_data_dir()
        self.log_dir = Path(os.environ.get("CRONOS_LOG_DIR", self.data_dir / "logs"))
        self.session_minutes = int(os.environ.get("CRONOS_SESSION_MINUTES", "60"))
        self.session_id = os.environ.get("CRONOS_SESSION_ID", "")
        self.parent_pid = os.environ.get("CRONOS_PARENT_PID", "")
        self.resource_dir = _default_resource_dir()

    @property
    def is_visual_test(self) -> bool:
        return self.env == "visual-test"

    @property
    def is_desktop(self) -> bool:
        return self.env in {"desktop", "production"}

    @property
    def db_path(self) -> Path:
        if self.is_desktop:
            return self.database_dir / "cronos.db"
        return self.data_dir / "cronos.db"

    @property
    def database_dir(self) -> Path:
        return self.data_dir / "database"

    @property
    def documents_dir(self) -> Path:
        return self.data_dir / "documents"

    @property
    def pdf_dir(self) -> Path:
        return self.data_dir / "pdf"

    @property
    def backups_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def temp_dir(self) -> Path:
        return self.data_dir / "temp"

    @property
    def configuration_dir(self) -> Path:
        return self.data_dir / "configuration"

    @property
    def security_dir(self) -> Path:
        return self.data_dir / "security"

    @property
    def runtime_dir(self) -> Path:
        return self.data_dir / "runtime"

    def configure(
        self,
        *,
        env: str | None = None,
        data_dir: str | Path | None = None,
        log_dir: str | Path | None = None,
        session_id: str | None = None,
        parent_pid: str | None = None,
        resource_dir: str | Path | None = None,
    ) -> None:
        if env:
            self.env = env
        if data_dir:
            self.data_dir = Path(data_dir).expanduser().resolve()
        elif self.env in {"desktop", "production"}:
            local_app_data = os.environ.get("LOCALAPPDATA")
            if local_app_data:
                self.data_dir = (Path(local_app_data) / "CRONOS").resolve()
        if log_dir:
            self.log_dir = Path(log_dir).expanduser().resolve()
        else:
            self.log_dir = self.data_dir / "logs"
        if session_id:
            self.session_id = session_id
        if parent_pid:
            self.parent_pid = parent_pid
        if resource_dir:
            self.resource_dir = Path(resource_dir).expanduser().resolve()

    @property
    def llm_resource_dir(self) -> Path:
        return self.resource_dir / "ai" / "llm"

    @property
    def embedding_resource_dir(self) -> Path:
        return self.resource_dir / "ai" / "embeddings"

    def ensure_directories(self) -> None:
        directories = [
            self.data_dir,
            self.database_dir,
            self.documents_dir,
            self.pdf_dir,
            self.backups_dir,
            self.log_dir,
            self.models_dir,
            self.cache_dir,
            self.temp_dir,
            self.configuration_dir,
            self.security_dir,
            self.runtime_dir,
        ]
        if not self.is_desktop:
            directories = [self.data_dir, self.documents_dir, self.backups_dir, self.log_dir]
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
        if self.is_desktop:
            self._ensure_installation_metadata()

    def _ensure_installation_metadata(self) -> None:
        metadata_path = self.configuration_dir / "installation.json"
        if metadata_path.exists():
            return
        import json

        metadata = {
            "installation_id": str(uuid.uuid4()),
            "schema_version": 1,
            "created_at": utcnow().astimezone(timezone.utc).isoformat(),
            "app_version": self.version,
        }
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


settings = Settings()
