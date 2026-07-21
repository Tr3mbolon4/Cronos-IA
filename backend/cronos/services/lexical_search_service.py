from cronos.models.document import normalize_document_text


def search(chunks: list[dict], query: str) -> list[dict]:
    terms = [term for term in normalize_document_text(query).split() if len(term) > 2]
    if not terms:
        return []
    results: list[dict] = []
    for chunk in chunks:
        normalized = chunk["normalized_text"]
        hits = sum(normalized.count(term) for term in terms)
        if hits <= 0:
            continue
        coverage = sum(1 for term in terms if term in normalized) / len(terms)
        score = min(1.0, (hits / len(terms)) * 0.7 + coverage * 0.3)
        proximity = _proximity(normalized, terms)
        results.append({"chunk": chunk, "score_lexical": score, "proximity": proximity})
    return results


def _proximity(text: str, terms: list[str]) -> float:
    positions = [text.find(term) for term in terms if text.find(term) >= 0]
    if len(positions) < 2:
        return 0.0
    spread = max(positions) - min(positions)
    return max(0.0, min(1.0, 1.0 - spread / max(len(text), 1)))
