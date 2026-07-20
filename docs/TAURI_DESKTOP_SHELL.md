# Shell desktop Tauri do CRONOS

Data: 2026-07-20

Branch: `feature/windows-desktop-installer`

## Escopo

Esta etapa adiciona uma casca desktop Tauri 2 para a interface React aprovada do CRONOS e integra o backend Python real como sidecar.

O objetivo e validar que o Windows consegue compilar e abrir o aplicativo desktop antes de integrar qualquer sidecar Python.

## Estrutura criada

```text
frontend\src-tauri\
  Cargo.toml
  build.rs
  tauri.conf.json
  capabilities\default.json
  icons\
  src\runtime\
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
- `.\scripts\test-desktop-runtime.ps1`: sidecar, login, chat, PDF, bloqueio e encerramento aprovados.

Artefato de build:

```text
frontend\src-tauri\target\release\cronos-desktop.exe
```

## Decisoes

- O layout visual aprovado nao foi alterado.
- O shell usa WebView2 local via Tauri.
- O plugin Rust `tauri-plugin-single-instance` foi adicionado para evitar multiplas instancias.
- O plugin `tauri-plugin-shell` inicia apenas o sidecar declarado em `externalBin`.
- O backend e iniciado em `127.0.0.1` com porta dinamica.
- O frontend recebe a conexao runtime via comando Tauri e guarda o token apenas em memoria.
- O bundle/instalador final ainda nao foi ativado.

## Fora do escopo

- Instalador `CronosSetup.exe`.
- Auto-update.
- Assinatura de codigo.
- Migracao automatica de dados reais.

Proxima etapa: revisar a experiencia desktop e somente depois gerar instalador final.
