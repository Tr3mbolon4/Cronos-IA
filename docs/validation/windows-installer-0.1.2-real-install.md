# Validacao real do instalador Windows CRONOS 0.1.2

Data: 2026-07-20
Branch: `fix/identity-loading-startup`
Instalacao validada: `D:\CRONOS`
Dados preservados: `%LOCALAPPDATA%\CRONOS`

## Resultado

Status: aprovado.

A versao 0.1.2 corrigiu a falha observada na 0.1.1, iniciou o backend sidecar instalado, carregou a identidade do proprietario, permitiu login, chat, upload e consulta de PDF, preservou historico/documentos e encerrou sem processos orfaos.

## Causa raiz da falha anterior

Na versao 0.1.1 o backend instalado iniciava corretamente, emitia o evento `cronos_backend_ready` e respondia `/health`, mas o frontend instalado nao conseguia concluir o carregamento da identidade.

A causa raiz foi CORS: o backend respondia ao preflight de `/setup/status` com `Access-Control-Allow-Origin: http://127.0.0.1:5173`, origem usada em desenvolvimento. No app instalado, o WebView Tauri usa origem local propria, validada como `http://tauri.localhost`. O navegador embutido bloqueava o `GET /setup/status` apos o `OPTIONS`, impedindo a tela de login de aparecer.

## Correcao aplicada

- O backend passou a aceitar origens locais do desktop instalado: `tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`, `http://localhost:*` e `http://127.0.0.1:*`.
- O frontend deixou de ficar preso indefinidamente em `Carregando identidade...` e passou a exibir uma tela de erro acionavel.
- O Tauri passou a aguardar a conexao do backend com timeout, registrar falhas de startup e gravar logs em `%LOCALAPPDATA%\CRONOS\logs\desktop.log`.
- O arquivo `%LOCALAPPDATA%\CRONOS\runtime\current-session.json` passou a registrar o PID real do backend emitido pelo sidecar.
- O endpoint `/health` passou a retornar readiness, versao, status do banco e runtime.

## Arquivos alterados

- `backend/cronos/server.py`
- `backend/tests/test_server_cors.py`
- `frontend/src/App.tsx`
- `frontend/src/App.css`
- `frontend/src/services/runtimeConnection.ts`
- `frontend/src-tauri/src/runtime/backend.rs`
- `scripts/sync-version.ps1`
- arquivos de versao: `backend/cronos/__init__.py`, `backend/cronos/core/config.py`, `backend/cronos/main.py`, `backend/pyproject.toml`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/src-tauri/Cargo.toml`, `frontend/src-tauri/Cargo.lock`, `frontend/src-tauri/tauri.conf.json`
- `CHANGELOG.md`

## Artefatos

Instalador final:

`G:\Cronos-IA\release\CRONOS-0.1.2\CronosSetup-0.1.2.exe`

SHA-256:

`9A961726C439690F35317C7685B979E838B1915B441B05716A992B3C89CBD4A3`

Manifesto:

`G:\Cronos-IA\release\CRONOS-0.1.2\release-manifest.json`

## Evidencias da instalacao real

Instalacao:

- `D:\CRONOS\cronos-desktop.exe` existe.
- `D:\CRONOS\cronos-backend.exe` existe.
- `D:\CRONOS\uninstall.exe` existe.
- Registro do Windows: `DisplayName=CRONOS`, `DisplayVersion=0.1.2`, `Publisher=Kalion Tecnologia`, `InstallLocation="D:\CRONOS"`.
- Atalho do Menu Iniciar: `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\CRONOS\CRONOS.lnk`.

Runtime pelo atalho:

- `cronos-desktop.exe` PID `2172`.
- `cronos-backend.exe` PIDs `1584` e `16576`.
- Listener real em `127.0.0.1:54095`, processo `16576`.
- `current-session.json`: `pid=16576`, `port=54095`, `app_version=0.1.2`, `executable_path=binaries/cronos-backend`.
- `/health`: `status=ok`, `version=0.1.2`, `runtime=ready`.
- `/setup/status`: `configured=true`, proprietario preservado.
- Preflight CORS: `Access-Control-Allow-Origin=http://tauri.localhost`.

Runtime pelo executavel:

- `cronos-desktop.exe` PID `19044`.
- `cronos-backend.exe` PIDs `19488` e `6224`.
- Listener real em `127.0.0.1:65202`, processo `6224`.
- `current-session.json`: `pid=6224`, `port=65202`, `app_version=0.1.2`, `executable_path=binaries/cronos-backend`.
- `/health`: `status=ok`, `version=0.1.2`, `runtime=ready`.
- `/setup/status`: `configured=true`, proprietario preservado.

