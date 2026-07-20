# Instalador Windows do CRONOS

Versao inicial: `0.1.0`

## Identidade

- Produto: CRONOS
- Fabricante: Kalion Tecnologia
- Identificador: `com.kalion.cronos`
- Instalador principal: `CronosSetup-0.1.0.exe`
- Instalacao padrao: `C:\Program Files\CRONOS`
- Dados do usuario: `%LOCALAPPDATA%\CRONOS`

## Gerar instalador

Execute na raiz do projeto:

```powershell
.\scripts\build-installer.ps1 -Version 0.1.0
```

Artefatos gerados:

```text
release\CRONOS-0.1.0\CronosSetup-0.1.0.exe
release\CRONOS-0.1.0\release-manifest.json
release\CRONOS-0.1.0\SHA256SUMS.txt
release\CRONOS-0.1.0\INSTALL.txt
release\CRONOS-0.1.0\CHANGELOG.txt
```

## Validar instalador

Validacao nao destrutiva:

```powershell
.\scripts\test-installer.ps1 -Version 0.1.0
```

Instalacao silenciosa per-machine requer PowerShell como Administrador:

```powershell
.\scripts\test-installer.ps1 -Version 0.1.0 -Install
.\scripts\test-installed-app.ps1
```

## Politica de dados

O instalador remove os arquivos instalados em `C:\Program Files\CRONOS`, mas os dados locais de usuario em `%LOCALAPPDATA%\CRONOS` devem permanecer preservados. Para limpar somente dados de teste:

```powershell
.\scripts\remove-cronos-test-data.ps1 -Confirmation REMOVER-CRONOS-TESTE
```

