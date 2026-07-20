param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$')]
    [string]$Version
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-TextFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-TextFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Value
    )
    [System.IO.File]::WriteAllText($Path, $Value, $utf8NoBom)
}

$frontendPackagePath = Join-Path $root "frontend\package.json"
$frontendPackage = Read-TextFile -Path $frontendPackagePath
$frontendPackage = $frontendPackage -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
Write-TextFile -Path $frontendPackagePath -Value $frontendPackage

$tauriConfigPath = Join-Path $root "frontend\src-tauri\tauri.conf.json"
$tauriConfig = Read-TextFile -Path $tauriConfigPath
$tauriConfig = $tauriConfig -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
Write-TextFile -Path $tauriConfigPath -Value $tauriConfig

$cargoTomlPath = Join-Path $root "frontend\src-tauri\Cargo.toml"
$cargoToml = Read-TextFile -Path $cargoTomlPath
$cargoToml = $cargoToml -replace '(?m)^version\s*=\s*".+"$', "version = `"$Version`""
Write-TextFile -Path $cargoTomlPath -Value $cargoToml

$pyprojectPath = Join-Path $root "backend\pyproject.toml"
$pyproject = Read-TextFile -Path $pyprojectPath
$pyproject = $pyproject -replace '(?m)^version = ".+"$', "version = `"$Version`""
Write-TextFile -Path $pyprojectPath -Value $pyproject

$backendInitPath = Join-Path $root "backend\cronos\__init__.py"
$backendInit = Read-TextFile -Path $backendInitPath
$backendInit = $backendInit -replace '__version__ = ".+"', "__version__ = `"$Version`""
Write-TextFile -Path $backendInitPath -Value $backendInit

$backendConfigPath = Join-Path $root "backend\cronos\core\config.py"
$backendConfig = Read-TextFile -Path $backendConfigPath
$backendConfig = $backendConfig -replace 'self\.version = ".+"', "self.version = `"$Version`""
Write-TextFile -Path $backendConfigPath -Value $backendConfig

$backendMainPath = Join-Path $root "backend\cronos\main.py"
$backendMain = Read-TextFile -Path $backendMainPath
$backendMain = $backendMain -replace 'version=".+"', "version=`"$Version`""
$backendMain = $backendMain -replace '"version": ".+"', "`"version`": `"$Version`""
Write-TextFile -Path $backendMainPath -Value $backendMain

$runtimeBackendPath = Join-Path $root "frontend\src-tauri\src\runtime\backend.rs"
$runtimeBackend = Read-TextFile -Path $runtimeBackendPath
$runtimeBackend = $runtimeBackend -replace '\.unwrap_or\(".*"\)', ".unwrap_or(`"$Version`")"
$runtimeBackend = $runtimeBackend -replace '"app_version": ".*"', "`"app_version`": `"$Version`""
Write-TextFile -Path $runtimeBackendPath -Value $runtimeBackend

$appPath = Join-Path $root "frontend\src\App.tsx"
$app = Read-TextFile -Path $appPath
$app = $app -replace "const CRONOS_VERSION = 'v[^']+'", "const CRONOS_VERSION = 'v$Version'"
Write-TextFile -Path $appPath -Value $app

[pscustomobject]@{
    ok = $true
    version = $Version
    files = @(
        "frontend\package.json",
        "frontend\src-tauri\tauri.conf.json",
        "frontend\src-tauri\Cargo.toml",
        "backend\pyproject.toml",
        "backend\cronos\__init__.py",
        "backend\cronos\core\config.py",
        "backend\cronos\main.py",
        "frontend\src-tauri\src\runtime\backend.rs",
        "frontend\src\App.tsx"
    )
} | ConvertTo-Json -Compress
