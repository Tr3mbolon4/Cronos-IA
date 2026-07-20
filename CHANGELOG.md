# Changelog

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

