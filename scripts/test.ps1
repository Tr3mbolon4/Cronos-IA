$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

$codexPython = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$env:PYTHONPATH = "$PWD\backend"
if (Test-Path $codexPython) {
    & $codexPython -m unittest discover -s ".\backend\tests"
} else {
    python -m unittest discover -s ".\backend\tests"
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location ".\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
