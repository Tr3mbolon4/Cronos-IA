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

O instalador `CronosSetup.exe` ainda depende da etapa Tauri/Rust e empacotamento Windows. Nesta maquina, Rust/Cargo nao estao instalados e o pip esta bloqueado por proxy, entao o MVP atual foi feito para rodar sem novas dependencias Python obrigatorias.

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
