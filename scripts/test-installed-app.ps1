param(
    [string]$InstallDir = "C:\Program Files\CRONOS"
)

$ErrorActionPreference = "Stop"

$desktopExe = Join-Path $InstallDir "cronos-desktop.exe"
$backendExe = Join-Path $InstallDir "cronos-backend.exe"
$uninstallExe = Join-Path $InstallDir "uninstall.exe"

$checks = [ordered]@{
    installDir = Test-Path -LiteralPath $InstallDir
    desktopExe = Test-Path -LiteralPath $desktopExe
    backendExe = Test-Path -LiteralPath $backendExe
    uninstaller = Test-Path -LiteralPath $uninstallExe
    dataDirPolicy = "%LOCALAPPDATA%\CRONOS"
}

$ok = -not ($checks.Values -contains $false)
[pscustomobject]@{
    ok = $ok
    installDir = $InstallDir
    checks = $checks
} | ConvertTo-Json -Depth 4 -Compress

if (-not $ok) {
    throw "Instalacao CRONOS nao esta completa em $InstallDir."
}
