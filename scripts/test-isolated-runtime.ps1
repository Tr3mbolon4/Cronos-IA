param(
  [Parameter(Mandatory = $true)]
  [string]$BuildDir,
  [string]$ReportPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$root = Split-Path -Parent $PSScriptRoot
if (-not $ReportPath) {
  $ReportPath = Join-Path $root "docs\diagnostics\v0.3.0-desktop-timeout-analysis.json"
}

$script:Steps = @()
$script:DesktopProcess = $null
$script:BackendProcess = $null
$script:BaseUrl = $null
$script:AuthToken = $null
$script:TestRoot = $null
$script:ResolvedBuildDir = (Resolve-Path -LiteralPath $BuildDir).Path
$oldLocalAppData = $env:LOCALAPPDATA

function ConvertTo-SafeError {
  param([object]$ErrorObject)
  $message = if ($ErrorObject.Exception) { $ErrorObject.Exception.Message } else { [string]$ErrorObject }
  $message = $message -replace [regex]::Escape($root), "<repo>"
  $message = $message -replace [regex]::Escape($env:USERPROFILE), "<user>"
  if ($script:TestRoot) {
    $message = $message -replace [regex]::Escape($script:TestRoot), "<test-root>"
  }
  return $message
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action,
    [int]$TimeoutSeconds = 0
  )
  $started = Get-Date
  $entry = [ordered]@{
    name = $Name
    timeoutSeconds = $TimeoutSeconds
    startedAt = $started.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    finishedAt = $null
    durationMs = $null
    result = "running"
    error = $null
  }
  try {
    $output = & $Action
    $entry.result = "passed"
    if ($null -ne $output) {
      $entry.output = $output
    }
  } catch {
    $entry.result = "failed"
    $entry.error = ConvertTo-SafeError $_
    throw
  } finally {
    $finished = Get-Date
    $entry.finishedAt = $finished.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $entry.durationMs = [int][Math]::Round(($finished - $started).TotalMilliseconds)
    $script:Steps += [pscustomobject]$entry
  }
}

