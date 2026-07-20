$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$root = Split-Path -Parent $PSScriptRoot
Get-Process -Name "cronos-desktop","cronos-backend" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Set-Location $root
& (Join-Path $PSScriptRoot "build-backend.ps1")
& (Join-Path $PSScriptRoot "prepare-sidecar.ps1")

Set-Location (Join-Path $root "frontend")
npm run tauri:build

$exe = Join-Path $root "frontend\src-tauri\target\release\cronos-desktop.exe"
if (!(Test-Path $exe)) {
    throw "Executavel desktop nao encontrado: $exe"
}

$testRoot = Join-Path $env:TEMP ("Cronos Desktop Runtime Test " + [guid]::NewGuid().ToString())
$testLocalAppData = Join-Path $testRoot "Local AppData"
New-Item -ItemType Directory -Force -Path $testLocalAppData | Out-Null
$oldLocalAppData = $env:LOCALAPPDATA
$env:LOCALAPPDATA = $testLocalAppData
$process = Start-Process -FilePath $exe -PassThru
try {
    $sessionFile = Join-Path $testLocalAppData "CRONOS\runtime\current-session.json"
    $deadline = (Get-Date).AddSeconds(30)
    while (!(Test-Path $sessionFile)) {
        if ((Get-Date) -gt $deadline) {
            throw "Arquivo current-session.json nao foi criado."
        }
        Start-Sleep -Milliseconds 250
    }
    $session = Get-Content -LiteralPath $sessionFile -Raw | ConvertFrom-Json
    $baseUrl = "http://127.0.0.1:$($session.port)"

    $backend = $null
    $deadline = (Get-Date).AddSeconds(15)
    while (!$backend -and (Get-Date) -lt $deadline) {
        $backend = Get-Process -Name "cronos-backend" -ErrorAction SilentlyContinue
        if (!$backend) {
            Start-Sleep -Milliseconds 250
        }
    }
    if (!$backend) {
        throw "Processo cronos-backend nao foi detectado."
    }

    $setup = Invoke-RestMethod -Uri "$baseUrl/setup/status" -TimeoutSec 5
    if ($setup.configured) {
        throw "Diretorio de teste deveria iniciar sem proprietario configurado."
    }

    $ownerPayload = @{ name = "Alexandre"; password = "SenhaRuntime-2026"; pin = "2468" } | ConvertTo-Json
    $created = Invoke-RestMethod -Method Post -Uri "$baseUrl/setup/owner" -ContentType "application/json" -Body $ownerPayload -TimeoutSec 5
    $authToken = $created.token
    if (!$authToken) {
        throw "Setup nao retornou token de sessao."
    }

    $headers = @{ Authorization = "Bearer $authToken" }
    $chatPayload = @{ message = "Teste desktop com sidecar" } | ConvertTo-Json
    $chat = Invoke-RestMethod -Method Post -Uri "$baseUrl/chat" -Headers $headers -ContentType "application/json" -Body $chatPayload -TimeoutSec 5
    if ($chat.role -ne "assistant") {
        throw "Chat nao retornou resposta do assistente."
    }

    $pdfPath = Join-Path $testRoot "runtime-test.pdf"
    $pdf = @"
%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Root 1 0 R /Size 4 >>
startxref
186
%%EOF
"@
    [System.IO.File]::WriteAllText($pdfPath, $pdf, [System.Text.Encoding]::ASCII)
    $client = New-Object System.Net.Http.HttpClient
    $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $authToken)
    $form = New-Object System.Net.Http.MultipartFormDataContent
    $fileBytes = [System.IO.File]::ReadAllBytes($pdfPath)
    $fileContent = New-Object System.Net.Http.ByteArrayContent -ArgumentList (, $fileBytes)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/pdf")
    $form.Add($fileContent, "file", "runtime-test.pdf")
    $uploadResponse = $client.PostAsync("$baseUrl/documents/upload", $form).Result
    if (!$uploadResponse.IsSuccessStatusCode) {
        throw "Upload PDF falhou: $($uploadResponse.StatusCode) $($uploadResponse.Content.ReadAsStringAsync().Result)"
    }

    Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/lock" -Headers $headers -TimeoutSec 5 | Out-Null
    $lockedStatus = 0
    try {
        Invoke-RestMethod -Uri "$baseUrl/auth/session" -Headers $headers -TimeoutSec 5 | Out-Null
    } catch {
        $lockedStatus = [int]$_.Exception.Response.StatusCode
    }
    if ($lockedStatus -ne 401) {
        throw "Sessao bloqueada deveria retornar 401; retornou $lockedStatus"
    }

    $process.CloseMainWindow() | Out-Null
    Start-Sleep -Seconds 5
    $backendAfter = Get-Process -Name "cronos-backend" -ErrorAction SilentlyContinue
    if ($backendAfter) {
        throw "Processo cronos-backend permaneceu apos fechamento do desktop."
    }
    [pscustomobject]@{
        ok = $true
        desktop = $exe
        port = $session.port
        login = $true
        chat = $true
        pdf = $true
        lock = $true
        backendDetected = $true
        orphanBackend = $false
    } | ConvertTo-Json -Compress
} finally {
    $env:LOCALAPPDATA = $oldLocalAppData
    if ($process -and !$process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
}
