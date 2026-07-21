$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

$nodeModules = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
if (Test-Path $nodeModules) {
    $playwrightNestedModules = Join-Path $nodeModules "playwright\node_modules"
    $pnpmModules = Join-Path $nodeModules ".pnpm\node_modules"
    if (Test-Path $playwrightNestedModules) {
        $env:NODE_PATH = "$nodeModules;$playwrightNestedModules;$pnpmModules"
    } else {
        $env:NODE_PATH = "$nodeModules;$pnpmModules"
    }
}

node .\scripts\test-login-error.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
