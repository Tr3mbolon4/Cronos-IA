param(
  [string]$Version = "v0.3.0",
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) {
  $OutputPath = Join-Path $root "frontend\src-tauri\resources\build-info.json"
}

$commit = (git -C $root rev-parse --short=12 HEAD).Trim()
$fullCommit = (git -C $root rev-parse HEAD).Trim()
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$buildId = "$Version-$commit-$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))"
$info = [ordered]@{
  version = $Version
  gitCommit = $commit
  gitCommitFull = $fullCommit
  buildTimestamp = $timestamp
  buildId = $buildId
  protocolVersion = "1"
  source = "generated-by-scripts/write-build-info.ps1"
}

$directory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$json = $info | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($OutputPath, "$json`r`n", [System.Text.UTF8Encoding]::new($false))
$info | ConvertTo-Json -Compress
