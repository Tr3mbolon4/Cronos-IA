param(
    [string]$Version = "0.2.0",
    [string]$ManifestPath
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

function Read-JsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Assert-Equal {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Actual,
        [Parameter(Mandatory = $true)][string]$Expected
    )
    if ($Actual -ne $Expected) {
        throw "$Name esperava versao $Expected, mas encontrou $Actual."
    }
}

function Assert-FileContains {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Pattern
    )
    $content = Get-Content -LiteralPath $Path -Raw
    if ($content -notmatch $Pattern) {
        throw "$Name nao contem versao esperada $Version."
    }
}

$frontendPackagePath = Join-Path $root "frontend\package.json"
$frontendLockPath = Join-Path $root "frontend\package-lock.json"
$tauriConfigPath = Join-Path $root "frontend\src-tauri\tauri.conf.json"

$frontendPackage = Read-JsonFile -Path $frontendPackagePath
$tauriConfig = Read-JsonFile -Path $tauriConfigPath

Assert-Equal -Name "frontend/package.json" -Actual $frontendPackage.version -Expected $Version
Assert-FileContains -Name "frontend/package-lock.json root" -Path $frontendLockPath -Pattern "(?s)`"name`":\s*`"cronos`",\s*`"version`":\s*`"$([regex]::Escape($Version))`""
Assert-FileContains -Name "frontend/package-lock.json packages['']" -Path $frontendLockPath -Pattern "(?s)`"`":\s*\{\s*`"name`":\s*`"cronos`",\s*`"version`":\s*`"$([regex]::Escape($Version))`""
Assert-Equal -Name "tauri.conf.json" -Actual $tauriConfig.version -Expected $Version

Assert-FileContains -Name "Cargo.toml" -Path (Join-Path $root "frontend\src-tauri\Cargo.toml") -Pattern "(?m)^version\s*=\s*`"$([regex]::Escape($Version))`"$"
Assert-FileContains -Name "backend pyproject" -Path (Join-Path $root "backend\pyproject.toml") -Pattern "(?m)^version\s*=\s*`"$([regex]::Escape($Version))`"$"
Assert-FileContains -Name "backend __init__" -Path (Join-Path $root "backend\cronos\__init__.py") -Pattern "__version__\s*=\s*`"$([regex]::Escape($Version))`""
Assert-FileContains -Name "backend config" -Path (Join-Path $root "backend\cronos\core\config.py") -Pattern "self\.version\s*=\s*`"$([regex]::Escape($Version))`""
Assert-FileContains -Name "backend main" -Path (Join-Path $root "backend\cronos\main.py") -Pattern "version=`"$([regex]::Escape($Version))`""
Assert-FileContains -Name "frontend App" -Path (Join-Path $root "frontend\src\App.tsx") -Pattern "const CRONOS_VERSION = 'v$([regex]::Escape($Version))'"
Assert-FileContains -Name "runtimeConnection" -Path (Join-Path $root "frontend\src\services\runtimeConnection.ts") -Pattern "version: '$([regex]::Escape($Version))'"
Assert-FileContains -Name "Tauri runtime session" -Path (Join-Path $root "frontend\src-tauri\src\runtime\backend.rs") -Pattern "`"app_version`": `"$([regex]::Escape($Version))`""

if ($ManifestPath) {
    $resolvedManifest = if ([System.IO.Path]::IsPathRooted($ManifestPath)) { $ManifestPath } else { Join-Path $root $ManifestPath }
    if (!(Test-Path -LiteralPath $resolvedManifest)) {
        throw "Manifesto informado nao encontrado: $resolvedManifest"
    }
    $manifest = Read-JsonFile -Path $resolvedManifest
    Assert-Equal -Name "release-manifest.json" -Actual $manifest.version -Expected $Version
}

[pscustomobject]@{
    ok = $true
    version = $Version
    manifest = if ($ManifestPath) { $ManifestPath } else { $null }
} | ConvertTo-Json -Compress
