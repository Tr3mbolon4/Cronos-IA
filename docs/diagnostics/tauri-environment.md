# Diagnostico Tauri

Data: 2026-07-20

## `npm run tauri:info`

Resultado: aprovado.

Itens detectados:

- OS: Windows 10.0.26200 x86_64
- WebView2: `150.0.4078.83`
- MSVC: Visual Studio Build Tools 2022
- rustc: `1.97.1`
- cargo: `1.97.1`
- rustup: `1.29.0`
- toolchain: `stable-x86_64-pc-windows-msvc`
- node: `20.20.2`
- npm: `10.8.2`
- `@tauri-apps/api`: `2.11.1`
- `@tauri-apps/cli`: `2.11.4`
- `tauri-plugin-single-instance`: `2`

## `npm run tauri:build`

Resultado: aprovado.

Executavel gerado:

```text
frontend\src-tauri\target\release\cronos-desktop.exe
```

Observacao: o linker emitiu aviso informativo em portugues sobre criacao de biblioteca `.dll.lib` e objeto `.dll.exp`; o build terminou com sucesso.

## `npm run tauri:dev`

Resultado: aprovado para shell inicial.

Evidencias:

- Vite subiu em `http://127.0.0.1:5173/`.
- Cargo concluiu o perfil `dev`.
- Processo `target\debug\cronos-desktop.exe` foi detectado.
- A arvore de processos foi encerrada manualmente depois da deteccao para nao deixar sessoes abertas.

## Limite

O teste confirma apenas o shell desktop. Nenhum sidecar Python foi iniciado ou integrado.
