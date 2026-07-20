param(
    [string]$InstallDir = "C:\Program Files\CRONOS",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$uninstaller = Join-Path $InstallDir "uninstall.exe"
$dataDir = Join-Path $env:LOCALAPPDATA "CRONOS"
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$exitCode = $null

if ($Uninstall) {
    if (!(Test-Path -LiteralPath $uninstaller)) {
        throw "Desinstalador nao encontrado: $uninstaller"
    }
    if (-not $admin) {
        throw "Desinstalacao per-machine exige PowerShell como Administrador."
    }
    $process = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru
    $exitCode = $process.ExitCode
    if ($exitCode -ne 0) {
        throw "Desinstalador retornou codigo $exitCode."
    }
}

[pscustomobject]@{
    ok = $true
    installDir = $InstallDir
    uninstallerExists = Test-Path -LiteralPath $uninstaller
    dataDir = $dataDir
    dataDirPreserved = Test-Path -LiteralPath $dataDir
    uninstallRequested = [bool]$Uninstall
    uninstallExitCode = $exitCode
    admin = $admin
} | ConvertTo-Json -Compress
