# Diagnostico do empacotamento Python

Data: 2026-07-20

Branch: `feature/windows-desktop-installer`

## Objetivo

Preparar uma base local e isolada para empacotar futuramente o backend/sidecar Python do CRONOS, sem instalar pacotes Python globalmente e sem alterar o layout aprovado.

## Ambiente

- Python usado: `3.13.14`
- Ambiente virtual: `.venv-packaging`
- PyInstaller: `6.13.0`
- pypdf: `6.10.0`
- Sistema: Windows 11

## Dependencias

Arquivo criado:

```text
backend\requirements-packaging.txt
```

Conteudo inicial:

```text
pypdf>=6.0.0
pyinstaller>=6.13.0
```

## Observacoes sobre instalacao

O `pip install` direto a partir da rede falhou com proxy `407 Proxy Authentication Required`.

Para manter a regra de nao instalar pacotes globalmente, foi usado um ambiente `.venv-packaging` dedicado. O pacote `pypdf` foi aproveitado a partir do runtime local ja existente do Codex, e o PyInstaller `6.13.0` ja estava disponivel no ambiente local.

## Validacao 1: executavel simples

Comando validado:

```powershell
.\.venv-packaging\Scripts\python.exe -m PyInstaller --onefile --clean hello_packaging.py
```

Resultado:

```text
CRONOS PyInstaller OK
64bit
```

Status: aprovado.

## Validacao 2: servidor local empacotado

Foi criado um servidor HTTP temporario com:

- bind em `127.0.0.1`;
- porta dinamica;
- arquivo de porta para handshake;
- endpoint `/health`;
- encerramento pelo PID especifico do processo iniciado.

Resultado do healthcheck:

```json
{"status":"ok","service":"cronos-packaging-test"}
```

Status: aprovado.

## Limites desta etapa

- Nenhum sidecar real foi implementado.
- Nenhum backend foi empacotado como produto final.
- Nenhum instalador Windows foi criado.

Proxima etapa: adicionar o shell desktop Tauri 2 usando o frontend existente.
