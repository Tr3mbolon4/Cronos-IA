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
- memoria permanente, biblioteca, paginas, chunks, citacoes e retrieval lexical/hibrido na linha v0.2.0.

O instalador `CronosSetup.exe` ainda depende da etapa final de empacotamento/assinatura. A base desktop ja possui shell Tauri 2 com backend Python real integrado como sidecar, usando porta local dinamica, token runtime em memoria e diretorios em `%LOCALAPPDATA%\CRONOS`.

## Provider semantico oficial

A v0.2.0 adota uma arquitetura baseada em providers para retrieval. A interface abstrata publica e o `SemanticProvider`, representado no backend atual por `EmbeddingProvider`.

O provider oficial da v0.2.0 e `cronos-local-semantic`: local, offline, empacotado com o backend, sem downloads automaticos, sem dependencia obrigatoria de Hugging Face e sem requisito obrigatorio de `sentence_transformers`. Ele mantem embeddings de 384 dimensoes e preserva fallback lexical quando o provider semantico nao estiver disponivel.

Providers adicionais poderao ser adicionados futuramente sem alterar a API publica: Sentence Transformers, ONNX, GGUF, TensorRT, CUDA e outros providers locais.

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
