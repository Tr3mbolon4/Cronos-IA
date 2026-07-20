import os
from pathlib import Path


def _default_data_dir() -> Path:
    env_dir = os.environ.get("CRONOS_DATA_DIR")
    if env_dir:
        return Path(env_dir)
    if os.environ.get("CRONOS_ENV") == "visual-test":
        return Path(__file__).resolve().parents[3] / "data" / "visual-test"
    return Path(__file__).resolve().parents[3] / "data"


class Settings:
    def __init__(self) -> None:
        self.app_name = "CRONOS"
        self.env = os.environ.get("CRONOS_ENV", "development")
        self.data_dir = _default_data_dir()
        self.session_minutes = int(os.environ.get("CRONOS_SESSION_MINUTES", "60"))

    @property
    def is_visual_test(self) -> bool:
        return self.env == "visual-test"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "cronos.db"

    @property
    def documents_dir(self) -> Path:
        return self.data_dir / "documents"

    @property
    def backups_dir(self) -> Path:
        return self.data_dir / "backups"


settings = Settings()
