import json
import math

from cronos.core.db import connect
from cronos.core.retrieval_config import retrieval_config
from cronos.repositories import retrieval_repository
from cronos.schemas.document_schemas import document_error
from cronos.services import (
    document_citation_service,
    document_ingestion_service,
    embedding_service,
    lexical_search_service,
    reranking_service,
)


def retrieve(owner_id: int, payload: dict) -> dict:
    query = str(payload.get("query") or "").strip()
    if not query:
        raise document_error("DOCUMENT_VALIDATION_ERROR", "Query obrigatoria.")
    top_k = _top_k(payload.get("top_k"))
    filters = dict(payload.get("filters") or {})
    document_ingestion_service.ensure_legacy_documents_indexed()
    with connect() as db:
        chunks = retrieval_repository.list_active_chunks(db, owner_id, filters)
    lexical = lexical_search_service.search(chunks, query)
    lexical_by_chunk = {item["chunk"]["id"]: item for item in lexical}
    semantic_by_chunk = _semantic_scores(owner_id, query, filters)

    combined_ids = set(lexical_by_chunk) | set(semantic_by_chunk)
    chunk_by_id = {chunk["id"]: chunk for chunk in chunks}
    items = []
    for chunk_id in combined_ids:
        chunk = chunk_by_id.get(chunk_id) or semantic_by_chunk[chunk_id]["chunk"]
        item = {
            "chunk": chunk,
            "score_lexical": lexical_by_chunk.get(chunk_id, {}).get("score_lexical", 0.0),
            "score_semantic": semantic_by_chunk.get(chunk_id, {}).get("score_semantic", 0.0),
            "proximity": lexical_by_chunk.get(chunk_id, {}).get("proximity", 0.0),
        }
        items.append(item)
    ranked = [item for item in reranking_service.rerank(items) if item["score_final"] >= retrieval_config.minimum_score]
    provider = embedding_service.provider_status()
    return {
        "items": [_format_item(item) for item in ranked[:top_k]],
        "total": len(ranked),
        "top_k": top_k,
        "provider": provider,
        "mode": "hybrid" if provider.get("available") and any(item.get("score_semantic", 0) > 0 for item in ranked) else "lexical",
    }


def index_status(owner_id: int) -> dict:
    with connect() as db:
        status = retrieval_repository.index_status(db, owner_id)
    provider = embedding_service.provider_status()
    mode = "hybrid" if provider.get("available") else "lexical"
    return {
        **status,
        "provider": provider,
        "configured_provider": provider.get("configured_provider") or provider.get("provider"),
        "provider_loaded": bool(provider.get("loaded", provider.get("available"))),
        "model": provider.get("model"),
        "dimension": provider.get("dimension"),
        "mode": mode,
        "semantic_available": bool(provider.get("available")),
        "last_error": provider.get("error"),
    }


def providers() -> list[dict]:
    return embedding_service.providers()


def rebuild_index(owner_id: int, payload: dict | None = None) -> dict:
    payload = payload or {}
    filters = dict(payload.get("filters") or {})
    force = bool(payload.get("force"))
    document_ingestion_service.ensure_legacy_documents_indexed()
    return embedding_service.index_chunks(owner_id, filters=filters, force=force)


def _semantic_scores(owner_id: int, query: str, filters: dict) -> dict[int, dict]:
    query_vector = embedding_service.embed_query(query)
    if query_vector is None:
        return {}
    provider = embedding_service.get_provider()
    with connect() as db:
        embeddings = retrieval_repository.list_embeddings(db, provider.health()["provider"], provider.model_name(), filters)
    results: dict[int, dict] = {}
    for row in embeddings:
        vector = json.loads(row["embedding"])
        score = _cosine(query_vector, vector)
        if score <= 0:
            continue
        chunk = {
            "id": row["chunk_id"],
            "document_id": row["document_id"],
            "source_id": row["source_id"],
            "page_id": row["page_id"],
            "chunk_index": row["chunk_index"],
            "text_content": row["text_content"],
            "normalized_text": row["normalized_text"],
            "character_start": row["character_start"],
            "character_end": row["character_end"],
            "document_title": row["document_title"],
            "original_filename": row["original_filename"],
            "page_number": row["page_number"],
        }
        results[row["chunk_id"]] = {"chunk": chunk, "score_semantic": score}
    return results


def _format_item(item: dict) -> dict:
    chunk = item["chunk"]
    document = {"id": chunk["document_id"], "filename": chunk["document_title"]}
    source = {"id": chunk["source_id"], "original_filename": chunk["original_filename"]}
    page = {"id": chunk["page_id"], "page_number": chunk["page_number"]}
    citation = document_citation_service.build_citation(document, source, page, chunk, relevance_score=item["score_final"])
    return {
        "document": document,
        "page": page,
        "chunk": chunk,
        "citation": citation,
        "score_lexical": round(float(item.get("score_lexical") or 0.0), 6),
        "score_semantic": round(float(item.get("score_semantic") or 0.0), 6),
        "score_final": item["score_final"],
        "excerpt": citation["excerpt"],
    }


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if not left_norm or not right_norm:
        return 0.0
    return max(0.0, min(1.0, dot / (left_norm * right_norm)))


def _top_k(value: object) -> int:
    try:
        parsed = int(value or retrieval_config.top_k)
    except (TypeError, ValueError):
        parsed = retrieval_config.top_k
    return min(max(parsed, 1), retrieval_config.max_top_k)
