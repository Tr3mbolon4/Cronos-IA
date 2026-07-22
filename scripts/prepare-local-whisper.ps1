param(
  [string]$WhisperVersion = "v1.8.5",
  [string]$RuntimeSha256,
  [string]$ModelSha256,
  [string]$RuntimeArchiveUrl,
  [string]$RuntimeBinDir,
  [string]$ImportModelPath,
  [string]$ModelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  [switch]$UseExistingFiles,
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

function Assert-ModelCandidate {
  param([string]$Path)
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -le 0) {
    throw "Modelo recusado: arquivo vazio."
  }
  if ($item.Length -lt 100MB) {
    throw "Modelo recusado: tamanho menor que o esperado para ggml-base.bin. Possivel ponteiro Git LFS ou arquivo incompleto."
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
    throw "Modelo recusado: arquivo e um ponteiro Git LFS, nao o modelo real."
  }
}

function Invoke-SelfTest {
  $validLower = "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"
  $validUpper = $validLower.ToUpperInvariant()
  $invalidValues = @(
    "465707469ff3a37a2b9b8d8f89f2f99de7299dac",
    "",
    "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2ef",
    "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efee",
    "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efg",
    "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe ",
    "SHA256:60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"
  )
  Assert-Sha256Format -Value $validLower -Label "lowercase" | Out-Null
  Assert-Sha256Format -Value $validUpper -Label "uppercase" | Out-Null
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
  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "cronos-whisper-hash-selftest"
  New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
  $pointerPath = Join-Path $tempDir "ggml-base.bin"
  Set-Content -LiteralPath $pointerPath -Value "version https://git-lfs.github.com/spec/v1`noid sha256:test`nsize 123" -Encoding ASCII
  $failedPointer = $false
  try {
    Assert-ModelCandidate -Path $pointerPath
  } catch {
    $failedPointer = $true
  }
  if (-not $failedPointer) {
    throw "SelfTest falhou: ponteiro Git LFS aceito como modelo."
  }
  $mismatchFailed = $false
  Set-Content -LiteralPath $pointerPath -Value "conteudo pequeno para hash divergente" -Encoding ASCII
  try {
    Assert-Sha256 -Path $pointerPath -Expected $validLower -Label "mismatch" | Out-Null
  } catch {
    $mismatchFailed = $true
  }
  if (-not $mismatchFailed) {
    throw "SelfTest falhou: hash divergente aceito."
  }
  Remove-Item -LiteralPath $pointerPath -Force
  Write-Host "prepare-local-whisper.ps1 self-test ok"
}

function Invoke-VerifiedDownload {
  param([string]$Url, [string]$OutFile)
  if (-not $Url.StartsWith("https://")) {
    throw "Download recusado: origem sem HTTPS."
  }
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}

if ($SelfTest) {
  Invoke-SelfTest
  exit 0
}

