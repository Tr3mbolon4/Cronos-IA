$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)
Set-Location ".\frontend"
npm run dev -- --host 127.0.0.1 --port 5173
