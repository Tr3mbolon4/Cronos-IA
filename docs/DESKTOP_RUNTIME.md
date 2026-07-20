# Runtime desktop

## Ciclo de vida

- Startup: instancia unica, diretorios, token, porta, sidecar, healthcheck, frontend.
- Operacao: frontend chama a API local pela porta dinamica.
- Falha: frontend marca indisponibilidade e comandos Tauri podem reiniciar o backend.
- Fechamento: `/runtime/shutdown`, timeout curto e kill apenas do child associado.

## Comandos Tauri

- `get_runtime_connection`
- `get_runtime_status`
- `restart_backend`
- `open_logs_directory`
- `shutdown_cronos`

`get_runtime_connection` retorna o token somente para memoria do processo frontend. O token nao e salvo em `localStorage` nem `sessionStorage`.

## Estados

- `ready`: sidecar pronto e `/health` OK.
- `starting`: inicializacao em andamento.
- `offline`: sidecar indisponivel ou health falhou.

O dashboard visual aprovado foi preservado.
