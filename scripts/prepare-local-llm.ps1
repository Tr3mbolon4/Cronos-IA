param(
  [string]$RuntimeVersion,
  [string]$RuntimeSha256,
  [string]$ModelSha256,
  [string]$RuntimeBinDir,
  [string]$ImportModelPath,
  [string]$ModelName,
  [string]$Quantization,
  [int]$ContextLength = 4096,
  [string]$License,
  [string]$OfficialSource,
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

function Assert-Sha256 {
  param([string]$Path, [string]$Expected, [string]$Label)
  $expectedHash = Assert-Sha256Format -Value $Expected -Label "$Label SHA-256"
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expectedHash) {
    throw "$Label SHA-256 divergente. Esperado=$expectedHash Real=$actual"
  }
  return $actual
}

function Assert-ArtifactCandidate {
  param([string]$Path, [string]$Label, [long]$MinimumBytes)
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -le 0) {
    throw "$Label recusado: arquivo vazio."
  }
  if ($item.Length -lt $MinimumBytes) {
    throw "$Label recusado: tamanho menor que o esperado. Possivel ponteiro Git LFS ou arquivo incompleto."
  }
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $prefixLength = [Math]::Min([int]$stream.Length, 128)
    $prefixBytes = New-Object byte[] $prefixLength
    $read = $stream.Read($prefixBytes, 0, $prefixLength)
    $prefix = [System.Text.Encoding]::ASCII.GetString($prefixBytes, 0, $read)
  } finally {
    $stream.Dispose()
  }
  if ($prefix.StartsWith("version https://git-lfs.github.com/spec/v1")) {
    throw "$Label recusado: arquivo e um ponteiro Git LFS, nao o artefato real."
  }
}

function Invoke-SelfTest {
  $valid = "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"
  $invalidValues = @(
    "465707469ff3a37a2b9b8d8f89f2f99de7299dac",
    "",
    $valid.Substring(0, 63),
    ($valid + "0"),
    ($valid.Substring(0, 63) + "g"),
    ($valid + " "),
    ("SHA256:" + $valid)
  )
  Assert-Sha256Format -Value $valid -Label "lowercase" | Out-Null
  Assert-Sha256Format -Value $valid.ToUpperInvariant() -Label "uppercase" | Out-Null
  foreach ($value in $invalidValues) {
    $failed = $false
    try {
      Assert-Sha256Format -Value $value -Label "invalid" | Out-Null
    } catch {
      $failed = $true
    }
    if (-not $failed) {
      throw "SelfTest falhou: hash invalido aceito [$value]."
    }
  }
  Write-Host "prepare-local-llm.ps1 self-test ok"
}

if ($SelfTest) {
  Invoke-SelfTest
  exit 0
}

$normalizedRuntimeSha256 = Assert-Sha256Format -Value $RuntimeSha256 -Label "RuntimeSha256"
$normalizedModelSha256 = Assert-Sha256Format -Value $ModelSha256 -Label "ModelSha256"

if (-not $RuntimeVersion) { throw "RuntimeVersion obrigatorio." }
if (-not $RuntimeBinDir) { throw "RuntimeBinDir obrigatorio." }
if (-not $ImportModelPath) { throw "ImportModelPath obrigatorio." }
if (-not $ModelName -or -not $ModelName.EndsWith(".gguf")) { throw "ModelName deve ser um arquivo .gguf." }
if (-not $Quantization) { throw "Quantization obrigatorio." }
if (-not $License) { throw "License obrigatorio." }
if (-not $OfficialSource -or -not $OfficialSource.StartsWith("https://")) { throw "OfficialSource HTTPS obrigatorio." }

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$resourceRoot = Join-Path $repoRoot "frontend\src-tauri\resources\ai\llm"
$binDir = Join-Path $resourceRoot "bin"
$modelDir = Join-Path $resourceRoot "models"
$manifestPath = Join-Path $resourceRoot "manifest.json"
$runtimeSource = Join-Path $RuntimeBinDir "llama-server.exe"
$runtimeTarget = Join-Path $binDir "llama-server.exe"
$modelTarget = Join-Path $modelDir $ModelName

if (-not (Test-Path -LiteralPath $runtimeSource)) {
  throw "llama-server.exe nao encontrado em RuntimeBinDir: $RuntimeBinDir"
}
if (-not (Test-Path -LiteralPath $ImportModelPath)) {
  throw "Modelo GGUF para importacao nao encontrado: $ImportModelPath"
}
if ((Split-Path -Leaf $ImportModelPath) -ne $ModelName) {
  throw "Modelo recusado: nome informado nao corresponde ao arquivo importado."
}

Assert-ArtifactCandidate -Path $runtimeSource -Label "Runtime LLM" -MinimumBytes 1
Assert-ArtifactCandidate -Path $ImportModelPath -Label "Modelo LLM" -MinimumBytes 100MB
$runtimeHash = Assert-Sha256 -Path $runtimeSource -Expected $normalizedRuntimeSha256 -Label "Runtime LLM"
$modelHash = Assert-Sha256 -Path $ImportModelPath -Expected $normalizedModelSha256 -Label "Modelo LLM"
$runtimeDlls = @()
foreach ($dll in Get-ChildItem -LiteralPath $RuntimeBinDir -Filter "*.dll") {
  Assert-ArtifactCandidate -Path $dll.FullName -Label "DLL LLM $($dll.Name)" -MinimumBytes 1
  $runtimeDlls += [ordered]@{
    file = "bin/$($dll.Name)"
    sha256 = (Get-FileHash -LiteralPath $dll.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    size = $dll.Length
  }
}

if ($DryRun) {
  Write-Host "CRONOS Local LLM dry-run."
  Write-Host "Runtime target: $runtimeTarget"
  Write-Host "Model target: $modelTarget"
  exit 0
}

New-Item -ItemType Directory -Force -Path $binDir, $modelDir | Out-Null
Copy-Item -LiteralPath $runtimeSource -Destination $runtimeTarget -Force
Get-ChildItem -LiteralPath $RuntimeBinDir -Filter "*.dll" | Copy-Item -Destination $binDir -Force
Copy-Item -LiteralPath $ImportModelPath -Destination $modelTarget -Force

$destRuntimeHash = Assert-Sha256 -Path $runtimeTarget -Expected $runtimeHash -Label "Runtime LLM copiado"
$destModelHash = Assert-Sha256 -Path $modelTarget -Expected $modelHash -Label "Modelo LLM copiado"

$manifest = [ordered]@{
  provider = "cronos-local-llama"
  runtime = "llama.cpp"
  runtimeVersion = $RuntimeVersion
  runtimeFile = "bin/llama-server.exe"
  runtimeSha256 = $destRuntimeHash
  runtimeSize = (Get-Item -LiteralPath $runtimeTarget).Length
  runtimeDlls = $runtimeDlls
  modelName = $ModelName
  modelFile = "models/$ModelName"
  modelSha256 = $destModelHash
  modelSize = (Get-Item -LiteralPath $modelTarget).Length
  modelFormat = "GGUF"
  quantization = $Quantization
  contextLength = $ContextLength
  architecture = "cpu"
  multilingual = $true
  license = $License
  officialSource = $OfficialSource
  integrityValidated = $true
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "CRONOS Local LLM preparado."
Write-Host "Runtime: $runtimeTarget"
Write-Host "Modelo:  $modelTarget"
Write-Host "Manifest: $manifestPath"
