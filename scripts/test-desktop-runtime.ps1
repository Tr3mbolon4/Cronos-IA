$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
& (Join-Path $PSScriptRoot "build-backend.ps1")
& (Join-Path $PSScriptRoot "prepare-sidecar.ps1")

Set-Location (Join-Path $root "frontend")
npm run tauri:build

$exe = Join-Path $root "frontend\src-tauri\target\release\cronos-desktop.exe"
if (!(Test-Path $exe)) {
    throw "Executavel desktop nao encontrado: $exe"
}

$logDir = Join-Path $env:TEMP "cronos-desktop-runtime-test"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$process = Start-Process -FilePath $exe -PassThru
try {
    Start-Sleep -Seconds 10
    $backend = Get-Process -Name "cronos-backend" -ErrorAction SilentlyContinue
    if (!$backend) {
        throw "Processo cronos-backend nao foi detectado."
    }
    $process.CloseMainWindow() | Out-Null
    Start-Sleep -Seconds 5
    $backendAfter = Get-Process -Name "cronos-backend" -ErrorAction SilentlyContinue
    if ($backendAfter) {
        throw "Processo cronos-backend permaneceu apos fechamento do desktop."
    }
    [pscustomobject]@{
        ok = $true
        desktop = $exe
        backendDetected = $true
        orphanBackend = $false
    } | ConvertTo-Json -Compress
} finally {
    if ($process -and !$process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
}
