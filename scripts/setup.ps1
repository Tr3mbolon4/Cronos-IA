$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Preparando backend Python..."
Write-Host "O MVP atual usa apenas bibliotecas padrao do Python e pypdf quando disponivel."

Write-Host "Preparando frontend..."
Set-Location ".\frontend"
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Setup concluido."
