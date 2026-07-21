# Inventario Semantico RC2

## Provider

- Provider ativo: `cronos-local-semantic`
- Provider oficial da v0.2.0: `cronos-local-semantic`
- Interface arquitetural: `SemanticProvider`
- Dimensao: `384`
- Operacao offline: sim
- Download automatico na primeira execucao: nao
- Dependencia obrigatoria de Hugging Face: nao
- Dependencia obrigatoria de `sentence_transformers`: nao

## Arquivos incluidos

- `backend/cronos/models/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/model-config.json`
- Incluido no PyInstaller em `cronos/models/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`

Observacao: o nome do diretorio e um identificador historico de compatibilidade da RC2. Ele nao significa dependencia obrigatoria da biblioteca `sentence_transformers`, Hugging Face ou download automatico.

## Artefatos

- Backend sidecar: `cronos-backend-x86_64-pc-windows-msvc.exe`
- Tamanho: `14655709` bytes
- SHA-256: `E14B10B3FA0E0A87E14CC29468F6625725CA3444CEA19F0B030205DBDB07429A`

## Limite conhecido

O provider da RC2 e local/offline e mantem embeddings de 384 dimensoes. A busca hibrida fica funcional quando os embeddings estao presentes, e o fallback lexical permanece ativo caso o provider falhe.

## Expansao futura

A arquitetura permite adicionar novos providers sem alterar a API publica:

- Sentence Transformers
- ONNX
- GGUF
- TensorRT
- CUDA
- outros providers locais
