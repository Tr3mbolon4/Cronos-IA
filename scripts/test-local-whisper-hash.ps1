$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "prepare-local-whisper.ps1"
$validRuntime = "3716AC2A3203DEF41CB49FC0CB49A03A4E4B75D7C5A1889F77164553D75FE060"
$validModel = "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"
$validRuntimeLower = $validRuntime.ToLowerInvariant()
$validModelUpper = $validModel.ToUpperInvariant()
$sha1 = "465707469ff3a37a2b9b8d8f89f2f99de7299dac"

function Invoke-ExpectFailure {
  param([string[]]$Arguments, [string]$Name)
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath @Arguments 2>&1
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($LASTEXITCODE -eq 0) {
    throw "Esperava falha em $Name, mas o comando retornou sucesso."
  }
  $text = ($output | Out-String)
  if ($text -notmatch "SHA-256 valido") {
    throw "Falha de $Name nao retornou mensagem clara de SHA-256. Saida: $text"
  }
}

function Invoke-ExpectFailureCommand {
  param([string]$CommandText, [string]$Name)
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -Command $CommandText 2>&1
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($LASTEXITCODE -eq 0) {
    throw "Esperava falha em $Name, mas o comando retornou sucesso."
  }
  $text = ($output | Out-String)
  if ($text -notmatch "SHA-256 valido") {
    throw "Falha de $Name nao retornou mensagem clara de SHA-256. Saida: $text"
  }
}

& $scriptPath -SelfTest
& $scriptPath -DryRun -RuntimeSha256 $validRuntime -ModelSha256 $validModel | Out-Null
& $scriptPath -DryRun -RuntimeSha256 $validRuntimeLower -ModelSha256 $validModelUpper | Out-Null

Invoke-ExpectFailure -Name "sha1-40" -Arguments @("-DryRun", "-RuntimeSha256", $validRuntime, "-ModelSha256", $sha1)
Invoke-ExpectFailureCommand -Name "empty" -CommandText "& '$scriptPath' -DryRun -RuntimeSha256 '$validRuntime' -ModelSha256 ''"
Invoke-ExpectFailure -Name "63-chars" -Arguments @("-DryRun", "-RuntimeSha256", $validRuntime, "-ModelSha256", $validModel.Substring(0, 63))
Invoke-ExpectFailure -Name "65-chars" -Arguments @("-DryRun", "-RuntimeSha256", $validRuntime, "-ModelSha256", ($validModel + "0"))
Invoke-ExpectFailure -Name "non-hex" -Arguments @("-DryRun", "-RuntimeSha256", $validRuntime, "-ModelSha256", ($validModel.Substring(0, 63) + "g"))
Invoke-ExpectFailure -Name "space" -Arguments @("-DryRun", "-RuntimeSha256", $validRuntime, "-ModelSha256", ($validModel + " "))
Invoke-ExpectFailure -Name "prefix" -Arguments @("-DryRun", "-RuntimeSha256", $validRuntime, "-ModelSha256", ("SHA256:" + $validModel))

Write-Host "test-local-whisper-hash.ps1 ok"
