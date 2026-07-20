$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendExe = Join-Path $root "backend\dist\cronos-backend.exe"
$binariesDir = Join-Path $root "frontend\src-tauri\binaries"

if (!(Test-Path $backendExe)) {
    throw "Backend de producao nao encontrado: $backendExe. Execute .\scripts\build-backend.ps1 primeiro."
}

$targetTriple = (& rustc -vV | Select-String "^host:" | ForEach-Object { $_.ToString().Split(":", 2)[1].Trim() })
if (!$targetTriple) {
    throw "Nao foi possivel detectar o target triple do Rust."
}

New-Item -ItemType Directory -Force -Path $binariesDir | Out-Null
$targetExe = Join-Path $binariesDir "cronos-backend-$targetTriple.exe"
Copy-Item -LiteralPath $backendExe -Destination $targetExe -Force

$item = Get-Item -LiteralPath $targetExe
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetExe).Hash
[pscustomobject]@{
    sidecar = $targetExe
    bytes = $item.Length
    sha256 = $hash
} | ConvertTo-Json -Compress
