$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$venvPython = Join-Path $root ".venv-packaging\Scripts\python.exe"
$spec = Join-Path $backend "packaging\cronos-backend.spec"
$buildDir = Join-Path $backend "build"
$distDir = Join-Path $backend "dist"
$consoleExe = Join-Path $distDir "cronos-backend-console.exe"
$prodExe = Join-Path $distDir "cronos-backend.exe"

if (!(Test-Path $venvPython)) {
    throw "Ambiente .venv-packaging nao encontrado em $venvPython"
}

& $venvPython -m PyInstaller --version | Out-Null

Get-Process -Name "cronos-backend","cronos-backend-console" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $buildDir) {
    Remove-Item -LiteralPath $buildDir -Recurse -Force
}
if (Test-Path $distDir) {
    Remove-Item -LiteralPath $distDir -Recurse -Force
}

& $venvPython -m PyInstaller --clean --noconfirm --distpath $distDir --workpath $buildDir $spec

foreach ($exe in @($consoleExe, $prodExe)) {
    if (!(Test-Path $exe)) {
        throw "Executavel nao encontrado: $exe"
    }
    $item = Get-Item -LiteralPath $exe
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $exe).Hash
    Write-Host "$($item.Name) | $($item.Length) bytes | SHA256 $hash"
}

$testScript = Join-Path $PSScriptRoot "test-backend-package.ps1"
& $testScript -BackendExe $consoleExe
