# Cronos-IA

Projeto CRONOS: aplicativo pessoal, local, instalavel e protegido para Windows.

> Status: MVP desktop em evolucao, com foco em execucao local, privacidade e empacotamento Windows.

## Visao Geral

O CRONOS combina uma interface desktop Tauri com frontend React/TypeScript e backend Python local. O objetivo do projeto e oferecer um assistente pessoal offline/local para organizacao, diagnostico e interacao com documentos, preservando dados no ambiente do usuario.

## Funcionalidades

- backend local em Python;
- frontend React/TypeScript;
- cadastro do proprietario;
- login com senha e PIN;
- bloqueio de sessao;
- chat local com historico persistido;
- upload e leitura de PDF;
- perguntas sobre PDF com citacoes simples;
- diagnostico de hardware;
- backup local em `.zip`;
- identidade visual oficial escura/neon inspirada no nucleo CRONOS.

O instalador `CronosSetup.exe` ainda depende da etapa final de empacotamento/assinatura. A base desktop ja possui shell Tauri 2 com backend Python real integrado como sidecar, usando porta local dinamica, token runtime em memoria e diretorios em `%LOCALAPPDATA%\CRONOS`.

## Tecnologias

- Python
- React
- TypeScript
- Tauri 2
- Rust
- SQLite
- Vite

## Layout oficial

A versao 1.0 adota uma interface escura com detalhes em azul neon, menu lateral modular, nucleo central animado e dashboard com conversa, tarefas, recursos do computador e atividades recentes. Os indicadores devem ser funcionais: no MVP, CPU, RAM e armazenamento ja usam metricas locais reais; GPU, VRAM e temperatura ficam preparados para a proxima etapa de deteccao.

## Ambiente

Clone o repositorio em um diretorio local de trabalho e use os scripts em `scripts/` para desenvolvimento, testes e empacotamento.

## Repositorio

Repositorio GitHub: `https://github.com/Tr3mbolon4/Cronos-IA`

## Executar em desenvolvimento

Instale dependencias:

```powershell
.\scripts\setup.ps1
```

Em um terminal, rode o backend:

```powershell
.\scripts\dev-backend.ps1
```

Em outro terminal, rode a interface:

```powershell
.\scripts\dev-frontend.ps1
```

Acesse:

```text
http://127.0.0.1:5173
```

## Testes

```powershell
.\scripts\test.ps1
```

## Desktop Tauri

Com o ambiente Windows validado, a interface pode ser executada como aplicativo desktop com sidecar:

```powershell
.\scripts\desktop-dev.ps1
.\scripts\desktop-build.ps1
```

Testes principais:

```powershell
.\scripts\test.ps1
.\scripts\visual-test.ps1
.\scripts\test-backend-package.ps1
.\scripts\test-desktop-runtime.ps1
```

Artefatos locais gerados:

- `backend\dist\cronos-backend.exe`
- `backend\dist\cronos-backend-console.exe`
- `frontend\src-tauri\target\release\cronos-desktop.exe`

## Seguranca

Nao versionar bancos locais, backups, logs, arquivos `.env`, tokens, credenciais, documentos pessoais ou dados gerados em runtime. Veja [SECURITY.md](SECURITY.md) e [docs/security-audit.md](docs/security-audit.md).

## Licenca

Projeto proprietario. Todos os direitos reservados.
