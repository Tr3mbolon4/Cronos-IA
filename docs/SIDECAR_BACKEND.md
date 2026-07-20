# Backend sidecar do CRONOS

Data: 2026-07-20

## Arquitetura

O aplicativo desktop Tauri inicia o backend Python real como sidecar local. O backend escuta apenas em `127.0.0.1`, usa porta dinamica e emite uma linha JSON `cronos_backend_ready` no stdout quando esta pronto.

Fluxo:

1. Tauri prepara `%LOCALAPPDATA%\CRONOS`.
2. Tauri gera `session_id` e token runtime de 256 bits.
3. Tauri reserva uma porta local.
4. Tauri inicia `cronos-backend.exe` como sidecar conhecido.
5. Backend cria banco/diretorios e emite readiness.
6. Tauri confirma `/health`.
7. Frontend recebe `base_url` e token em memoria.
8. Ao fechar, Tauri chama `/runtime/shutdown` e encerra o PID associado.

## Endpoints runtime

- `GET /health`: sem token, retorna status minimo.
- `GET /runtime/status`: exige `X-Cronos-Runtime-Token`.
- `POST /runtime/shutdown`: exige token e origem local.

O token nao e persistido, nao vai em query string e nao e gravado em logs.

## PyInstaller

Arquivos:

- `backend\packaging\cronos-backend.spec`
- `backend\packaging\runtime-hook.py`
- `scripts\build-backend.ps1`
- `scripts\test-backend-package.ps1`

Saidas:

- `backend\dist\cronos-backend-console.exe`
- `backend\dist\cronos-backend.exe`

## Tauri

O Tauri declara:

```json
"externalBin": ["binaries/cronos-backend"]
```

O script `scripts\prepare-sidecar.ps1` copia o backend para:

```text
frontend\src-tauri\binaries\cronos-backend-x86_64-pc-windows-msvc.exe
```

Esse nome segue a exigencia do Tauri para sidecars por target triple.
