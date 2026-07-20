from pathlib import Path
from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "CRONOS"
    data_dir: Path = Path(__file__).resolve().parents[3] / "data"
    session_minutes: int = 60

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
