param(
    [string]$DataDir = (Join-Path $env:LOCALAPPDATA "CRONOS"),
    [string]$Confirmation
)

$ErrorActionPreference = "Stop"

$resolved = (Resolve-Path -LiteralPath $DataDir -ErrorAction SilentlyContinue)
if (-not $resolved) {
    [pscustomobject]@{ ok = $true; removed = $false; reason = "Diretorio inexistente"; dataDir = $DataDir } | ConvertTo-Json -Compress
    exit 0
}

$expected = (Join-Path $env:LOCALAPPDATA "CRONOS")
$resolvedExpected = [System.IO.Path]::GetFullPath($expected)
$resolvedData = [System.IO.Path]::GetFullPath($resolved.Path)
if ($resolvedData -ne $resolvedExpected) {
    throw "Recusa remover caminho fora de %LOCALAPPDATA%\CRONOS: $resolvedData"
}

if ($Confirmation -ne "REMOVER-CRONOS-TESTE") {
    throw "Para remover dados de teste, execute com -Confirmation REMOVER-CRONOS-TESTE."
}

Remove-Item -LiteralPath $resolvedData -Recurse -Force
[pscustomobject]@{ ok = $true; removed = $true; dataDir = $resolvedData } | ConvertTo-Json -Compress
