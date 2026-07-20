# Empacotamento do backend

## Build

```powershell
.\scripts\build-backend.ps1
```

Responsabilidades:

- validar `.venv-packaging`;
- validar PyInstaller;
- limpar apenas `backend\build` e `backend\dist`;
- gerar `cronos-backend-console.exe`;
- gerar `cronos-backend.exe`;
- calcular SHA-256;
- executar smoke test.

## Teste

```powershell
.\scripts\test-backend-package.ps1
```

Cobertura:

- caminho com espacos;
- porta dinamica;
- `/health`;
- token incorreto;
- token correto;
- `/runtime/shutdown`;
- criacao de `installation.json`;
- execucao fora do Python global.

## Exclusoes

Nao entram no executavel:

- banco real;
- documentos;
- backups;
- credenciais;
- logs;
- tokens;
- caches.
