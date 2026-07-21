# Relatorio de Testes RC2

## Automatizados

- `scripts/test.ps1`: aprovado.
- Backend unittest: aprovado, `57` testes.
- Frontend build: aprovado.
- `npm run lint`: aprovado.
- `cargo check`: aprovado.
- `scripts/test-login-error.ps1`: aprovado.
- `scripts/validate-migration-copy.ps1 -SourceDb G:\Cronos-IA\data\cronos.db -OutputName v0.2.0-rc2-validation-copy`: aprovado.
- `scripts/test-backend-package.ps1`: aprovado.
- PyInstaller: aprovado.
- Tauri build: aprovado.

## Empacotamento

- Instalador: `CronosSetup-0.2.0-rc2.exe`
- Tamanho do instalador: `17181970` bytes
- SHA-256: `4479769D06082BF06084F37584FEF4B05D85DC1425C918D21906DAAA99AA6358`
- Backend empacotado: `14655709` bytes
- Desktop release: `11196928` bytes

## Benchmark Semantico Local

Benchmark executado com o provider oficial `cronos-local-semantic`, banco temporario e 200 chunks sinteticos. O banco pessoal em `%LOCALAPPDATA%\CRONOS` nao foi acessado nem alterado.

- Provider: `cronos-local-semantic`
- Dimensao: `384`
- Chunks processados: `200`
- Embeddings gerados: `200`
- Tempo medio de geracao de embedding: `1,31 ms`
- Tempo de indexacao: `438,26 ms`
- Tempo medio de consulta: `71,57 ms`
- Uso aproximado de memoria: `2,38 MB` de pico por `tracemalloc`
- Embeddings processados por segundo: `456,35`
- Modo final: `hybrid`
- Total retornado na consulta de controle: `200`

## Validacao pendente

- Instalar a RC2 sobre a RC1 em `D:\CRONOS`.
- Confirmar preservacao do banco pessoal.
- Confirmar `document_embeddings=1` apos indexacao incremental do documento existente.
- Confirmar busca hibrida com citacao.
- Confirmar fallback lexical de forma controlada.
