param(
    [string]$SourceDb = (Join-Path $env:LOCALAPPDATA "CRONOS\database\cronos.db"),
    [string]$OutputDir = "data\project-backups",
    [string]$OutputName
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$resolvedSource = if ([System.IO.Path]::IsPathRooted($SourceDb)) { $SourceDb } else { Join-Path $root $SourceDb }
$resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $root $OutputDir }

if (!(Test-Path -LiteralPath $resolvedSource)) {
    throw "Banco de origem nao encontrado: $resolvedSource"
}

New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
if (!$OutputName) {
    $OutputName = "v0.2.0-migration-copy-" + (Get-Date -Format "yyyy-MM-dd-HHmmss")
}

$workDir = Join-Path $resolvedOutput $OutputName
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
$copyPath = Join-Path $workDir "cronos-copy.db"
$failureCopyPath = Join-Path $workDir "cronos-failure-copy.db"
Copy-Item -LiteralPath $resolvedSource -Destination $copyPath -Force
Copy-Item -LiteralPath $resolvedSource -Destination $failureCopyPath -Force

$python = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (!(Test-Path -LiteralPath $python)) {
    $python = "python"
}

$env:PYTHONPATH = Join-Path $root "backend"
$env:CRONOS_MIGRATION_COPY_ROOT = $workDir
$env:CRONOS_MIGRATION_COPY_DB = $copyPath
$env:CRONOS_MIGRATION_FAILURE_DB = $failureCopyPath

$code = @'
import hashlib
import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path

from cronos.core import config
from cronos.services import migration_service
from cronos.services.migration_service import MigrationError, apply_migrations

root = Path(os.environ["CRONOS_MIGRATION_COPY_ROOT"])
copy_db = Path(os.environ["CRONOS_MIGRATION_COPY_DB"])
failure_db = Path(os.environ["CRONOS_MIGRATION_FAILURE_DB"])

config.settings.configure(env="desktop", data_dir=root / "localappdata")

tracked_tables = [
    "owner",
    "sessions",
    "messages",
    "documents",
    "audit_log",
    "schema_migrations",
    "memory_categories",
    "memories",
    "memory_revisions",
    "memory_relations",
    "document_sources",
    "document_pages",
    "document_chunks",
    "document_embeddings",
]

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()

def table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone() is not None

def counts(path: Path) -> dict:
    output = {}
    with closing(sqlite3.connect(path)) as connection:
        for table in tracked_tables:
            if table_exists(connection, table):
                output[table] = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            else:
                output[table] = None
    return output

before = {
    "path": str(copy_db),
    "bytes": copy_db.stat().st_size,
    "sha256": sha256(copy_db),
    "counts": counts(copy_db),
}

result = apply_migrations(copy_db)
after = {
    "path": str(copy_db),
    "bytes": copy_db.stat().st_size,
    "sha256": sha256(copy_db),
    "counts": counts(copy_db),
    "applied": result.applied,
    "backupPath": str(result.backup_path) if result.backup_path else None,
    "backupExists": bool(result.backup_path and result.backup_path.exists()),
}

second = apply_migrations(copy_db)

original_migrations = migration_service.MIGRATIONS
migration_service.MIGRATIONS = [
    *original_migrations,
    {"version": "9999_failure_probe", "description": "Failure probe", "sql": "CREATE TABLE failure_probe ("},
]
failure = {"raised": False, "readable": False, "ownerRows": None, "brokenTableExists": None}
try:
    try:
        apply_migrations(failure_db)
    except MigrationError:
        failure["raised"] = True
    with closing(sqlite3.connect(failure_db)) as connection:
        failure["readable"] = True
        if table_exists(connection, "owner"):
            failure["ownerRows"] = connection.execute("SELECT COUNT(*) FROM owner").fetchone()[0]
        failure["brokenTableExists"] = table_exists(connection, "failure_probe")
finally:
    migration_service.MIGRATIONS = original_migrations

payload = {
    "ok": True,
    "sourceDb": os.environ.get("CRONOS_MIGRATION_COPY_DB"),
    "before": before,
    "after": after,
    "idempotentSecondRun": {
        "applied": second.applied,
        "backupPath": str(second.backup_path) if second.backup_path else None,
    },
    "failureSimulation": failure,
}

report = root / "migration-copy-report.json"
report.write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(json.dumps({"ok": True, "report": str(report), "applied": result.applied}, ensure_ascii=False))
'@

$code | & $python -
