$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Comando falhou com codigo ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

Set-Location $root
& (Join-Path $PSScriptRoot "write-build-info.ps1") -Version "v0.3.0" | Out-Null
& (Join-Path $PSScriptRoot "build-backend.ps1")
& (Join-Path $PSScriptRoot "prepare-sidecar.ps1")

Set-Location (Join-Path $root "frontend")
Invoke-Native npm run build
Invoke-Native npm run tauri:info
Invoke-Native npm run tauri:build

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
