$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not $env:CRONOS_VISUAL_TEST_PASSWORD -or -not $env:CRONOS_VISUAL_TEST_PIN) {
    throw "Defina CRONOS_VISUAL_TEST_PASSWORD e CRONOS_VISUAL_TEST_PIN antes de executar."
}

$root = (Get-Location).Path
$visualData = Join-Path $root "data\visual-test"
$backendPort = "8123"
$frontendPort = "5174"
$frontendUrl = "http://127.0.0.1:$frontendPort"
$backendUrl = "http://127.0.0.1:$backendPort"
$nodeModules = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
$codexPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$pythonExe = "python"
if (Test-Path $codexPython) {
    $pythonExe = $codexPython
}

if (Test-Path $visualData) {
    Remove-Item -LiteralPath $visualData -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $visualData | Out-Null

$backendScript = @"
`$env:PYTHONPATH='$root\backend'
`$env:CRONOS_ENV='visual-test'
`$env:CRONOS_DATA_DIR='$visualData'
`$env:CRONOS_PORT='$backendPort'
`$env:CRONOS_ALLOWED_ORIGINS='$frontendUrl'
`$env:CRONOS_VISUAL_TEST_PASSWORD='$($env:CRONOS_VISUAL_TEST_PASSWORD)'
`$env:CRONOS_VISUAL_TEST_PIN='$($env:CRONOS_VISUAL_TEST_PIN)'
& '$pythonExe' -m cronos.server
"@

$frontendScript = @"
Set-Location '$root\frontend'
`$env:VITE_CRONOS_API_URL='$backendUrl'
npm run dev -- --host 127.0.0.1 --port $frontendPort
"@

$backend = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-Command", $backendScript) -WorkingDirectory $root -WindowStyle Hidden -PassThru
$frontend = $null

try {
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            Invoke-RestMethod -Uri "$backendUrl/health" -TimeoutSec 1 | Out-Null
            $ready = $true
            break
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $ready) {
        throw "Backend visual-test nao respondeu em $backendUrl/health."
    }

    $frontend = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-Command", $frontendScript) -WorkingDirectory $root -WindowStyle Hidden -PassThru
    $frontendReady = $false
    for ($i = 0; $i -lt 40; $i++) {
        try {
            Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 1 | Out-Null
            $frontendReady = $true
            break
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $frontendReady) {
        throw "Frontend visual-test nao respondeu em $frontendUrl."
    }

    if (Test-Path $nodeModules) {
        $playwrightNestedModules = Join-Path $nodeModules "playwright\node_modules"
        $pnpmModules = Join-Path $nodeModules ".pnpm\node_modules"
        if (Test-Path $playwrightNestedModules) {
            $env:NODE_PATH = "$nodeModules;$playwrightNestedModules;$pnpmModules"
        } else {
            $env:NODE_PATH = "$nodeModules;$pnpmModules"
        }
    }
    $env:CRONOS_VISUAL_FRONTEND_URL = $frontendUrl
    node .\scripts\visual-login-capture.cjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    if ($frontend -and -not $frontend.HasExited) {
        Stop-Process -Id $frontend.Id -Force
    }
    if ($backend -and -not $backend.HasExited) {
        Stop-Process -Id $backend.Id -Force
    }
}
