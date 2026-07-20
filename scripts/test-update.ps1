param(
    [string]$ManifestPath = "release\CRONOS-0.1.0\release-manifest.json"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$resolvedManifest = Join-Path $root $ManifestPath
if (!(Test-Path -LiteralPath $resolvedManifest)) {
    throw "Manifesto de release nao encontrado: $resolvedManifest"
}

$manifest = Get-Content -LiteralPath $resolvedManifest -Raw | ConvertFrom-Json
if ($manifest.autoUpdate -ne $false) {
    throw "A versao inicial nao deve habilitar auto-update."
}
if ($manifest.installMode -ne "perMachine") {
    throw "Modo de instalacao inesperado: $($manifest.installMode)"
}

[pscustomobject]@{
    ok = $true
    version = $manifest.version
    autoUpdate = $manifest.autoUpdate
    installMode = $manifest.installMode
    artifacts = $manifest.artifacts.Count
} | ConvertTo-Json -Compress
