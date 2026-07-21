import hashlib
import json
from typing import Sequence

from cronos.core.db import connect
from cronos.core.retrieval_config import retrieval_config
from cronos.core.security import utcnow
from cronos.repositories import retrieval_repository
from cronos.services.embedding_provider import EmbeddingProvider, SentenceTransformerEmbeddingProvider

_provider: EmbeddingProvider | None = None


def get_provider() -> EmbeddingProvider:
    global _provider
    if _provider is None:
        _provider = SentenceTransformerEmbeddingProvider(retrieval_config.model_name, retrieval_config.expected_dimension)
        _provider.initialize()
    return _provider


def set_provider_for_tests(provider: EmbeddingProvider | None) -> None:
    global _provider
    _provider = provider


def provider_status() -> dict:
    provider = get_provider()
    return provider.health()


def providers() -> list[dict]:
    active = provider_status()
    return [
        active,
        {
            "provider": retrieval_config.fallback_provider_name,
            "model": "lexical",
            "available": True,
            "dimension": 0,
            "fallback": True,
        },
    ]


def index_chunks(owner_id: int, *, filters: dict | None = None, force: bool = False) -> dict:
    provider = get_provider()
    if not provider.is_available():
        return {"provider_available": False, "indexed": 0, "skipped": 0, "pending": _status(owner_id)["pending"]}
    filters = filters or {}
    with connect() as db:
        chunks = retrieval_repository.list_active_chunks(db, owner_id, filters)
        pending = [
            chunk
            for chunk in chunks
            if force or not retrieval_repository.get_embedding(db, chunk["id"], provider.health()["provider"], provider.model_name())
        ]
        indexed = 0
        skipped = len(chunks) - len(pending)
        for batch_start in range(0, len(pending), retrieval_config.semantic_batch_size):
            batch = pending[batch_start : batch_start + retrieval_config.semantic_batch_size]
            try:
                vectors = provider.embed_documents([chunk["text_content"] for chunk in batch])
            except Exception as error:
                status = retrieval_repository.index_status(db, owner_id)
                return {
                    "provider_available": False,
                    "indexed": indexed,
                    "skipped": skipped,
                    "error": str(error)[:180],
                    **status,
                }
            now = utcnow().isoformat()
            for chunk, vector in zip(batch, vectors):
                payload = _embedding_payload(chunk, vector, provider, now)
                retrieval_repository.upsert_embedding(db, payload)
                indexed += 1
        status = retrieval_repository.index_status(db, owner_id)
    return {"provider_available": True, "indexed": indexed, "skipped": skipped, **status}


def embed_query(text: str) -> list[float] | None:
    provider = get_provider()
    if not provider.is_available():
        return None
    try:
        return provider.embed_query(text)
    except Exception:
        return None


def _embedding_payload(chunk: dict, vector: Sequence[float], provider: EmbeddingProvider, now: str) -> dict:
    serialized = json.dumps([round(float(value), 8) for value in vector], separators=(",", ":"))
    return {
        "document_id": chunk["document_id"],
        "chunk_id": chunk["id"],
        "provider": provider.health()["provider"],
        "model": provider.model_name(),
        "dimension": provider.dimension(),
        "embedding": serialized,
        "embedding_hash": hashlib.sha256(serialized.encode("utf-8")).hexdigest(),
        "created_at": now,
        "updated_at": now,
    }


def _status(owner_id: int) -> dict:
    with connect() as db:
        return retrieval_repository.index_status(db, owner_id)
