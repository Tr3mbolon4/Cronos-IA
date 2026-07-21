param(
  [string]$WhisperVersion = "v1.8.5",
  [string]$RuntimeSha256,
  [string]$ModelSha256,
  [string]$RuntimeArchiveUrl,
  [string]$ModelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  [switch]$UseExistingFiles
)

$ErrorActionPreference = "Stop"

function Assert-Sha256 {
  param([string]$Path, [string]$Expected, [string]$Label)
  if (-not $Expected -or $Expected -eq "TO_BE_FILLED_BY_PREPARE_SCRIPT") {
    throw "$Label SHA-256 esperado deve ser informado explicitamente."
  }
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $Expected.ToLowerInvariant()) {
    throw "$Label SHA-256 divergente. Esperado=$Expected Real=$actual"
  }
  return $actual
}

function Invoke-VerifiedDownload {
  param([string]$Url, [string]$OutFile)
  if (-not $Url.StartsWith("https://")) {
    throw "Download recusado: origem sem HTTPS."
  }
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$resourceRoot = Join-Path $repoRoot "frontend\src-tauri\resources\voice\whisper"
$binDir = Join-Path $resourceRoot "bin"
$modelDir = Join-Path $resourceRoot "models"
$licenseDir = Join-Path $resourceRoot "licenses"
$manifestPath = Join-Path $resourceRoot "manifest.json"
$runtimePath = Join-Path $binDir "whisper-cli.exe"
$modelPath = Join-Path $modelDir "ggml-base.bin"
$tempDir = Join-Path $repoRoot ".tmp\local-whisper"

New-Item -ItemType Directory -Force -Path $binDir, $modelDir, $licenseDir, $tempDir | Out-Null

if (-not $UseExistingFiles) {
  if (-not $RuntimeArchiveUrl) {
    throw "Informe -RuntimeArchiveUrl oficial ou use -UseExistingFiles apos preparar whisper-cli.exe manualmente."
  }
  $archive = Join-Path $tempDir "whisper-runtime.zip"
  Invoke-VerifiedDownload -Url $RuntimeArchiveUrl -OutFile $archive
  Expand-Archive -LiteralPath $archive -DestinationPath $tempDir -Force
  $runtime = Get-ChildItem -Path $tempDir -Recurse -Filter "whisper-cli.exe" | Select-Object -First 1
  if (-not $runtime) {
    throw "whisper-cli.exe nao encontrado no pacote informado."
  }
  Copy-Item -LiteralPath $runtime.FullName -Destination $runtimePath -Force
  Invoke-VerifiedDownload -Url $ModelUrl -OutFile $modelPath
}

if (-not (Test-Path -LiteralPath $runtimePath)) {
  throw "Runtime ausente: $runtimePath"
}
if (-not (Test-Path -LiteralPath $modelPath)) {
  throw "Modelo ausente: $modelPath"
}

$runtimeHash = Assert-Sha256 -Path $runtimePath -Expected $RuntimeSha256 -Label "Runtime"
$modelHash = Assert-Sha256 -Path $modelPath -Expected $ModelSha256 -Label "Modelo"

$manifest = [ordered]@{
  provider = "cronos-local-whisper"
  runtimeVersion = "whisper.cpp $WhisperVersion"
  runtimeFile = "bin/whisper-cli.exe"
  runtimeSha256 = $runtimeHash
  runtimeSource = "https://github.com/ggml-org/whisper.cpp/releases/tag/$WhisperVersion"
  modelName = "ggml-base.bin"
  modelVersion = "openai-whisper-base-ggml"
  modelFile = "models/ggml-base.bin"
  modelSha256 = $modelHash
  modelSource = $ModelUrl
  architecture = "windows-x86_64-cpu"
  languageSupport = @("pt-BR", "pt", "multilingual")
  audioFormat = "mono PCM WAV 16 kHz 16-bit"
  license = "MIT"
  createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$runtimeSize = [Math]::Round((Get-Item -LiteralPath $runtimePath).Length / 1MB, 2)
$modelSize = [Math]::Round((Get-Item -LiteralPath $modelPath).Length / 1MB, 2)
Write-Host "CRONOS Local Whisper preparado."
Write-Host "Runtime: $runtimePath ($runtimeSize MB)"
Write-Host "Modelo:  $modelPath ($modelSize MB)"
Write-Host "Manifest: $manifestPath"
