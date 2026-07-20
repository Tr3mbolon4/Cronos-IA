# Testes de instalacao Windows

## Suite local

```powershell
.\scripts\test-installer.ps1 -Version 0.1.0
.\scripts\test-update.ps1
```

Esses testes conferem existencia, SHA-256, manifesto e politica de update.

## Suite com instalacao real

Requer PowerShell como Administrador, pois o instalador oficial usa `perMachine`.

```powershell
.\scripts\test-installer.ps1 -Version 0.1.0 -Install
.\scripts\test-installed-app.ps1
.\scripts\test-uninstall.ps1
```

