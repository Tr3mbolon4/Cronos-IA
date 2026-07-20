# Shell desktop Tauri do CRONOS

Data: 2026-07-20

Branch: `feature/windows-desktop-installer`

## Escopo

Esta etapa adiciona uma casca desktop Tauri 2 para a interface React aprovada do CRONOS.

O objetivo e validar que o Windows consegue compilar e abrir o aplicativo desktop antes de integrar qualquer sidecar Python.

## Estrutura criada

```text
frontend\src-tauri\
  Cargo.toml
  build.rs
  tauri.conf.json
  capabilities\default.json
  icons\
  src\lib.rs
  src\main.rs
```

## Scripts

No `frontend\package.json`:

```powershell
npm run tauri:info
npm run tauri:dev
npm run tauri:build
```

Os scripts web existentes continuam preservados:

```powershell
npm run dev
npm run build
npm run preview
```

## Configuracao da janela

- Titulo: `CRONOS`
- Tamanho inicial: `1366x768`
- Tamanho minimo: `1100x720`
- Fundo: `#02050a`
- Janela redimensionavel e centralizada
- Identificador: `com.cronos.desktop`

## Validacoes executadas

- `npm run build`: aprovado.
- `npm run tauri:info`: aprovado.
- `npm run tauri:build`: aprovado.
- `npm run tauri:dev`: app desktop detectado em modo debug.

Artefato de build:

```text
frontend\src-tauri\target\release\cronos-desktop.exe
```

## Decisoes

- O layout visual aprovado nao foi alterado.
- O shell usa WebView2 local via Tauri.
- O plugin Rust `tauri-plugin-single-instance` foi adicionado para evitar multiplas instancias.
- O bundle/instalador final ainda nao foi ativado.

## Fora do escopo

- Sidecar Python.
- Instalador `CronosSetup.exe`.
- Auto-update.
- Assinatura de codigo.
- Comunicacao desktop-backend por comandos Tauri.

Proxima etapa: integrar o backend Python como sidecar depois que o contrato de processo, porta, healthcheck e encerramento estiver definido.
