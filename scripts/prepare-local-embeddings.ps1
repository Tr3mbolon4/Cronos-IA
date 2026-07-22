param(
  [string]$ImportModelPath,
  [string]$ModelSha256,
  [string]$ModelName,
  [int]$Dimension = 384,
  [string]$License,
  [string]$OfficialSource,
  [string]$Pooling = "mean",
  [switch]$DryRun,
  [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

function Assert-Sha256Format {
  param([string]$Value, [string]$Label)
  if (-not $Value -or $Value -notmatch '^[A-Fa-f0-9]{64}$') {
    throw "$Label informado nao e um SHA-256 valido. Sao esperados exatamente 64 caracteres hexadecimais."
  }
  return $Value.ToLowerInvariant()
}

function Assert-ModelCandidate {
  param([string]$Path)
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -le 0) { throw "Modelo de embeddings recusado: arquivo vazio." }
  if ($item.Length -lt 10MB) { throw "Modelo de embeddings recusado: tamanho menor que o esperado." }
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $buffer = New-Object byte[] ([Math]::Min([int]$stream.Length, 128))
    $read = $stream.Read($buffer, 0, $buffer.Length)
    $prefix = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
  } finally {
    $stream.Dispose()
  }
  if ($prefix.StartsWith("version https://git-lfs.github.com/spec/v1")) {
    throw "Modelo de embeddings recusado: arquivo e um ponteiro Git LFS."
  }
}

function Invoke-SelfTest {
  $valid = "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e"
  Assert-Sha256Format -Value $valid -Label "valid" | Out-Null
  foreach ($value in @("", $valid.Substring(0, 63), ($valid + "0"), "SHA256:$valid")) {
    $failed = $false
    try { Assert-Sha256Format -Value $value -Label "invalid" | Out-Null } catch { $failed = $true }
    if (-not $failed) { throw "SelfTest falhou: hash invalido aceito." }
  }
  Write-Host "prepare-local-embeddings.ps1 self-test ok"
}

if ($SelfTest) {
  Invoke-SelfTest
  exit 0
}

$normalizedModelSha256 = Assert-Sha256Format -Value $ModelSha256 -Label "ModelSha256"
if (-not $ImportModelPath) { throw "ImportModelPath obrigatorio." }
if (-not $ModelName -or -not $ModelName.EndsWith(".gguf")) { throw "ModelName deve ser .gguf." }
if (-not $License) { throw "License obrigatorio." }
if (-not $OfficialSource -or -not $OfficialSource.StartsWith("https://")) { throw "OfficialSource HTTPS obrigatorio." }
if ((Split-Path -Leaf $ImportModelPath) -ne $ModelName) { throw "Nome do modelo nao corresponde ao arquivo importado." }

Assert-ModelCandidate -Path $ImportModelPath
$actualHash = (Get-FileHash -LiteralPath $ImportModelPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $normalizedModelSha256) {
  throw "Modelo de embeddings SHA-256 divergente. Esperado=$normalizedModelSha256 Real=$actualHash"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$resourceRoot = Join-Path $repoRoot "frontend\src-tauri\resources\ai\embeddings"
$modelDir = Join-Path $resourceRoot "models"
$manifestPath = Join-Path $resourceRoot "manifest.json"
$modelTarget = Join-Path $modelDir $ModelName

if ($DryRun) {
  Write-Host "CRONOS Local Embeddings dry-run."
  Write-Host "Model target: $modelTarget"
  exit 0
}

New-Item -ItemType Directory -Force -Path $modelDir | Out-Null
Copy-Item -LiteralPath $ImportModelPath -Destination $modelTarget -Force
$destHash = (Get-FileHash -LiteralPath $modelTarget -Algorithm SHA256).Hash.ToLowerInvariant()
if ($destHash -ne $actualHash) {
  throw "Modelo de embeddings copiado diverge da origem."
}

$manifest = [ordered]@{
  provider = "cronos-local-llama-embedding"
  runtime = "llama.cpp"
  modelName = $ModelName
  modelFile = "models/$ModelName"
  modelSha256 = $destHash
  modelSize = (Get-Item -LiteralPath $modelTarget).Length
  modelFormat = "GGUF"
  dimension = $Dimension
  pooling = $Pooling
  multilingual = $true
  license = $License
  officialSource = $OfficialSource
  integrityValidated = $true
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "CRONOS Local Embeddings preparado."
Write-Host "Modelo:  $modelTarget"
Write-Host "Manifest: $manifestPath"
