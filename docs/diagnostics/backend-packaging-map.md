# Mapa de empacotamento do backend CRONOS

Data: 2026-07-20

Branch: `feature/windows-desktop-installer`

## Entrada real usada pelo MVP

- Modulo: `backend\cronos\server.py`
- Comando atual: `python -m cronos.server`
- Script atual: `scripts\dev-backend.ps1`
- Framework em uso no desenvolvimento: `http.server.ThreadingHTTPServer`
- Host padrao atual: `127.0.0.1`
- Porta padrao atual: `8000`

Existe tambem `backend\cronos\main.py` com FastAPI, mas o MVP atual e os scripts de desenvolvimento usam `cronos.server`. A integracao sidecar deve partir de `cronos.server` para preservar o comportamento validado.

## Rotas atuais

- `GET /health`
- `GET /setup/status`
- `POST /setup/owner`
- `POST /auth/login`
- `POST /auth/lock`
- `GET /auth/session`
- `POST /chat`
- `GET /chat/history`
- `POST /documents/upload`
- `GET /documents`
- `POST /documents/{document_id}/ask`
- `GET /diagnostics/hardware`
- `POST /backup`
- `POST /restore`

## Dependencias reais do servidor atual

Biblioteca padrao:

- `http.server`
- `json`
- `os`
- `re`
- `sqlite3`
- `zipfile`
- `pathlib`
- `ctypes` no Windows para diagnostico de memoria/CPU

Dependencia externa:

- `pypdf`

O arquivo `backend\pyproject.toml` lista FastAPI, Uvicorn, Pydantic, python-multipart, pypdf e psutil, mas a entrada `cronos.server` nao depende de FastAPI/Uvicorn/Pydantic/psutil no fluxo atual.

## Dados e diretorios atuais

Configurados em `backend\cronos\core\config.py`:

- `settings.data_dir`: `data` em desenvolvimento.
- `settings.db_path`: `data\cronos.db`.
- `settings.documents_dir`: `data\documents`.
- `settings.backups_dir`: `data\backups`.

Modo `visual-test`:

- `CRONOS_ENV=visual-test`
- dados em `data\visual-test`

## Banco

- Tipo: SQLite.
- Inicializacao: `backend\cronos\core\db.py`.
- Tabelas: `owner`, `sessions`, `messages`, `documents`, `audit_log`.
- Seed visual opcional: `CRONOS_VISUAL_TEST_PASSWORD` e `CRONOS_VISUAL_TEST_PIN`.

## Documentos

- Uploads PDF em `settings.documents_dir`.
- Extracao de texto com `pypdf.PdfReader`.
- Caminho persistido no SQLite em `documents.stored_path`.

## Backups

- Criados em `settings.backups_dir`.
- Incluem `cronos.db` e arquivos de `documents`.
- Nao devem ser incluidos no executavel PyInstaller.

## Variaveis de ambiente ja existentes

- `CRONOS_HOST`
- `CRONOS_PORT`
- `CRONOS_DATA_DIR`
- `CRONOS_ENV`
- `CRONOS_SESSION_MINUTES`
- `CRONOS_ALLOWED_ORIGINS`
- `CRONOS_VISUAL_TEST_PASSWORD`
- `CRONOS_VISUAL_TEST_PIN`

## Variaveis a adicionar para desktop

- `CRONOS_LOG_DIR`
- `CRONOS_RUNTIME_TOKEN`
- `CRONOS_SESSION_ID`
- `CRONOS_PARENT_PID`

## Arquivos estaticos e assets

O backend atual nao possui templates, arquivos estaticos, assets ou migracoes externas. O PyInstaller deve incluir apenas o pacote `cronos` e metadados necessarios para execucao.

## Importacoes dinamicas e modulos opcionais

- `pypdf` e importado diretamente em `services\documents.py`.
- `ctypes` e usado condicionalmente em `services\diagnostics.py`.
- Nao foram encontrados imports dinamicos com `importlib`.
- FastAPI/Uvicorn existem como modulo alternativo, mas nao fazem parte da entrada sidecar inicial.

## Processos auxiliares

O backend atual nao inicia subprocessos auxiliares.

## Itens que o PyInstaller deve incluir

- Pacote `cronos`.
- Dependencia `pypdf`.
- Biblioteca padrao embutida pelo PyInstaller.

## Itens que o PyInstaller nao deve incluir

- `data\cronos.db`.
- `data\documents`.
- `data\backups`.
- `data\visual-test`.
- Credenciais.
- Tokens.
- Logs.
- Caches.
- Artefatos temporarios.

## Riscos identificados antes do sidecar

- O frontend usa `http://127.0.0.1:8000` como fallback fixo.
- O backend ainda nao emite evento JSON estruturado de readiness.
- O backend ainda nao possui `/runtime/status` nem `/runtime/shutdown`.
- O backend ainda nao exige token runtime para rotas internas.
- O backend ainda nao separa diretorios de producao em `%LOCALAPPDATA%\CRONOS`.
- O shutdown atual depende de encerramento externo do processo.
