from datetime import datetime, timezone

from cronos.core.retrieval_config import retrieval_config


def rerank(items: list[dict]) -> list[dict]:
    ranked: list[dict] = []
    for item in items:
        lexical = float(item.get("score_lexical") or 0.0)
        semantic = float(item.get("score_semantic") or 0.0)
        proximity = float(item.get("proximity") or 0.0)
        recency = _recency_score(item["chunk"].get("updated_at") or item["chunk"].get("created_at"))
        importance = float(item.get("importance") or 0.0)
        score_final = (
            lexical * retrieval_config.lexical_weight
            + semantic * retrieval_config.semantic_weight
            + proximity * retrieval_config.proximity_bonus
            + recency * retrieval_config.recency_weight
            + importance * retrieval_config.importance_weight
        )
        ranked.append({**item, "score_final": round(score_final, 6), "score_recency": recency})
    ranked.sort(key=lambda value: value["score_final"], reverse=True)
    return ranked


def _recency_score(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        created = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        days = max((datetime.now(timezone.utc) - created.astimezone(timezone.utc)).days, 0)
        return max(0.0, min(1.0, 1.0 - days / 365.0))
    except Exception:
        return 0.0
