def build_citation(document: dict, source: dict, page: dict, chunk: dict, *, relevance_score: float | None = None) -> dict:
    label = f"{source['original_filename']} - pagina {page['page_number']}"
    excerpt = chunk["text_content"][:360]
    return {
        "document_id": document["id"],
        "document_title": document["filename"],
        "source_id": source["id"],
        "source_filename": source["original_filename"],
        "page_id": page["id"],
        "page_number": page["page_number"],
        "chunk_id": chunk["id"],
        "chunk_index": chunk["chunk_index"],
        "excerpt": excerpt,
        "character_start": chunk["character_start"],
        "character_end": chunk["character_end"],
        "relevance_score": relevance_score,
        "citation_label": label,
    }
