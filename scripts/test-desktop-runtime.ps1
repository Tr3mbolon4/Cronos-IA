param(
  [string]$BuildDir,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$buildReport = Join-Path $root "docs\diagnostics\v0.3.0-isolated-build-test.json"
$runtimeReport = Join-Path $root "docs\diagnostics\v0.3.0-desktop-timeout-analysis.json"

try {
  if (-not $SkipBuild) {
    $buildResult = & (Join-Path $PSScriptRoot "build-isolated.ps1") -ReportPath $buildReport | ConvertFrom-Json
    $BuildDir = $buildResult.buildDir
  }
  if (-not $BuildDir) {
    throw "BuildDir obrigatorio quando -SkipBuild e usado."
  }
  $runtimeResult = & (Join-Path $PSScriptRoot "test-isolated-runtime.ps1") -BuildDir $BuildDir -ReportPath $runtimeReport | ConvertFrom-Json
  [ordered]@{
    ok = $true
    buildDir = $BuildDir
    buildReport = $buildReport
    runtimeReport = $runtimeReport
    runtimeSteps = $runtimeResult.steps
  } | ConvertTo-Json -Depth 8
} catch {
  [ordered]@{
    ok = $false
    buildDir = $BuildDir
    buildReport = $buildReport
    runtimeReport = $runtimeReport
    failedAt = if (Test-Path -LiteralPath $runtimeReport) { "runtime" } elseif (Test-Path -LiteralPath $buildReport) { "build" } else { "startup" }
    error = $_.Exception.Message
  } | ConvertTo-Json -Depth 6
  exit 1
}
