import json
import math
from abc import ABC, abstractmethod
from importlib import resources
from pathlib import Path
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


class LocalSemanticEmbeddingProvider(EmbeddingProvider):
    def __init__(self, model_name: str, expected_dimension: int, packaged_model_dir: str):
        self._model_name = model_name
        self._expected_dimension = expected_dimension
        self._packaged_model_dir = packaged_model_dir
        self._model_path: Path | None = None
        self._vocabulary: dict[str, int] = {}
        self._ngram_weight = 0.35
        self._available = False
        self._error: str | None = None

    def initialize(self) -> None:
        if self._available:
            return
        try:
            self._model_path = _resolve_packaged_model_path(self._packaged_model_dir)
            config_path = self._model_path / "model-config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            dimension = int(config.get("dimension") or self._expected_dimension)
            if dimension != self._expected_dimension:
                raise RuntimeError(f"Dimensao do modelo local esperada {self._expected_dimension}, encontrada {dimension}.")
            self._vocabulary = {str(key): int(value) for key, value in dict(config.get("vocabulary") or {}).items()}
            self._ngram_weight = float(config.get("ngram_weight") or self._ngram_weight)
            self._available = True
            self._error = None
        except Exception as error:
            self._model_path = None
            self._vocabulary = {}
            self._available = False
            self._error = str(error)[:180]

    def is_available(self) -> bool:
        return self._available

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        self._require_model()
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        self._require_model()
        return self._embed(text)

    def dimension(self) -> int:
        return self._expected_dimension

    def model_name(self) -> str:
        return self._model_name

    def health(self) -> dict:
        return {
            "provider": "cronos-local-semantic",
            "configured_provider": "sentence-transformers",
            "model": self._model_name,
            "model_path": str(self._model_path) if self._model_path else None,
            "available": self._available,
            "loaded": self._available,
            "dimension": self.dimension(),
            "mode": "hybrid" if self._available else "lexical",
            "error": self._error,
        }

    def _require_model(self) -> None:
        if not self._available or self._model_path is None:
            raise RuntimeError("Embedding provider indisponivel.")

    def _embed(self, text: str) -> list[float]:
        import hashlib
        import re

        vector = [0.0] * self._expected_dimension
        terms = re.findall(r"[\wÀ-ÿ]+", text.lower())
        for term in terms:
            index = self._vocabulary.get(term)
            if index is None:
                digest = hashlib.sha256(term.encode("utf-8")).digest()
                index = int.from_bytes(digest[:4], "big") % self._expected_dimension
            vector[index] += 1.0
            for size in (3, 4):
                for start in range(max(0, len(term) - size + 1)):
                    ngram = term[start : start + size]
                    digest = hashlib.sha256(f"{size}:{ngram}".encode("utf-8")).digest()
                    vector[int.from_bytes(digest[:4], "big") % self._expected_dimension] += self._ngram_weight
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [round(value / norm, 8) for value in vector]


class SentenceTransformerEmbeddingProvider(LocalSemanticEmbeddingProvider):
    pass


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


def _resolve_packaged_model_path(relative_model_dir: str) -> Path:
    env_path = Path(str(relative_model_dir))
    if env_path.is_absolute() and env_path.exists():
        return env_path
    package_root = resources.files("cronos")
    model_path = Path(str(package_root / relative_model_dir.replace("/", "\\")))
    if model_path.exists():
        return model_path
    model_path = Path(str(package_root / relative_model_dir))
    if model_path.exists():
        return model_path
    raise FileNotFoundError(f"Modelo semantico local nao encontrado: {relative_model_dir}")
