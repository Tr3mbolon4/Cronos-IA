$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
& (Join-Path $PSScriptRoot "build-backend.ps1")
& (Join-Path $PSScriptRoot "prepare-sidecar.ps1")

Set-Location (Join-Path $root "frontend")
npm run tauri:dev