Persistencia:

- Banco preservado: `%LOCALAPPDATA%\CRONOS\database\cronos.db`.
- Proprietario preservado.
- Historico preservado: 12 mensagens apos validacao.
- Documentos preservados: 3 documentos apos validacao.
- Documento mais recente validado: `cronos-final-installed-0.1.2.pdf`.

Seguranca/Windows:

- Nenhum servico Windows CRONOS encontrado.
- Nenhuma tarefa agendada CRONOS encontrada.
- Nenhuma regra de firewall CRONOS encontrada.
- Backend escutando somente em `127.0.0.1`.
- Token de runtime validado apenas internamente; nao foi registrado neste relatorio.

Encerramento:

- Encerramento via `/runtime/shutdown` executado.
- `cronos-desktop.exe` encerrado.
- `cronos-backend.exe` encerrado.
- Processos orfaos apos fechamento: `0`.

## Logs relevantes

`%LOCALAPPDATA%\CRONOS\logs\desktop.log`:

```text
1784586735 INFO desktop STARTUP-001 Starting Cronos Desktop runtime
1784586735 INFO sidecar STARTUP-010 Starting backend sidecar base_url=http://127.0.0.1:54095 data_dir=C:\Users\alexandre_santos\AppData\Local\CRONOS logs_dir=C:\Users\alexandre_santos\AppData\Local\CRONOS\logs
1784586737 INFO sidecar STARTUP-014 Backend emitted ready event port=54095 session_id=1f033b86-4fcd-4d92-92b5-37db4ba8859d pid=16576
1784586737 INFO health STARTUP-020 Backend health check succeeded
1784586848 INFO desktop STARTUP-001 Starting Cronos Desktop runtime
1784586848 INFO sidecar STARTUP-010 Starting backend sidecar base_url=http://127.0.0.1:65202 data_dir=C:\Users\alexandre_santos\AppData\Local\CRONOS logs_dir=C:\Users\alexandre_santos\AppData\Local\CRONOS\logs
1784586849 INFO sidecar STARTUP-014 Backend emitted ready event port=65202 session_id=31fa20ef-322b-4c30-a123-853214a18e0a pid=6224
1784586849 INFO health STARTUP-020 Backend health check succeeded
```

`%LOCALAPPDATA%\CRONOS\logs\cronos-backend.log`:

```text
{"event": "cronos_backend_ready", "host": "127.0.0.1", "port": 54095, "pid": 16576, "session_id": "1f033b86-4fcd-4d92-92b5-37db4ba8859d", "version": "0.1.2"}
127.0.0.1 - "GET /health HTTP/1.1" 200 -
127.0.0.1 - "OPTIONS /setup/status HTTP/1.1" 204 -
127.0.0.1 - "GET /setup/status HTTP/1.1" 200 -
{"event": "cronos_backend_ready", "host": "127.0.0.1", "port": 65202, "pid": 6224, "session_id": "31fa20ef-322b-4c30-a123-853214a18e0a", "version": "0.1.2"}
127.0.0.1 - "GET /health HTTP/1.1" 200 -
127.0.0.1 - "GET /setup/status HTTP/1.1" 200 -
127.0.0.1 - "POST /runtime/shutdown HTTP/1.1" 200 -
```

## Testes executados

- `npm run build`: aprovado.
- `python -m unittest`: 5 testes aprovados.
- `cargo check`: aprovado.
- `scripts/test-backend-package.ps1`: aprovado.
- `scripts/test-desktop-runtime.ps1`: aprovado, incluindo login, chat, PDF, lock e ausencia de backend orfao.
- `scripts/build-installer.ps1 -Version 0.1.2`: aprovado.
- `scripts/test-installer.ps1 -Version 0.1.2`: aprovado.
- `scripts/test-update.ps1 -ManifestPath release\CRONOS-0.1.2\release-manifest.json`: aprovado.
- Validacao real instalada em `D:\CRONOS`: aprovada.

## Limitacoes restantes

- O desktop instalado e o executavel em `target\release` podem ter hashes diferentes apos empacotamento NSIS, embora tenham o mesmo tamanho/versao e o instalador final tenha SHA-256 validado.
- O backend PyInstaller ainda emite aviso de `pkg_resources` depreciado; nao bloqueia inicializacao.
- O extrator de PDF ainda usa busca local simples; busca semantica fica para a v0.2.0.
- O instalador nao e assinado digitalmente, portanto SmartScreen pode alertar.

## Conclusao

A versao 0.1.2 esta aprovada para merge posterior em `master`, tag `v0.1.2` e preparacao de release, apos confirmacao do proprietario.
