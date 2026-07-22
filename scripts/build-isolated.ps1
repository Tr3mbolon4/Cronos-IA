param(
  [string]$OutputRoot,
  [string]$ReportPath,
  [switch]$SkipCompilation
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
if (-not $OutputRoot) {
  $OutputRoot = Join-Path $env:TEMP "CRONOS-v0.3.0-isolated-build"
}
if (-not $ReportPath) {
  $ReportPath = Join-Path $root "docs\diagnostics\v0.3.0-isolated-build-test.json"
}

$script:Steps = @()

function ConvertTo-SafeError {
  param([object]$ErrorObject)
  $message = if ($ErrorObject.Exception) { $ErrorObject.Exception.Message } else { [string]$ErrorObject }
  $message = $message -replace [regex]::Escape($root), "<repo>"
  $message = $message -replace [regex]::Escape($env:USERPROFILE), "<user>"
  return $message
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )
  $started = Get-Date
  $entry = [ordered]@{
    name = $Name
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

function Assert-Utf8JsonNoBom {
  param([string]$Path)
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -eq 0) {
    throw "Manifest JSON vazio: $Path"
  }
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    throw "Manifest JSON possui UTF-8 BOM e falharia no parser Rust: $Path"
  }
  if ($bytes.Length -ge 2 -and (($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) -or ($bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF))) {
    throw "Manifest JSON esta em UTF-16 e falharia no parser Rust: $Path"
  }
  $strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
  try {
    $text = $strictUtf8.GetString($bytes)
  } catch {
    throw "Manifest JSON nao e UTF-8 valido: $Path. $($_.Exception.Message)"
  }
  if ($text.TrimStart().StartsWith("<")) {
    throw "Manifest JSON parece HTML: $Path"
  }
  if ($text.StartsWith("version https://git-lfs.github.com/spec/v1")) {
    throw "Manifest JSON e ponteiro Git LFS: $Path"
  }
  try {
    return $text | ConvertFrom-Json
  } catch {
    throw "Manifest JSON nao parseavel: $Path. $($_.Exception.Message)"
  }
}

