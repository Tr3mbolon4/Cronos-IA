from dataclasses import dataclass


@dataclass(frozen=True)
class RetrievalConfig:
    provider_name: str = "sentence-transformers"
    model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    fallback_provider_name: str = "lexical-only"
    expected_dimension: int = 384
    top_k: int = 8
    max_top_k: int = 50
    minimum_score: float = 0.01
    lexical_weight: float = 0.55
    semantic_weight: float = 0.35
    recency_weight: float = 0.07
    importance_weight: float = 0.03
    proximity_bonus: float = 0.05
    semantic_batch_size: int = 32


retrieval_config = RetrievalConfig()
