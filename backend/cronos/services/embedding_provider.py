import json
import math
import socket
import subprocess
import time
import urllib.request
from abc import ABC, abstractmethod
from importlib import resources
from pathlib import Path
from typing import Sequence

from cronos.core.config import settings


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


class LlamaCppEmbeddingProvider(EmbeddingProvider):
    def __init__(self, expected_dimension: int):
        self._expected_dimension = expected_dimension
        self._base_dir = settings.embedding_resource_dir
        self._llm_dir = settings.llm_resource_dir
        self._manifest_path = self._base_dir / "manifest.json"
        self._manifest: dict | None = None
        self._process: subprocess.Popen | None = None
        self._port: int | None = None
        self._available = False
        self._error: str | None = None

    def initialize(self) -> None:
        try:
            manifest = self._read_manifest()
            runtime_path = self._llm_dir / "bin" / "llama-server.exe"
            model_path = self._model_path(manifest)
            if not runtime_path.is_file():
                raise RuntimeError("Runtime llama-server.exe nao encontrado para embeddings.")
            if not model_path.is_file():
                raise RuntimeError("Modelo real de embeddings nao encontrado.")
            if int(manifest["dimension"]) != self._expected_dimension:
                raise RuntimeError(f"Dimensao de embeddings esperada {self._expected_dimension}, encontrada {manifest['dimension']}.")
            if _sha256(model_path) != str(manifest["modelSha256"]).lower():
                raise RuntimeError("SHA-256 do modelo de embeddings divergente.")
            self._available = True
            self._error = None
        except Exception as error:
            self._available = False
            self._error = str(error)[:180]

    def is_available(self) -> bool:
        return self._available

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return self._embed(list(texts))

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text])[0]

    def dimension(self) -> int:
        return self._expected_dimension

    def model_name(self) -> str:
        manifest = self._manifest or {}
        return str(manifest.get("modelName") or "unconfigured-local-embedding-model")

    def health(self) -> dict:
        manifest = self._manifest or {}
        return {
            "provider": "cronos-local-llama-embedding",
            "configured_provider": "llama.cpp",
            "model": self.model_name(),
            "model_path": str(self._model_path(manifest)) if manifest else None,
            "available": self._available,
            "loaded": self._process is not None and self._process.poll() is None,
            "dimension": self.dimension(),
            "native_dimension": manifest.get("nativeDimensions") or manifest.get("nativeDimension"),
            "index_dimension": manifest.get("indexDimensions") or manifest.get("dimension"),
            "projection": manifest.get("projection"),
            "reductionMethod": manifest.get("reductionMethod"),
            "normalized": manifest.get("normalized"),
            "experimentalReduction": manifest.get("experimentalReduction"),
            "mode": "hybrid" if self._available else "lexical",
            "error": self._error,
            "license": manifest.get("license"),
            "multilingual": manifest.get("multilingual"),
            "runtime": "llama.cpp",
        }

    def stop(self) -> None:
        process = self._process
        self._process = None
        if process is None or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

    def _embed(self, texts: list[str]) -> list[list[float]]:
        if not self._available:
            raise RuntimeError(self._error or "Embedding provider indisponivel.")
        self._start()
        payload = {"model": self.model_name(), "input": texts}
        response = _json_request(f"http://127.0.0.1:{self._port}/v1/embeddings", payload, timeout=120)
        vectors = [item["embedding"] for item in sorted(response.get("data", []), key=lambda item: item.get("index", 0))]
        if len(vectors) != len(texts):
            raise RuntimeError("Provider de embeddings retornou quantidade inesperada de vetores.")
        return [self._to_persisted_dimension(vector) for vector in vectors]

    def _start(self) -> None:
        if self._process is not None and self._process.poll() is None:
            return
        manifest = self._read_manifest()
        runtime_path = self._llm_dir / "bin" / "llama-server.exe"
        model_path = self._model_path(manifest)
        self._port = _reserve_port()
        args = [
            str(runtime_path),
            "--host",
            "127.0.0.1",
            "--port",
            str(self._port),
            "--model",
            str(model_path),
            "--embedding",
            "--pooling",
            str(manifest.get("pooling") or "mean"),
            "--ctx-size",
            "512",
            "--ubatch-size",
            "512",
            "--no-webui",
        ]
        self._process = subprocess.Popen(args, cwd=str(self._llm_dir), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=False)
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if self._process.poll() is not None:
                raise RuntimeError("Runtime de embeddings finalizou antes de ficar pronto.")
            try:
                _json_request(f"http://127.0.0.1:{self._port}/v1/models", timeout=2)
                return
            except Exception:
                time.sleep(0.25)
        self.stop()
        raise RuntimeError("Runtime de embeddings nao respondeu dentro do tempo esperado.")

    def _read_manifest(self) -> dict:
        try:
            manifest = json.loads(self._manifest_path.read_text(encoding="utf-8-sig"))
        except Exception as error:
            raise RuntimeError("Manifest de embeddings invalido ou ausente.") from error
        required = ["provider", "modelName", "modelFile", "modelSha256", "modelSize", "dimension", "license", "officialSource", "multilingual", "integrityValidated"]
        missing = [field for field in required if field not in manifest]
        if missing:
            raise RuntimeError(f"Manifest de embeddings incompleto: {missing}.")
        if manifest["provider"] != "cronos-local-llama-embedding":
            raise RuntimeError("Provider de embeddings inesperado.")
        if not str(manifest["modelFile"]).endswith(".gguf"):
            raise RuntimeError("Manifest de embeddings deve apontar para GGUF local.")
        if int(manifest["modelSize"]) <= 0 or manifest["integrityValidated"] is not True:
            raise RuntimeError("Modelo de embeddings ainda nao foi validado.")
        if manifest["multilingual"] is not True:
            raise RuntimeError("Modelo de embeddings deve ser multilingue.")
        self._manifest = manifest
        return manifest

    def _model_path(self, manifest: dict) -> Path:
        model_file = Path(str(manifest["modelFile"]).replace("/", "\\"))
        if model_file.is_absolute():
            raise RuntimeError("Manifest de embeddings nao pode usar caminho absoluto.")
        path = (self._base_dir / model_file).resolve()
        resource_root = settings.resource_dir.resolve()
        if resource_root not in path.parents:
            raise RuntimeError("Manifest de embeddings aponta para fora dos recursos locais.")
        return path

    def _to_persisted_dimension(self, vector: Sequence[float]) -> list[float]:
        native_dimension = len(vector)
        if native_dimension == self._expected_dimension:
            projected = [float(value) for value in vector]
        elif native_dimension > self._expected_dimension:
            ratio = native_dimension / self._expected_dimension
            projected = []
            for index in range(self._expected_dimension):
                start = int(index * ratio)
                end = max(start + 1, int((index + 1) * ratio))
                bucket = vector[start:end]
                projected.append(sum(float(value) for value in bucket) / len(bucket))
        else:
            raise RuntimeError(f"Embedding nativo com dimensao insuficiente: {native_dimension}.")
        norm = math.sqrt(sum(value * value for value in projected)) or 1.0
        return [round(value / norm, 8) for value in projected]


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


def _json_request(url: str, payload: dict | None = None, *, timeout: int = 30) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def _reserve_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _sha256(path: Path) -> str:
    import hashlib

    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


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
