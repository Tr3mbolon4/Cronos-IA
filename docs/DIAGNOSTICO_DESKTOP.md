# Diagnostico desktop

Scripts:

```powershell
.\scripts\build-backend.ps1
.\scripts\test-backend-package.ps1
.\scripts\prepare-sidecar.ps1
.\scripts\desktop-build.ps1
.\scripts\test-desktop-runtime.ps1
```

Logs:

```text
%LOCALAPPDATA%\CRONOS\logs\cronos-backend.log
```

Sessao runtime:

```text
%LOCALAPPDATA%\CRONOS\runtime\current-session.json
```

O arquivo de sessao nao contem token.

## Ultimos resultados

- Backend empacotado: aprovado.
- Token correto: aprovado.
- Token incorreto: 401.
- Porta dinamica: aprovado.
- Login via desktop sidecar: aprovado.
- Chat via desktop sidecar: aprovado.
- PDF via desktop sidecar: aprovado.
- Bloqueio: aprovado.
- Fechamento sem processo orfao: aprovado.
- Teste externo em `C:\Temp\Cronos Desktop Test`: aprovado.
