param(
  [Parameter(Mandatory = $true)]
  [string]$BuildDir
)

$ErrorActionPreference = "Stop"

$resolvedBuildDir = (Resolve-Path -LiteralPath $BuildDir).Path
$backend = Join-Path $resolvedBuildDir "cronos-backend.exe"
if (-not (Test-Path -LiteralPath $backend)) {
  throw "Backend entregue nao encontrado: $backend"
}

Get-Process -Name "cronos-backend","llama-server" -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "$resolvedBuildDir*" } |
  Stop-Process -Force -ErrorAction SilentlyContinue

$testRoot = Join-Path $env:TEMP ("Cronos Backend Delivered Test " + [guid]::NewGuid().ToString("N"))
$data = Join-Path $testRoot "LocalAppData\CRONOS"
$logs = Join-Path $data "logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

$bytes = New-Object byte[] 32
$rng = New-Object Security.Cryptography.RNGCryptoServiceProvider
$rng.GetBytes($bytes)
$rng.Dispose()
$runtimeToken = [Convert]::ToBase64String($bytes)
$sessionId = [guid]::NewGuid().ToString()
$stdout = Join-Path $logs "stdout.log"
$stderr = Join-Path $logs "stderr.log"
$resourceDir = Join-Path $resolvedBuildDir "resources"
$argLine = "--host 127.0.0.1 --port 0 --data-dir `"$data`" --log-dir `"$logs`" --runtime-token `"$runtimeToken`" --session-id $sessionId --environment desktop --resource-dir `"$resourceDir`""
$process = Start-Process -FilePath $backend -ArgumentList $argLine -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru

try {
  $port = $null
  $backendPid = $null
  $version = $null
  $deadline = (Get-Date).AddSeconds(45)
  while (-not $port) {
    if (Test-Path -LiteralPath $stdout) {
      foreach ($line in Get-Content -LiteralPath $stdout) {
        try {
          $event = $line | ConvertFrom-Json
          if ($event.event -eq "cronos_backend_ready") {
            $port = $event.port
            $backendPid = $event.pid
            $version = $event.version
          }
        } catch {
          continue
        }
      }
    }
    if (-not $port) {
      if ((Get-Date) -gt $deadline) {
        throw "Backend entregue nao emitiu ready."
      }
      Start-Sleep -Milliseconds 250
    }
  }

  $baseUrl = "http://127.0.0.1:$port"
  $health = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 5
  $identity = Invoke-RestMethod -Uri "$baseUrl/runtime/identity" -Headers @{ "X-Cronos-Runtime-Token" = $runtimeToken } -TimeoutSec 15
  $setup = Invoke-RestMethod -Uri "$baseUrl/setup/status" -TimeoutSec 5
  $owner = Invoke-RestMethod -Method Post -Uri "$baseUrl/setup/owner" -ContentType "application/json" -Body (@{
      name = "Alexandre Teste"
      password = "SenhaEntrega-2026"
      pin = "7291"
    } | ConvertTo-Json) -TimeoutSec 10
  $auth = @{ Authorization = "Bearer $($owner.token)" }
  $llmBefore = Invoke-RestMethod -Uri "$baseUrl/llm/status" -Headers $auth -TimeoutSec 10

  $timer = [Diagnostics.Stopwatch]::StartNew()
  $chat1 = Invoke-RestMethod -Method Post -Uri "$baseUrl/chat" -Headers $auth -ContentType "application/json" -Body (@{
      message = "Responda somente com CRONOS-TESTE-REAL-7291."
    } | ConvertTo-Json) -TimeoutSec 180
  $chat1Ms = $timer.ElapsedMilliseconds

  $timer.Restart()
  $chat2 = Invoke-RestMethod -Method Post -Uri "$baseUrl/chat" -Headers $auth -ContentType "application/json" -Body (@{
      message = "Qual codigo eu pedi na mensagem anterior?"
    } | ConvertTo-Json) -TimeoutSec 120
  $chat2Ms = $timer.ElapsedMilliseconds
  $llmAfter = Invoke-RestMethod -Uri "$baseUrl/llm/status" -Headers $auth -TimeoutSec 10

  $fallbackFound = (($chat1.content + "`n" + $chat2.content) -match "Estou rodando localmente no MVP do CRONOS|Ainda nao tenho um modelo de IA completo conectado")
  Invoke-RestMethod -Method Post -Uri "$baseUrl/runtime/shutdown" -Headers @{ "X-Cronos-Runtime-Token" = $runtimeToken } -TimeoutSec 5 | Out-Null
  Start-Sleep -Seconds 2
  $orphans = Get-Process -Name "cronos-backend","llama-server" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "$resolvedBuildDir*" }

  [ordered]@{
    ok = $true
    backend = $backend
    backendPid = $backendPid
    port = $port
    version = $version
    health = $health
    identity = $identity
    setupInitiallyConfigured = $setup.configured
    llmProviderBefore = $llmBefore.provider
    llmReadyBefore = $llmBefore.ready
    llmModelBefore = $llmBefore.model
    chat1 = $chat1.content
    chat1Ms = $chat1Ms
    chat2 = $chat2.content
    chat2Ms = $chat2Ms
    llmProviderAfter = $llmAfter.provider
    llmReadyAfter = $llmAfter.ready
    llmModelAfter = $llmAfter.model
    llamaPid = $llmAfter.pid
    llamaPort = $llmAfter.port
    fallbackFound = [bool]$fallbackFound
    orphanCount = @($orphans).Count
  } | ConvertTo-Json -Depth 10
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  Get-Process -Name "cronos-backend","llama-server" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "$resolvedBuildDir*" } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}
