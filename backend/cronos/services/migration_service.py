import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

from cronos.core.config import settings
from cronos.core.security import utcnow
from cronos.migrations import MIGRATIONS
from cronos.services.backup_service import backup_database_before_migration


class MigrationError(RuntimeError):
    pass


@dataclass(frozen=True)
class MigrationResult:
    applied: list[str]
    backup_path: Path | None


def apply_migrations(db_path: Path | None = None) -> MigrationResult:
    target = db_path or settings.db_path
    target.parent.mkdir(parents=True, exist_ok=True)
    settings.backups_dir.mkdir(parents=True, exist_ok=True)
    pending = _pending_versions(target)
    if not pending:
        return MigrationResult(applied=[], backup_path=None)

    backup_path = backup_database_before_migration(target)
    applied: list[str] = []
    connection: sqlite3.Connection | None = None

    try:
        connection = sqlite3.connect(target)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("BEGIN")
        _ensure_migration_table(connection)
        for migration in MIGRATIONS:
            version = migration["version"]
            if version not in pending:
                continue
            _execute_script(connection, migration["sql"])
            connection.execute(
                """
                INSERT INTO schema_migrations (version, description, applied_at)
                VALUES (?, ?, ?)
                """,
                (version, migration.get("description", ""), utcnow().isoformat()),
            )
            applied.append(version)
        connection.commit()
    except Exception as error:
        try:
            connection.rollback()
        except Exception:
            pass
        raise MigrationError(
            "Falha ao aplicar migrations. O banco original foi preservado"
            + (f" e possui backup em {backup_path}." if backup_path else ".")
        ) from error
    finally:
        try:
            if connection is not None:
                connection.close()
        except Exception:
            pass

    return MigrationResult(applied=applied, backup_path=backup_path)


def _ensure_migration_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
        """
    )


def _applied_versions(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute("SELECT version FROM schema_migrations").fetchall()
    return {row["version"] for row in rows}


def _execute_script(connection: sqlite3.Connection, script: str) -> None:
    statement = ""
    for line in script.splitlines():
        statement += line + "\n"
        if sqlite3.complete_statement(statement):
            connection.execute(statement)
            statement = ""
    if statement.strip():
        raise MigrationError("Migration contem SQL incompleto.")


def _pending_versions(db_path: Path) -> set[str]:
    versions = {migration["version"] for migration in MIGRATIONS}
    if not db_path.exists() or db_path.stat().st_size == 0:
        return versions
    with closing(sqlite3.connect(db_path)) as connection:
        exists = connection.execute(
            """
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = 'schema_migrations'
            """
        ).fetchone()
        if not exists:
            return versions
        rows = connection.execute("SELECT version FROM schema_migrations").fetchall()
    applied = {row[0] for row in rows}
    return versions - applied
