param(
    [string]$BackendExe
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
if (!$BackendExe) {
    $BackendExe = Join-Path $root "backend\dist\cronos-backend-console.exe"
}
if (!(Test-Path $BackendExe)) {
    throw "Backend empacotado nao encontrado: $BackendExe"
}

$temp = Join-Path $env:TEMP "Cronos Backend Package Test"
New-Item -ItemType Directory -Force -Path $temp | Out-Null
$data = Join-Path $temp "Local AppData Com Espacos"
$logs = Join-Path $data "logs"
$stdout = Join-Path $temp "stdout.log"
$stderr = Join-Path $temp "stderr.log"

$tokenBytes = New-Object byte[] 32
$rng = [Security.Cryptography.RNGCryptoServiceProvider]::Create()
$rng.GetBytes($tokenBytes)
$runtimeToken = [Convert]::ToBase64String($tokenBytes)
$sessionId = [guid]::NewGuid().ToString()

$argsLine = "--host 127.0.0.1 --port 0 --data-dir `"$data`" --log-dir `"$logs`" --runtime-token `"$runtimeToken`" --session-id $sessionId --environment desktop"
$process = Start-Process -FilePath $BackendExe -ArgumentList $argsLine -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru

try {
    $ready = $null
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $stdout) {
            foreach ($line in Get-Content -LiteralPath $stdout) {
                if ($line -match "cronos_backend_ready") {
                    $ready = $line | ConvertFrom-Json
                    break
                }
            }
        }
        if ($ready) {
            break
        }
        if ($process.HasExited) {
            throw "Backend encerrou antes do ready. STDERR: $(Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue)"
        }
        Start-Sleep -Milliseconds 250
    }
    if (!$ready) {
        throw "Evento cronos_backend_ready nao encontrado."
    }

    $baseUrl = "http://127.0.0.1:$($ready.port)"
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 5
    if ($health.status -ne "ok" -or $health.readiness -ne "ready") {
        throw "Healthcheck inesperado: $($health | ConvertTo-Json -Compress)"
    }

    $badStatus = 0
    try {
        Invoke-RestMethod -Uri "$baseUrl/runtime/status" -Headers @{ "X-Cronos-Runtime-Token" = "invalid" } -TimeoutSec 5 | Out-Null
    } catch {
        $badStatus = [int]$_.Exception.Response.StatusCode
    }
    if ($badStatus -ne 401) {
        throw "Token incorreto deveria retornar 401; retornou $badStatus"
    }

    $status = Invoke-RestMethod -Uri "$baseUrl/runtime/status" -Headers @{ "X-Cronos-Runtime-Token" = $runtimeToken } -TimeoutSec 5
    if ($status.session_id -ne $sessionId) {
        throw "Session id inesperado no runtime/status."
    }

    $shutdown = Invoke-RestMethod -Method Post -Uri "$baseUrl/runtime/shutdown" -Headers @{ "X-Cronos-Runtime-Token" = $runtimeToken } -TimeoutSec 5
    if (!$shutdown.accepted) {
        throw "Shutdown nao foi aceito."
    }
    $process.WaitForExit(5000) | Out-Null
    if (!$process.HasExited) {
        throw "Backend nao encerrou apos shutdown."
    }
    if (!(Test-Path (Join-Path $data "configuration\installation.json"))) {
        throw "installation.json nao foi criado."
    }

    [pscustomobject]@{
        ok = $true
        exe = $BackendExe
        port = $ready.port
        dataDir = $data
        sessionId = $sessionId
        exited = $process.HasExited
    } | ConvertTo-Json -Compress
} finally {
    if ($process -and !$process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
}
