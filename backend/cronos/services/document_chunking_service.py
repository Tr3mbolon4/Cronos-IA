import hashlib

from cronos.core.knowledge_config import knowledge_config
from cronos.models.document import normalize_document_text


def chunk_page(text: str) -> list[dict]:
    if not text:
        return []
    chunks: list[dict] = []
    start = 0
    index = 0
    length = len(text)
    while start < length:
        target_end = min(start + knowledge_config.chunk_size, length)
        end = _prefer_boundary(text, start, target_end)
        if end <= start:
            end = target_end
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append(
                {
                    "chunk_index": index,
                    "text_content": chunk_text,
                    "normalized_text": normalize_document_text(chunk_text),
                    "character_start": start,
                    "character_end": end,
                    "token_estimate": max(1, len(chunk_text) // 4),
                    "content_hash": hashlib.sha256(chunk_text.encode("utf-8")).hexdigest(),
                }
            )
            index += 1
        if end >= length:
            break
        start = max(end - knowledge_config.chunk_overlap, start + 1)
    return chunks


def _prefer_boundary(text: str, start: int, target_end: int) -> int:
    if target_end >= len(text):
        return len(text)
    search_start = max(start + knowledge_config.min_chunk_size, target_end - 300)
    window = text[search_start:target_end]
    for separator in ("\n\n", ". ", "! ", "? ", "\n", "; ", ", "):
        position = window.rfind(separator)
        if position >= 0:
            return search_start + position + len(separator)
    return target_end
