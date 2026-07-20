# Seguranca desktop

## Token runtime

- 256 bits de entropia.
- Gerado no Tauri a cada execucao.
- Enviado ao backend por argumento de processo.
- Usado apenas no header `X-Cronos-Runtime-Token`.
- Mantido em memoria no frontend.
- Nao persistido.
- Nao exibido.
- Nao enviado em query string.

## Rede

- Backend escuta somente em `127.0.0.1`.
- Ambiente `desktop`/`production` recusa `0.0.0.0`.
- Nenhuma regra de firewall e criada.

## Permissoes Tauri

Capabilities liberam apenas:

- `core:default`.
- execucao do sidecar conhecido `binaries/cronos-backend`.

Nao foi liberado shell arbitrario nem acesso irrestrito ao sistema.
