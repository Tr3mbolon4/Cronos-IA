param(
    [string]$Version = "0.1.0",
    [string]$InstallerPath,
    [switch]$Install
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
if (-not $InstallerPath) {
    $InstallerPath = Join-Path $root "release\CRONOS-$Version\CronosSetup-$Version.exe"
}

if (!(Test-Path -LiteralPath $InstallerPath)) {
    throw "Instalador nao encontrado: $InstallerPath"
}

$item = Get-Item -LiteralPath $InstallerPath
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $InstallerPath).Hash
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$installExitCode = $null
if ($Install) {
    if (-not $admin) {
        throw "Instalacao per-machine exige PowerShell como Administrador."
    }
    $process = Start-Process -FilePath $InstallerPath -ArgumentList "/S" -Wait -PassThru
    $installExitCode = $process.ExitCode
    if ($installExitCode -ne 0) {
        throw "Instalador retornou codigo $installExitCode."
    }
}

[pscustomobject]@{
    ok = $true
    installer = $item.FullName
    bytes = $item.Length
    sha256 = $hash
    admin = $admin
    installRequested = [bool]$Install
    installExitCode = $installExitCode
} | ConvertTo-Json -Compress
