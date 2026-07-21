from abc import ABC, abstractmethod
from typing import Sequence


class EmbeddingProvider(ABC):
    @abstractmethod
    def initialize(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def is_available(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        raise NotImplementedError

    @abstractmethod
    def embed_query(self, text: str) -> list[float]:
        raise NotImplementedError

    @abstractmethod
    def dimension(self) -> int:
        raise NotImplementedError

    @abstractmethod
    def model_name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def health(self) -> dict:
        raise NotImplementedError


class SentenceTransformerEmbeddingProvider(EmbeddingProvider):
    def __init__(self, model_name: str, expected_dimension: int):
        self._model_name = model_name
        self._expected_dimension = expected_dimension
        self._model = None
        self._available = False
        self._error: str | None = None

    def initialize(self) -> None:
        if self._available:
            return
        try:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self._model_name)
            self._available = True
            self._error = None
        except Exception as error:
            self._model = None
            self._available = False
            self._error = str(error)[:180]

    def is_available(self) -> bool:
        return self._available

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        self._require_model()
        vectors = self._model.encode(list(texts), normalize_embeddings=True)
        return [_to_float_list(vector) for vector in vectors]

    def embed_query(self, text: str) -> list[float]:
        self._require_model()
        vector = self._model.encode([text], normalize_embeddings=True)[0]
        return _to_float_list(vector)

    def dimension(self) -> int:
        if not self._available:
            return self._expected_dimension
        try:
            return int(self._model.get_sentence_embedding_dimension())
        except Exception:
            return self._expected_dimension

    def model_name(self) -> str:
        return self._model_name

    def health(self) -> dict:
        return {
            "provider": "sentence-transformers",
            "model": self._model_name,
            "available": self._available,
            "dimension": self.dimension(),
            "error": self._error,
        }

    def _require_model(self) -> None:
        if not self._available or self._model is None:
            raise RuntimeError("Embedding provider indisponivel.")


class DeterministicEmbeddingProvider(EmbeddingProvider):
    def __init__(self, model_name: str = "deterministic-test", dimension: int = 16, available: bool = True):
        self._model_name = model_name
        self._dimension = dimension
        self._available = available

    def initialize(self) -> None:
        return

    def is_available(self) -> bool:
        return self._available

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)

    def dimension(self) -> int:
        return self._dimension

    def model_name(self) -> str:
        return self._model_name

    def health(self) -> dict:
        return {"provider": "deterministic", "model": self._model_name, "available": self._available, "dimension": self._dimension}

    def _embed(self, text: str) -> list[float]:
        import hashlib

        vector = [0.0] * self._dimension
        for word in text.lower().split():
            digest = hashlib.sha256(word.encode("utf-8")).digest()
            index = digest[0] % self._dimension
            vector[index] += 1.0
        norm = sum(value * value for value in vector) ** 0.5 or 1.0
        return [round(value / norm, 8) for value in vector]


def _to_float_list(vector: object) -> list[float]:
    if hasattr(vector, "tolist"):
        vector = vector.tolist()
    return [float(value) for value in vector]
