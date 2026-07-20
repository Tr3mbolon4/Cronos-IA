# Testes de atualizacao Windows

A versao `0.1.0` nao implementa auto-update. O teste atual verifica que:

- `release-manifest.json` declara `autoUpdate: false`;
- a instalacao usa `perMachine`;
- os artefatos esperados possuem hash SHA-256.

Quando houver `0.1.1`, o fluxo deve instalar `0.1.0`, instalar a versao nova por cima e confirmar que `%LOCALAPPDATA%\CRONOS\configuration\installation.json` preserva o mesmo `installation_id`.

