$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

Set-Location ".\backend"
$codexPython = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (Test-Path $codexPython) {
    & $codexPython -m cronos.server
} else {
    python -m cronos.server
}
