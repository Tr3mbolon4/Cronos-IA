$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

Set-Location $root
& (Join-Path $PSScriptRoot "build-backend.ps1")
& (Join-Path $PSScriptRoot "prepare-sidecar.ps1")

Set-Location (Join-Path $root "frontend")
npm run build
npm run tauri:info
npm run tauri:build

$desktopExe = Join-Path $root "frontend\src-tauri\target\release\cronos-desktop.exe"
if (!(Test-Path $desktopExe)) {
    throw "Executavel desktop nao encontrado: $desktopExe"
}

$item = Get-Item -LiteralPath $desktopExe
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $desktopExe).Hash
[pscustomobject]@{
    desktop = $desktopExe
    bytes = $item.Length
    sha256 = $hash
} | ConvertTo-Json -Compress
