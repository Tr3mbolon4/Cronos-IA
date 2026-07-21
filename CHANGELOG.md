# Changelog

## Unreleased

- Adiciona interfaces funcionais de Memoria, Biblioteca e busca de conhecimento para a v0.2.0.
- Centraliza consumo das APIs do frontend em cliente com runtime token, timeout e erros estruturados.
- Adiciona navegacao lateral sem reload para Dashboard, Memoria e Biblioteca.
- Corrige warning de dependencias do refresh autenticado em `frontend/src/App.tsx`.
- Amplia validacao visual autenticada para Memoria, Biblioteca e citacoes em 1920, 1600 e 1366 px.

## 0.1.2 - 2026-07-20

- Corrige o carregamento infinito/falha de identidade no CRONOS Desktop instalado.
- Adiciona tela de falha de inicializacao com retry, abertura de logs e fechamento seguro.
- Aguarda o backend sidecar ficar pronto antes de entregar a conexao ao frontend.
- Registra logs de startup do desktop, porta dinamica, health check e PID do backend.
- Ajusta CORS do backend local para aceitar a origem do WebView Tauri instalado.
- Inclui health check com informacoes de readiness, banco e runtime.
- Valida instalacao real em `D:\CRONOS` preservando `%LOCALAPPDATA%\CRONOS`.

## 0.1.0 - 2026-07-20

- Adiciona instalador Windows oficial do CRONOS via Tauri NSIS.
- Define identidade de produto: CRONOS, `com.kalion.cronos`, Kalion Tecnologia.
- Mantem backend Python como sidecar empacotado junto ao desktop.
- Preserva dados do usuario em `%LOCALAPPDATA%\CRONOS`.
- Inclui scripts de build, manifesto de release, hashes SHA-256 e testes de instalador.

