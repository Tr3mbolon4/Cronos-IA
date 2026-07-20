# Cronos-IA

Projeto CRONOS: aplicativo pessoal, local, instalavel e protegido para Windows.

## Estado atual

Esta base contem o MVP local inicial:

- backend local em Python;
- frontend React/TypeScript;
- cadastro do proprietario;
- login com senha e PIN;
- bloqueio de sessao;
- chat local com historico persistido;
- upload e leitura de PDF;
- perguntas sobre PDF com citacoes simples;
- diagnostico de hardware;
- backup local em `.zip`.
- identidade visual oficial escura/neon inspirada no nucleo CRONOS.

O instalador `CronosSetup.exe` ainda depende da etapa de sidecar Python e empacotamento final. A base desktop ja possui shell Tauri 2 inicial, com Rust/MSVC/WebView2 validados e build Windows gerando `frontend\src-tauri\target\release\cronos-desktop.exe`.

## Layout oficial

A versao 1.0 adota uma interface escura com detalhes em azul neon, menu lateral modular, nucleo central animado e dashboard com conversa, tarefas, recursos do computador e atividades recentes. Os indicadores devem ser funcionais: no MVP, CPU, RAM e armazenamento ja usam metricas locais reais; GPU, VRAM e temperatura ficam preparados para a proxima etapa de deteccao.

## Local de trabalho

Este ambiente deve usar `G:\Cronos-IA` como local principal do projeto.

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

Com o ambiente Windows validado, a interface pode ser executada como aplicativo desktop:

```powershell
cd frontend
npm run tauri:info
npm run tauri:dev
npm run tauri:build
```

Esta etapa ainda nao inclui sidecar Python. O backend local permanece separado ate a proxima fase de integracao.