function Save-Report {
  param([string]$Status, [string]$ErrorMessage = $null)
  $reportDir = Split-Path -Parent $ReportPath
  New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
  $processes = Get-Process -Name "cronos-desktop","cronos-backend","cronos-backend-console","llama-server","whisper-cli" -ErrorAction SilentlyContinue |
    Select-Object ProcessName, Id, Path
  [ordered]@{
    phase = "v0.3.0-final-desktop-voice-real-use"
    status = $Status
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    buildDir = $BuildDir
    reportPath = $ReportPath
    baseUrl = $script:BaseUrl
    error = $ErrorMessage
    steps = $script:Steps
    remainingProcesses = $processes
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
}

function Wait-ForFile {
  param([string]$Path, [int]$TimeoutSeconds)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while (-not (Test-Path -LiteralPath $Path)) {
    if ((Get-Date) -gt $deadline) {
      throw "Arquivo nao criado dentro do prazo: $Path"
    }
    Start-Sleep -Milliseconds 250
  }
}

function Wait-ForHealth {
  param([string]$Url, [int]$TimeoutSeconds)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $attempts = 0
  $lastError = $null
  while ((Get-Date) -lt $deadline) {
    $attempts++
    try {
      $health = Invoke-RestMethod -Uri $Url -TimeoutSec 2
      if ($health.status -eq "ok" -or $health.readiness -eq "ready") {
        return @{ attempts = $attempts; health = $health }
      }
      $lastError = "status=$($health.status) readiness=$($health.readiness)"
    } catch {
      $lastError = ConvertTo-SafeError $_
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Health check nao ficou pronto. attempts=$attempts lastError=$lastError"
}

function New-TestPdf {
  param([string]$Path)
  $stream = "BT /F1 12 Tf 50 750 Td (Teste funcional do CRONOS. A chave documental e AZUL-4729. O sistema validado chama-se CRONOS.) Tj ET"
  $length = [Text.Encoding]::ASCII.GetByteCount($stream)
  $objects = @(
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length $length >>`nstream`n$stream`nendstream"
  )
  $builder = New-Object System.Text.StringBuilder
  [void]$builder.Append("%PDF-1.4`n")
  $offsets = New-Object System.Collections.Generic.List[int]
  for ($index = 0; $index -lt $objects.Count; $index++) {
    $offsets.Add([Text.Encoding]::ASCII.GetByteCount($builder.ToString()))
    [void]$builder.Append("$($index + 1) 0 obj`n$($objects[$index])`nendobj`n")
  }
  $xrefOffset = [Text.Encoding]::ASCII.GetByteCount($builder.ToString())
  [void]$builder.Append("xref`n0 6`n")
  [void]$builder.Append("0000000000 65535 f `n")
  foreach ($offset in $offsets) {
    [void]$builder.Append(("{0:0000000000} 00000 n `n" -f $offset))
  }
  [void]$builder.Append("trailer`n<< /Root 1 0 R /Size 6 >>`nstartxref`n$xrefOffset`n%%EOF`n")
  [System.IO.File]::WriteAllText($Path, $builder.ToString(), [System.Text.Encoding]::ASCII)
}

try {
  Invoke-Step "start" { "test-isolated-runtime" }

  Invoke-Step "validate-isolated-build" -TimeoutSeconds 30 {
    $required = @("cronos-desktop.exe", "cronos-backend.exe", "resources\ai\llm\manifest.json", "resources\ai\llm\bin\llama-server.exe", "resources\ai\llm\models\qwen2.5-1.5b-instruct-q4_k_m.gguf")
    $missing = @()
    foreach ($relative in $required) {
      if (-not (Test-Path -LiteralPath (Join-Path $BuildDir $relative))) {
        $missing += $relative
      }
    }
    if ($missing.Count -gt 0) {
      throw "Build isolada incompleta: $($missing -join ', ')"
    }
    @{ required = $required.Count; missing = 0 }
  }

  Invoke-Step "prepare-test-localappdata" -TimeoutSeconds 30 {
    $script:TestRoot = Join-Path $env:TEMP ("Cronos Isolated Runtime Test " + [guid]::NewGuid().ToString())
    $testLocalAppData = Join-Path $script:TestRoot "LocalAppData"
    New-Item -ItemType Directory -Force -Path $testLocalAppData | Out-Null
    $env:LOCALAPPDATA = $testLocalAppData
    @{ localAppData = $testLocalAppData }
  }

  Invoke-Step "start-desktop" -TimeoutSeconds 30 {
    $exe = Join-Path $BuildDir "cronos-desktop.exe"
    $script:DesktopProcess = Start-Process -FilePath $exe -WorkingDirectory $BuildDir -PassThru
    @{ pid = $script:DesktopProcess.Id; path = $exe }
  }

  Invoke-Step "wait-current-session" -TimeoutSeconds 30 {
    $sessionFile = Join-Path $env:LOCALAPPDATA "CRONOS\runtime\current-session.json"
    Wait-ForFile -Path $sessionFile -TimeoutSeconds 30
    $session = Get-Content -LiteralPath $sessionFile -Raw | ConvertFrom-Json
    $script:BaseUrl = "http://127.0.0.1:$($session.port)"
    @{ port = $session.port; backendPid = $session.pid; status = $session.status; version = $session.app_version }
  }

  Invoke-Step "detect-backend" -TimeoutSeconds 30 {
    $deadline = (Get-Date).AddSeconds(30)
    while (-not $script:BackendProcess -and (Get-Date) -lt $deadline) {
      $script:BackendProcess = Get-Process -Name "cronos-backend" -ErrorAction SilentlyContinue | Select-Object -First 1
      if (-not $script:BackendProcess) {
        Start-Sleep -Milliseconds 250
      }
    }
    if (-not $script:BackendProcess) {
      throw "Processo cronos-backend nao foi detectado."
    }
    @{ pid = $script:BackendProcess.Id; path = $script:BackendProcess.Path }
  }

  Invoke-Step "health-check" -TimeoutSeconds 30 {
    Wait-ForHealth -Url "$script:BaseUrl/health" -TimeoutSeconds 30
  }

  Invoke-Step "login" -TimeoutSeconds 30 {
    $setup = Invoke-RestMethod -Uri "$script:BaseUrl/setup/status" -TimeoutSec 5
    if ($setup.configured) {
      throw "Diretorio de teste deveria iniciar sem proprietario configurado."
    }
    $ownerPayload = @{ name = "Alexandre"; password = "SenhaRuntime-2026"; pin = "2468" } | ConvertTo-Json
    $created = Invoke-RestMethod -Method Post -Uri "$script:BaseUrl/setup/owner" -ContentType "application/json" -Body $ownerPayload -TimeoutSec 10
    $script:AuthToken = $created.token
    if (-not $script:AuthToken) {
      throw "Setup nao retornou token de sessao."
    }
    @{ owner = "created"; token = "redacted" }
  }

  Invoke-Step "llama-server-load-and-chat" -TimeoutSeconds 180 {
    $headers = @{ Authorization = "Bearer $script:AuthToken" }
    $payload = @{ message = "Responda somente com: CRONOS FUNCIONANDO." } | ConvertTo-Json
    $started = Get-Date
    $chat = Invoke-RestMethod -Method Post -Uri "$script:BaseUrl/chat" -Headers $headers -ContentType "application/json" -Body $payload -TimeoutSec 180
    $elapsed = [int][Math]::Round(((Get-Date) - $started).TotalMilliseconds)
    $llm = Invoke-RestMethod -Uri "$script:BaseUrl/llm/status" -Headers $headers -TimeoutSec 10
    if ($chat.role -ne "assistant") {
      throw "Chat nao retornou resposta do assistente."
    }
    @{ answer = $chat.content; firstResponseMs = $elapsed; llmStatus = $llm.status; llamaPid = $llm.pid; port = $llm.port }
  }

  Invoke-Step "warm-chat" -TimeoutSeconds 60 {
    $headers = @{ Authorization = "Bearer $script:AuthToken" }
    $payload = @{ message = "Explique em uma frase o que e uma VLAN." } | ConvertTo-Json
    $started = Get-Date
    $chat = Invoke-RestMethod -Method Post -Uri "$script:BaseUrl/chat" -Headers $headers -ContentType "application/json" -Body $payload -TimeoutSec 60
    @{ answerPreview = [string]$chat.content.Substring(0, [Math]::Min(120, $chat.content.Length)); responseMs = [int][Math]::Round(((Get-Date) - $started).TotalMilliseconds) }
  }

  Invoke-Step "upload-pdf" -TimeoutSeconds 30 {
    $headers = @{ Authorization = "Bearer $script:AuthToken" }
    $pdfPath = Join-Path $script:TestRoot "runtime-test.pdf"
    New-TestPdf -Path $pdfPath
    $client = New-Object System.Net.Http.HttpClient
    $client.Timeout = [TimeSpan]::FromSeconds(30)
    $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $script:AuthToken)
    $form = New-Object System.Net.Http.MultipartFormDataContent
    $fileBytes = [System.IO.File]::ReadAllBytes($pdfPath)
    $fileContent = New-Object System.Net.Http.ByteArrayContent -ArgumentList (, $fileBytes)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/pdf")
    $form.Add($fileContent, "file", "runtime-test.pdf")
    $response = $client.PostAsync("$script:BaseUrl/documents/upload", $form).Result
    $body = $response.Content.ReadAsStringAsync().Result
    if (-not $response.IsSuccessStatusCode) {
      throw "Upload PDF falhou: $($response.StatusCode) $body"
    }
    $json = $body | ConvertFrom-Json
    @{ id = $json.id; pages = $json.page_count; chunks = $json.chunk_count; indexing = $json.indexing_status }
  }

  Invoke-Step "lock-session" -TimeoutSeconds 30 {
    $headers = @{ Authorization = "Bearer $script:AuthToken" }
    Invoke-RestMethod -Method Post -Uri "$script:BaseUrl/auth/lock" -Headers $headers -TimeoutSec 10 | Out-Null
    $lockedStatus = 0
    try {
      Invoke-RestMethod -Uri "$script:BaseUrl/auth/session" -Headers $headers -TimeoutSec 5 | Out-Null
    } catch {
      $lockedStatus = [int]$_.Exception.Response.StatusCode
    }
    if ($lockedStatus -ne 401) {
      throw "Sessao bloqueada deveria retornar 401; retornou $lockedStatus"
    }
    @{ locked = $true }
  }

  Invoke-Step "shutdown" -TimeoutSeconds 30 {
    if ($script:DesktopProcess -and -not $script:DesktopProcess.HasExited) {
      $script:DesktopProcess.CloseMainWindow() | Out-Null
      $deadline = (Get-Date).AddSeconds(30)
      while (-not $script:DesktopProcess.HasExited -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 250
      }
      if (-not $script:DesktopProcess.HasExited) {
        Stop-Process -Id $script:DesktopProcess.Id -Force
      }
    }
    Start-Sleep -Seconds 2
    @{ closed = $true }
  }

  Invoke-Step "orphan-process-check" -TimeoutSeconds 30 {
    $orphans = Get-Process -Name "cronos-desktop","cronos-backend","cronos-backend-console","llama-server","whisper-cli" -ErrorAction SilentlyContinue
    if ($orphans) {
      throw "Processos orfaos encontrados: $($orphans.ProcessName -join ', ')"
    }
    @{ orphanProcesses = 0 }
  }

  Save-Report -Status "passed"
  [ordered]@{ ok = $true; report = $ReportPath; baseUrl = $script:BaseUrl; steps = $script:Steps } | ConvertTo-Json -Depth 8
} catch {
  $safe = ConvertTo-SafeError $_
  Save-Report -Status "failed" -ErrorMessage $safe
  throw
} finally {
  $env:LOCALAPPDATA = $oldLocalAppData
  if ($script:DesktopProcess -and -not $script:DesktopProcess.HasExited) {
    Stop-Process -Id $script:DesktopProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Get-Process -Name "cronos-backend","cronos-backend-console","llama-server" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "$script:ResolvedBuildDir*" -or $_.Path -like "$root*" -or $_.Path -like "*CRONOS-v0.3.0-isolated-build*" } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}
