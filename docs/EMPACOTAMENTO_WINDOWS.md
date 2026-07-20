# Empacotamento Windows do CRONOS

## Estado em 2026-07-20

Branch: `feature/windows-desktop-installer`

Commit base aprovado: `727a0cd Add authenticated visual validation for Cronos layout`

Tag de seguranca existente: `mvp-before-tauri`

## Pre-checagem executada

- `.\scripts\test.ps1`: aprovado.
- Backend unittest: aprovado, 2 testes.
- Frontend TypeScript/Vite build: aprovado.
- `.\scripts\visual-test.ps1`: aprovado.
- Capturas autenticadas preservadas em `data\project-backups`.
- Backup criado: `G:\Cronos-IA\data\project-backups\cronos-before-tauri-integration-2026-07-20-1240.zip`.

## Ferramentas

### Node.js e npm

- Node.js: `v20.20.2`
- npm: `10.8.2`

### Python

- Python global detectado: `Python 3.13.14`
- PyInstaller detectado no Python global: `6.13.0`
- Observacao: a proxima etapa de empacotamento deve criar `.venv-packaging` e nao instalar pacotes Python globalmente.

### Rust

Instalado via canal oficial `winget`:

```powershell
winget install --id Rustlang.Rustup --source winget --accept-source-agreements --accept-package-agreements --silent
```

Resultado:

- rustup: `1.29.0`
- rustc: `1.97.1`
- cargo: `1.97.1`
- host padrao: `x86_64-pc-windows-msvc`
- target instalado: `x86_64-pc-windows-msvc`
- caminho: `%USERPROFILE%\.cargo\bin`

O terminal atual pode precisar de uma nova sessao para receber o PATH atualizado.

### Microsoft Visual Studio Build Tools

Instalacao iniciada via canal oficial `winget`:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --source winget --accept-source-agreements --accept-package-agreements --silent --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --includeRecommended"
```

Resultado atual:

- Produto detectado: Visual Studio Build Tools 2022
- Versao: `17.14.37502.11`
- Caminho: `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`
- Windows SDK detectado: `10.0.26100.0`
- MSVC x64 detectado: `VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe`
- Estado: instalacao incompleta
- `isLaunchable`: `false`
- `isComplete`: `false`
- `isRebootRequired`: `true`

O processo do instalador terminou, mas o Visual Studio Installer ainda informa reinicializacao obrigatoria. Como a instalacao exige reinicializacao, a integracao com Tauri deve parar ate o Windows ser reiniciado e os Build Tools serem validados novamente.

### WebView2

- Microsoft Edge WebView2 Runtime: `150.0.4078.83`
- Caminho: `C:\Program Files (x86)\Microsoft\EdgeWebView\Application`

## Proxima validacao apos reinicializacao

Depois de reiniciar o Windows, executar:

```powershell
rustc --version
cargo --version
rustup show
rustup target list --installed
node --version
npm --version
python --version
python -m PyInstaller --version
```

Validar tambem:

```powershell
"C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -all -products * -format json
```

Somente continuar para Tauri quando:

- Build Tools estiver `isComplete: true`;
- Build Tools estiver `isLaunchable: true`;
- `isRebootRequired` estiver `false`;
- compilador MSVC x64 e Windows SDK forem localizados.

## Validacao apos reinicializacao

Em 2026-07-20, apos a reinicializacao informada:

- `.\scripts\test.ps1`: aprovado.
- `.\scripts\visual-test.ps1`: aprovado.
- MSVC x64 compilou um programa C++ temporario com sucesso.
- Rust compilou um projeto temporario em release com sucesso usando `%USERPROFILE%\.cargo\bin\cargo.exe`.
- `vswhere` ainda retornou `isComplete: false`, `isLaunchable: false`, `isRebootRequired: true`.

Decisao:

```text
Nao iniciar Tauri enquanto o Visual Studio Installer nao confirmar instalacao completa/lancavel e sem reinicializacao pendente.
```

## Ambiente desktop aprovado para Tauri

Em 2026-07-20, apos nova reinicializacao:

- `vswhere`: `isComplete=true`, `isLaunchable=true`, `isRebootRequired=false`.
- MSVC x64: `14.44.35207`.
- Windows SDK: `10.0.26100.0`.
- Teste C++ temporario: aprovado.
- Rust/Cargo com target `x86_64-pc-windows-msvc`: aprovado.
- Teste Rust release: aprovado.

Proxima etapa autorizada:

```text
Preparar ambiente isolado de empacotamento Python e, depois, adicionar Tauri 2 ao frontend.
```

## Ambiente Python de empacotamento

Em 2026-07-20:

- Ambiente criado em `.venv-packaging`.
- Python: `3.13.14`.
- PyInstaller: `6.13.0`.
- pypdf: `6.10.0`.
- Arquivo de dependencias criado: `backend\requirements-packaging.txt`.
- Artefatos locais ignorados: `.venv-packaging`, `backend\build`, `backend\dist`.

Observacao: o acesso direto do `pip` ao indice externo falhou com proxy `407 Proxy Authentication Required`. Para manter o projeto sem instalacoes globais novas, a venv foi criada isolada para packaging e os pacotes ja presentes no ambiente local foram reaproveitados quando necessario.

Validacoes executadas:

- Executavel simples `--onefile`: aprovado.
- Executavel servidor local `--onefile`: aprovado.
- Servidor empacotado abriu em `127.0.0.1` com porta dinamica.
- Endpoint `/health`: respondeu `{"status":"ok","service":"cronos-packaging-test"}`.
- Processo do servidor foi encerrado pelo PID especifico do teste.