function Assert-DeliveredWhisperManifest {
  param([string]$BuildDir)
  $baseDir = Join-Path $BuildDir "resources\voice\whisper"
  $manifestPath = Join-Path $baseDir "manifest.json"
  $manifest = Assert-Utf8JsonNoBom -Path $manifestPath
  $required = @("provider", "runtimeVersion", "runtimeFile", "runtimeSha256", "runtimeSize", "modelName", "modelFile", "modelSha256", "modelSize", "modelVariant", "multilingual", "integrityValidated")
  foreach ($field in $required) {
    if (-not $manifest.PSObject.Properties.Name.Contains($field)) {
      throw "Manifest local de voz entregue sem campo obrigatorio: $field"
    }
  }
  foreach ($relative in @($manifest.runtimeFile, $manifest.modelFile)) {
    if ([System.IO.Path]::IsPathRooted([string]$relative)) {
      throw "Manifest local de voz entregue contem caminho absoluto: $relative"
    }
    $path = Join-Path $baseDir ([string]$relative)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Manifest local de voz entregue referencia arquivo ausente: $path"
    }
  }
  $runtimePath = Join-Path $baseDir ([string]$manifest.runtimeFile)
  $modelPath = Join-Path $baseDir ([string]$manifest.modelFile)
  $runtimeHash = (Get-FileHash -LiteralPath $runtimePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $modelHash = (Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($runtimeHash -ne ([string]$manifest.runtimeSha256).ToLowerInvariant()) {
    throw "Manifest local de voz entregue possui SHA-256 divergente para runtime."
  }
  if ($modelHash -ne ([string]$manifest.modelSha256).ToLowerInvariant()) {
    throw "Manifest local de voz entregue possui SHA-256 divergente para modelo."
  }
  if ((Get-Item -LiteralPath $runtimePath).Length -ne [int64]$manifest.runtimeSize) {
    throw "Manifest local de voz entregue possui tamanho divergente para runtime."
  }
  if ((Get-Item -LiteralPath $modelPath).Length -ne [int64]$manifest.modelSize) {
    throw "Manifest local de voz entregue possui tamanho divergente para modelo."
  }
  @{
    manifest = $manifestPath
    bytes = (Get-Item -LiteralPath $manifestPath).Length
    runtime = $runtimePath
    model = $modelPath
    provider = $manifest.provider
    modelName = $manifest.modelName
  }
}

function Save-Report {
  param([string]$Status, [string]$ErrorMessage = $null, [string]$BuildDir = $null)
  $reportDir = Split-Path -Parent $ReportPath
  New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
  [ordered]@{
    phase = "v0.3.0-final-desktop-voice-real-use"
    status = $Status
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    buildDir = $BuildDir
    reportPath = $ReportPath
    error = $ErrorMessage
    steps = $script:Steps
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
}

$script:BuildDir = $null
try {
  Invoke-Step "start" { "build-isolated" }

  Invoke-Step "cleanup-existing-processes" {
    Get-Process -Name "cronos-desktop","cronos-backend","cronos-backend-console","llama-server","whisper-cli" -ErrorAction SilentlyContinue |
      Stop-Process -Force -ErrorAction SilentlyContinue
    @{ stopped = $true }
  }

  Invoke-Step "write-build-identity" {
    Set-Location $root
    & (Join-Path $PSScriptRoot "write-build-info.ps1") -Version "v0.3.0" | ConvertFrom-Json
  }

  Invoke-Step "validate-resources" {
    $required = @(
      "frontend\src-tauri\resources\build-info.json",
      "frontend\src-tauri\resources\ai\llm\manifest.json",
      "frontend\src-tauri\resources\ai\llm\bin\llama-server.exe",
      "frontend\src-tauri\resources\ai\llm\models\qwen2.5-1.5b-instruct-q4_k_m.gguf",
      "frontend\src-tauri\resources\ai\embeddings\manifest.json",
      "frontend\src-tauri\resources\voice\whisper\manifest.json",
      "frontend\src-tauri\resources\voice\whisper\bin\whisper-cli.exe",
      "frontend\src-tauri\resources\voice\whisper\bin\whisper.dll",
      "frontend\src-tauri\resources\voice\whisper\bin\ggml-base.dll",
      "frontend\src-tauri\resources\voice\whisper\bin\ggml-cpu.dll",
      "frontend\src-tauri\resources\voice\whisper\bin\ggml.dll",
      "frontend\src-tauri\resources\voice\whisper\models\ggml-base.bin"
    )
    $missing = @()
    foreach ($relative in $required) {
      if (-not (Test-Path -LiteralPath (Join-Path $root $relative))) {
        $missing += $relative
      }
    }
    if ($missing.Count -gt 0) {
      throw "Recursos ausentes para build isolada: $($missing -join ', ')"
    }
    @{ required = $required.Count; missing = 0 }
  }

  if (-not $SkipCompilation) {
    Invoke-Step "backend-pyinstaller" {
      Set-Location $root
      & (Join-Path $PSScriptRoot "build-backend.ps1")
    }

    Invoke-Step "prepare-sidecar" {
      Set-Location $root
      & (Join-Path $PSScriptRoot "prepare-sidecar.ps1")
    }

    Invoke-Step "frontend-build" {
      Set-Location (Join-Path $root "frontend")
      npm run build
    }

    Invoke-Step "tauri-build" {
      Set-Location (Join-Path $root "frontend")
      npm run tauri:build
    }
  } else {
    Invoke-Step "skip-compilation" { "using existing target/release artifacts" }
  }

  Invoke-Step "prepare-isolated-folder" {
    $releaseDir = Join-Path $root "frontend\src-tauri\target\release"
    $exe = Join-Path $releaseDir "cronos-desktop.exe"
    $backend = Join-Path $releaseDir "cronos-backend.exe"
    $resources = Join-Path $root "frontend\src-tauri\resources"
    foreach ($path in @($exe, $backend, $resources)) {
      if (-not (Test-Path -LiteralPath $path)) {
        throw "Artefato release ausente: $path"
      }
    }
    $script:BuildDir = Join-Path $OutputRoot ("build-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
    if (Test-Path -LiteralPath $script:BuildDir) {
      Remove-Item -LiteralPath $script:BuildDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $script:BuildDir | Out-Null
    Copy-Item -LiteralPath $exe -Destination $script:BuildDir -Force
    Copy-Item -LiteralPath $backend -Destination $script:BuildDir -Force
    Copy-Item -LiteralPath $resources -Destination (Join-Path $script:BuildDir "resources") -Recurse -Force
    $fileCount = (Get-ChildItem -LiteralPath $script:BuildDir -Recurse -File | Measure-Object).Count
    $bytes = (Get-ChildItem -LiteralPath $script:BuildDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
    @{ path = $script:BuildDir; files = $fileCount; bytes = [int64]$bytes }
  }

  Invoke-Step "validate-isolated-artifacts" {
    $required = @(
      "cronos-desktop.exe",
      "cronos-backend.exe",
      "resources\build-info.json",
      "resources\ai\llm\manifest.json",
      "resources\ai\llm\bin\llama-server.exe",
      "resources\ai\llm\models\qwen2.5-1.5b-instruct-q4_k_m.gguf",
      "resources\ai\embeddings\manifest.json",
      "resources\voice\whisper\manifest.json",
      "resources\voice\whisper\bin\whisper-cli.exe",
      "resources\voice\whisper\bin\whisper.dll",
      "resources\voice\whisper\bin\ggml-base.dll",
      "resources\voice\whisper\bin\ggml-cpu.dll",
      "resources\voice\whisper\bin\ggml.dll",
      "resources\voice\whisper\models\ggml-base.bin"
    )
    $missing = @()
    foreach ($relative in $required) {
      if (-not (Test-Path -LiteralPath (Join-Path $script:BuildDir $relative))) {
        $missing += $relative
      }
    }
    if ($missing.Count -gt 0) {
      throw "Build isolada incompleta: $($missing -join ', ')"
    }
    $voice = Assert-DeliveredWhisperManifest -BuildDir $script:BuildDir
    @{ required = $required.Count; missing = 0; voice = $voice }
  }

  Save-Report -Status "passed" -BuildDir $script:BuildDir
  [ordered]@{ ok = $true; buildDir = $script:BuildDir; report = $ReportPath; steps = $script:Steps } | ConvertTo-Json -Depth 8
} catch {
  $safe = ConvertTo-SafeError $_
  Save-Report -Status "failed" -ErrorMessage $safe -BuildDir $script:BuildDir
  throw
} finally {
  Set-Location $root
}