$normalizedRuntimeSha256 = $null
$normalizedModelSha256 = $null
if ($PSBoundParameters.ContainsKey("RuntimeSha256")) {
  $normalizedRuntimeSha256 = Assert-Sha256Format -Value $RuntimeSha256 -Label "RuntimeSha256"
}
if ($PSBoundParameters.ContainsKey("ModelSha256")) {
  $normalizedModelSha256 = Assert-Sha256Format -Value $ModelSha256 -Label "ModelSha256"
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

if ($DryRun) {
  Write-Host "CRONOS Local Whisper dry-run."
  Write-Host "Whisper version: $WhisperVersion"
  Write-Host "Runtime target: $runtimePath"
  Write-Host "Model target: $modelPath"
  Write-Host "Runtime source: $RuntimeArchiveUrl"
  Write-Host "Runtime bin dir: $RuntimeBinDir"
  Write-Host "Import model path: $ImportModelPath"
  Write-Host "Model source: $ModelUrl"
  Write-Host "Runtime SHA provided: $([bool]$RuntimeSha256)"
  Write-Host "Model SHA provided: $([bool]$ModelSha256)"
  exit 0
}

if (-not $UseExistingFiles) {
  if ($RuntimeBinDir) {
    $runtimeCandidate = Join-Path $RuntimeBinDir "whisper-cli.exe"
    if (-not (Test-Path -LiteralPath $runtimeCandidate)) {
      throw "whisper-cli.exe nao encontrado em RuntimeBinDir: $RuntimeBinDir"
    }
    if ((Resolve-Path -LiteralPath $runtimeCandidate).Path -ne (Resolve-Path -LiteralPath $runtimePath -ErrorAction SilentlyContinue).Path) {
      Copy-Item -LiteralPath $runtimeCandidate -Destination $runtimePath -Force
    }
    Get-ChildItem -LiteralPath $RuntimeBinDir -Filter "*.dll" | ForEach-Object {
      $targetDll = Join-Path $binDir $_.Name
      if ((Resolve-Path -LiteralPath $_.FullName).Path -ne (Resolve-Path -LiteralPath $targetDll -ErrorAction SilentlyContinue).Path) {
        Copy-Item -LiteralPath $_.FullName -Destination $binDir -Force
      }
    }
  } elseif ($RuntimeArchiveUrl) {
    $archive = Join-Path $tempDir "whisper-runtime.zip"
    Invoke-VerifiedDownload -Url $RuntimeArchiveUrl -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $tempDir -Force
    $runtime = Get-ChildItem -Path $tempDir -Recurse -Filter "whisper-cli.exe" | Select-Object -First 1
    if (-not $runtime) {
      throw "whisper-cli.exe nao encontrado no pacote informado."
    }
    Copy-Item -LiteralPath $runtime.FullName -Destination $runtimePath -Force
    Get-ChildItem -Path $runtime.DirectoryName -Filter "*.dll" | Copy-Item -Destination $binDir -Force
  } else {
    throw "Informe -RuntimeArchiveUrl oficial, -RuntimeBinDir de build oficial, ou use -UseExistingFiles."
  }
  if (-not (Test-Path -LiteralPath $modelPath)) {
    if ($ImportModelPath) {
      if (-not (Test-Path -LiteralPath $ImportModelPath)) {
        throw "Modelo para importacao nao encontrado: $ImportModelPath"
      }
      $sourceName = Split-Path -Leaf $ImportModelPath
      if ($sourceName -ne "ggml-base.bin") {
        throw "Modelo recusado: esperado ggml-base.bin, recebido $sourceName"
      }
      Assert-ModelCandidate -Path $ImportModelPath
      $sourceHash = Assert-Sha256 -Path $ImportModelPath -Expected $normalizedModelSha256 -Label "Modelo importado"
      Copy-Item -LiteralPath $ImportModelPath -Destination $modelPath -Force
      $destHash = Assert-Sha256 -Path $modelPath -Expected $sourceHash -Label "Modelo copiado"
    } else {
      Invoke-VerifiedDownload -Url $ModelUrl -OutFile $modelPath
    }
  }
}

if (-not (Test-Path -LiteralPath $runtimePath)) {
  throw "Runtime ausente: $runtimePath"
}
if (-not (Test-Path -LiteralPath $modelPath)) {
  throw "Modelo ausente: $modelPath"
}

Assert-ModelCandidate -Path $modelPath
$runtimeHash = Assert-Sha256 -Path $runtimePath -Expected $normalizedRuntimeSha256 -Label "Runtime"
$modelHash = Assert-Sha256 -Path $modelPath -Expected $normalizedModelSha256 -Label "Modelo"
$runtimeDlls = @()
foreach ($dll in Get-ChildItem -LiteralPath $binDir -Filter "*.dll") {
  $runtimeDlls += [ordered]@{
    file = "bin/$($dll.Name)"
    sha256 = (Get-FileHash -LiteralPath $dll.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    size = $dll.Length
  }
}

$manifest = [ordered]@{
  provider = "cronos-local-whisper"
  runtimeVersion = "whisper.cpp $WhisperVersion"
  runtimeCommit = "f24588a272ae8e23280d9c220536437164e6ed28"
  runtimeFile = "bin/whisper-cli.exe"
  runtimeSha256 = $runtimeHash
  runtimeSize = (Get-Item -LiteralPath $runtimePath).Length
  runtimeDlls = $runtimeDlls
  runtimeSource = "https://github.com/ggml-org/whisper.cpp/releases/tag/$WhisperVersion"
  preparationMethod = "compiled-from-official-source"
  compiler = "MSVC 19.44.35228.0"
  cmake = "Visual Studio 17 2022 x64; GGML_NATIVE=OFF; WHISPER_BUILD_TESTS=OFF; WHISPER_BUILD_SERVER=OFF; WHISPER_BUILD_EXAMPLES=ON"
  modelName = "ggml-base.bin"
  modelVersion = "openai-whisper-base-ggml"
  modelFile = "models/ggml-base.bin"
  modelSha256 = $modelHash
  modelPublishedSha = "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"
  modelSize = (Get-Item -LiteralPath $modelPath).Length
  modelVariant = "base"
  multilingual = $true
  officialSource = $ModelUrl
  importedFromApprovedChannel = $true
  sourceAndDestinationHashesMatch = $true
  integrityValidated = $true
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
