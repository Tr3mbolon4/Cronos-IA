param(
    [string]$Version = "0.1.0",
    [string]$Candidate,
    [switch]$SkipValidation
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"
$bundleRoot = Join-Path $root "frontend\src-tauri\target\release\bundle"
$releaseLabel = if ($Candidate) { "$Version-$Candidate" } else { $Version }
$releaseRoot = Join-Path $root "release\CRONOS-$releaseLabel"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

Set-Location $root

if (-not $SkipValidation) {
    & (Join-Path $PSScriptRoot "sync-version.ps1") -Version $Version | Out-Null
    & (Join-Path $PSScriptRoot "test.ps1")
    & (Join-Path $PSScriptRoot "test-backend-package.ps1")
}

& (Join-Path $PSScriptRoot "desktop-build.ps1")

if (!(Test-Path -LiteralPath $bundleRoot)) {
    throw "Diretorio de bundle nao foi gerado: $bundleRoot"
}

$installer = Get-ChildItem -LiteralPath $bundleRoot -Recurse -File -Include "*.exe" |
    Where-Object { $_.Name -match 'setup|installer|CRONOS|cronos' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    throw "Instalador NSIS nao encontrado em $bundleRoot."
}

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

$setupOut = Join-Path $releaseRoot "CronosSetup-$releaseLabel.exe"
Copy-Item -LiteralPath $installer.FullName -Destination $setupOut -Force

$msi = Get-ChildItem -LiteralPath $bundleRoot -Recurse -File -Filter "*.msi" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
$msiOut = $null
if ($msi) {
    $msiOut = Join-Path $releaseRoot "Cronos-$releaseLabel-x64.msi"
    Copy-Item -LiteralPath $msi.FullName -Destination $msiOut -Force
}

$desktopExe = Join-Path $root "frontend\src-tauri\target\release\cronos-desktop.exe"
$backendExe = Join-Path $root "frontend\src-tauri\binaries\cronos-backend-x86_64-pc-windows-msvc.exe"

$hashFiles = @($setupOut, $desktopExe, $backendExe)
if ($msiOut) { $hashFiles += $msiOut }

$hashRows = foreach ($file in $hashFiles) {
    $item = Get-Item -LiteralPath $file
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash
    [pscustomobject]@{
        file = $item.Name
        path = $item.FullName
        bytes = $item.Length
        sha256 = $hash
    }
}

$hashText = $hashRows | ForEach-Object { "$($_.sha256)  $($_.file)" }
[System.IO.File]::WriteAllText((Join-Path $releaseRoot "SHA256SUMS.txt"), (($hashText -join "`r`n") + "`r`n"), $utf8NoBom)

$manifest = [pscustomobject]@{
    product = "CRONOS"
    version = $Version
    identifier = "com.kalion.cronos"
    manufacturer = "Kalion Tecnologia"
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    releaseLabel = $releaseLabel
    candidate = if ($Candidate) { $Candidate } else { $null }
    installer = "CronosSetup-$releaseLabel.exe"
    msi = if ($msiOut) { "Cronos-$releaseLabel-x64.msi" } else { $null }
    installMode = "perMachine"
    defaultInstallDir = "C:\Program Files\CRONOS"
    dataDirPolicy = "%LOCALAPPDATA%\CRONOS"
    autoUpdate = $false
    codeSigned = $false
    artifacts = $hashRows
}
$manifestJson = $manifest | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText((Join-Path $releaseRoot "release-manifest.json"), "$manifestJson`r`n", $utf8NoBom)

Copy-Item -LiteralPath (Join-Path $root "CHANGELOG.md") -Destination (Join-Path $releaseRoot "CHANGELOG.txt") -Force
Copy-Item -LiteralPath (Join-Path $root "docs\WINDOWS_INSTALLER.md") -Destination (Join-Path $releaseRoot "INSTALL.txt") -Force

[pscustomobject]@{
    ok = $true
    version = $Version
    releaseLabel = $releaseLabel
    releaseDir = $releaseRoot
    installer = $setupOut
    msi = $msiOut
    hashes = $hashRows
} | ConvertTo-Json -Depth 6
