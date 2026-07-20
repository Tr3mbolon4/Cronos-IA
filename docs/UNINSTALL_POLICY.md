# Politica de desinstalacao

O CRONOS separa aplicacao e dados:

- Aplicacao: `C:\Program Files\CRONOS`
- Dados: `%LOCALAPPDATA%\CRONOS`

A desinstalacao remove a aplicacao instalada e preserva dados locais do usuario. Limpeza de dados deve ser acao explicita, usando `scripts\remove-cronos-test-data.ps1` com confirmacao textual.

