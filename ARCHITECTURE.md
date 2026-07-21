# CRONOS Architecture

## Semantic Retrieval Provider

The v0.2.0 retrieval architecture remains provider-based. The public contract is the abstract `SemanticProvider` interface, implemented in the current backend code as `EmbeddingProvider`.

The interface exposes:

- `initialize()`
- `is_available()`
- `embed_documents()`
- `embed_query()`
- `dimension()`
- `model_name()`
- `health()`

## Official v0.2.0 Provider

The official provider for CRONOS v0.2.0 is the local CRONOS semantic provider:

- provider id: `cronos-local-semantic`
- execution: local and offline
- automatic downloads: no
- Hugging Face dependency: no
- mandatory `sentence_transformers` dependency: no
- embedding dimension: `384`
- fallback: lexical retrieval remains active if semantic loading or execution fails

The provider is packaged with the installed backend sidecar and loads its local model metadata from the application bundle. It must not silently download models during startup, indexing, or search.

## Status Contract

Retrieval status must report enough information for diagnostics without exposing secrets:

- configured provider
- loaded provider
- model name
- local model path
- dimension
- chunk count
- embedding count
- current mode: `lexical` or `hybrid`
- sanitized last error, when present

## Extensibility

Additional local providers can be added later without changing the public retrieval API or the database contract. Planned compatible providers include:

- Sentence Transformers
- ONNX
- GGUF
- TensorRT
- CUDA
- other local providers

Any future provider must preserve the same safety rules: explicit local configuration, no silent downloads, sanitized errors, and lexical fallback.
