from __future__ import annotations

import hashlib
import json
import socket
import subprocess
import time
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from cronos.core.config import settings
from cronos.core.errors import CronosError

LOCAL_LLM_ERROR = "Nenhum modelo de IA local está instalado ou configurado."
PROVIDER_NAME = "cronos-local-llama"
_provider: "LLMProvider | None" = None


class LLMProvider(ABC):
    @abstractmethod
    def get_status(self) -> dict:
        raise NotImplementedError

    @abstractmethod
    def start(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def stop(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def health_check(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    def list_models(self) -> list[dict]:
        raise NotImplementedError

    @abstractmethod
    def load_model(self, model_name: str | None = None) -> None:
        raise NotImplementedError

    @abstractmethod
    def generate(self, messages: list[dict], *, timeout: int = 120) -> str:
        raise NotImplementedError

    @abstractmethod
    def stream(self, messages: list[dict]) -> Any:
        raise NotImplementedError

    @abstractmethod
    def cancel(self, request_id: str | None = None) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_capabilities(self) -> dict:
        raise NotImplementedError


class CronosLocalLlamaProvider(LLMProvider):
    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = base_dir or settings.llm_resource_dir
        self.manifest_path = self.base_dir / "manifest.json"
        self.process: subprocess.Popen | None = None
        self.port: int | None = None
        self.last_error = ""
        self._manifest: dict | None = None

    def get_status(self) -> dict:
        try:
            manifest = self._read_manifest()
            runtime_path, model_path = self._paths(manifest)
            integrity = self._validate_integrity(manifest, runtime_path, model_path)
            loaded = self.process is not None and self.process.poll() is None and self.health_check()
            return {
                "provider": PROVIDER_NAME,
                "status": "ready" if loaded else "not_started",
                "configured": True,
                "loaded": loaded,
                "ready": loaded,
                "runtime": manifest["runtime"],
                "runtimeVersion": manifest["runtimeVersion"],
                "model": manifest["modelName"],
                "modelFile": manifest["modelFile"],
                "modelFormat": manifest["modelFormat"],
                "quantization": manifest["quantization"],
                "contextLength": manifest["contextLength"],
                "multilingual": manifest["multilingual"],
                "port": self.port,
                "pid": self.process.pid if self.process and self.process.poll() is None else None,
                "integrityValidated": integrity,
                "error": self.last_error,
            }
        except CronosError as error:
            return {
                "provider": PROVIDER_NAME,
                "status": "not_installed",
                "configured": False,
                "loaded": False,
                "ready": False,
                "error": error.detail,
            }

    def start(self) -> None:
        if self.process is not None and self.process.poll() is None and self.health_check():
            return
        manifest = self._read_manifest()
        runtime_path, model_path = self._paths(manifest)
        self._validate_integrity(manifest, runtime_path, model_path)
        self.port = self.port or _reserve_port()
        args = [
            str(runtime_path),
            "--host",
            "127.0.0.1",
            "--port",
            str(self.port),
            "--model",
            str(model_path),
            "--ctx-size",
            str(manifest["contextLength"]),
        ]
        self.process = subprocess.Popen(
            args,
            cwd=str(self.base_dir),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            shell=False,
        )
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise CronosError(503, "Runtime do modelo finalizou antes de ficar pronto.", code="LLM_RUNTIME_EXITED")
            if self.health_check():
                self.last_error = ""
                return
            time.sleep(0.25)
        self.stop()
        raise CronosError(503, "Modelo ainda esta carregando ou nao respondeu dentro do tempo esperado.", code="LLM_START_TIMEOUT")

    def stop(self) -> None:
        process = self.process
        self.process = None
        if process is None or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

    def health_check(self) -> bool:
        if not self.port:
            return False
        try:
            _json_request(f"http://127.0.0.1:{self.port}/health", timeout=2)
            return True
        except Exception:
            try:
                _json_request(f"http://127.0.0.1:{self.port}/v1/models", timeout=2)
                return True
            except Exception:
                return False

    def list_models(self) -> list[dict]:
        manifest = self._read_manifest()
        return [{"id": manifest["modelName"], "object": "model"}]

    def load_model(self, model_name: str | None = None) -> None:
        self.start()

    def generate(self, messages: list[dict], *, timeout: int = 120) -> str:
        self.start()
        payload = {
            "model": self._read_manifest()["modelName"],
            "messages": messages,
            "temperature": 0.2,
            "stream": False,
        }
        try:
            response = _json_request(f"http://127.0.0.1:{self.port}/v1/chat/completions", payload, timeout=timeout)
            content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
        except Exception as error:
            self.last_error = str(error)[:180]
            raise CronosError(503, "Falha ao gerar resposta.", code="LLM_GENERATION_FAILED", details={"provider": PROVIDER_NAME}) from error
        clean = str(content).strip()
        if not clean:
            raise CronosError(503, "Falha ao gerar resposta.", code="LLM_EMPTY_RESPONSE")
        return clean

    def stream(self, messages: list[dict]) -> Any:
        raise CronosError(501, "Streaming do modelo local ainda nao esta habilitado.", code="LLM_STREAM_NOT_READY")

    def cancel(self, request_id: str | None = None) -> None:
        self.stop()

    def get_capabilities(self) -> dict:
        return {
            "chat": True,
            "stream": False,
            "cancel": True,
            "local": True,
            "offline": True,
            "network": "127.0.0.1",
        }

    def _read_manifest(self) -> dict:
        if not self.manifest_path.exists():
            raise CronosError(503, LOCAL_LLM_ERROR, code="LLM_MODEL_NOT_INSTALLED")
        try:
            manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except Exception as error:
            raise CronosError(503, "Manifest do modelo local invalido.", code="LLM_MANIFEST_INVALID") from error
        _validate_manifest(manifest)
        self._manifest = manifest
        return manifest

    def _paths(self, manifest: dict) -> tuple[Path, Path]:
        runtime_path = self.base_dir / manifest["runtimeFile"]
        model_path = self.base_dir / manifest["modelFile"]
        _ensure_inside(self.base_dir, runtime_path)
        _ensure_inside(self.base_dir, model_path)
        return runtime_path, model_path

    def _validate_integrity(self, manifest: dict, runtime_path: Path, model_path: Path) -> bool:
        if not runtime_path.is_file():
            raise CronosError(503, "Runtime do modelo nao encontrado.", code="LLM_RUNTIME_MISSING")
        if not model_path.is_file():
            raise CronosError(503, LOCAL_LLM_ERROR, code="LLM_MODEL_NOT_INSTALLED")
        if runtime_path.stat().st_size != int(manifest["runtimeSize"]):
            raise CronosError(503, "Integridade do runtime do modelo invalida.", code="LLM_RUNTIME_SIZE_INVALID")
        if model_path.stat().st_size != int(manifest["modelSize"]):
            raise CronosError(503, "Integridade do modelo invalida.", code="LLM_MODEL_SIZE_INVALID")
        if _is_lfs_pointer(model_path):
            raise CronosError(503, "Modelo local e um ponteiro Git LFS, nao o arquivo real.", code="LLM_MODEL_LFS_POINTER")
        if _sha256(runtime_path) != str(manifest["runtimeSha256"]).lower():
            raise CronosError(503, "Integridade do runtime do modelo invalida.", code="LLM_RUNTIME_HASH_INVALID")
        if _sha256(model_path) != str(manifest["modelSha256"]).lower():
            raise CronosError(503, "Integridade do modelo invalida.", code="LLM_MODEL_HASH_INVALID")
        return True


def get_provider() -> LLMProvider:
    global _provider
    if _provider is None:
        _provider = CronosLocalLlamaProvider()
    return _provider


def set_provider_for_tests(provider: LLMProvider | None) -> None:
    global _provider
    _provider = provider


def status() -> dict:
    return get_provider().get_status()


def generate(messages: list[dict]) -> str:
    provider = get_provider()
    if not provider.get_status().get("configured"):
        raise CronosError(503, LOCAL_LLM_ERROR, code="LLM_MODEL_NOT_INSTALLED")
    return provider.generate(messages)


def stop() -> None:
    if _provider is not None:
        _provider.stop()


def _validate_manifest(manifest: dict) -> None:
    required = [
        "provider",
        "runtime",
        "runtimeVersion",
        "runtimeFile",
        "runtimeSha256",
        "runtimeSize",
        "modelName",
        "modelFile",
        "modelSha256",
        "modelSize",
        "modelFormat",
        "quantization",
        "contextLength",
        "architecture",
        "multilingual",
        "license",
        "officialSource",
        "integrityValidated",
    ]
    missing = [field for field in required if field not in manifest]
    if missing:
        raise CronosError(503, "Manifest do modelo local incompleto.", code="LLM_MANIFEST_INCOMPLETE", details={"missing": missing})
    if manifest["provider"] != PROVIDER_NAME:
        raise CronosError(503, "Provider de LLM local inesperado.", code="LLM_PROVIDER_INVALID")
    if str(manifest["runtime"]).lower() != "llama.cpp":
        raise CronosError(503, "Runtime de LLM local inesperado.", code="LLM_RUNTIME_INVALID")
    if manifest["runtimeFile"] != "bin/llama-server.exe":
        raise CronosError(503, "Manifest do LLM aponta para runtime inesperado.", code="LLM_RUNTIME_PATH_INVALID")
    if _path_is_absolute_or_personal(str(manifest["runtimeFile"])) or _path_is_absolute_or_personal(str(manifest["modelFile"])):
        raise CronosError(503, "Manifest do LLM nao pode usar caminhos absolutos ou pessoais.", code="LLM_PERSONAL_PATH")
    if not str(manifest["modelFile"]).startswith("models/") or not str(manifest["modelFile"]).endswith(".gguf"):
        raise CronosError(503, "Manifest do LLM deve apontar para modelo GGUF local.", code="LLM_MODEL_PATH_INVALID")
    if not _is_sha256(manifest["runtimeSha256"]) or not _is_sha256(manifest["modelSha256"]):
        raise CronosError(503, "Manifest do LLM deve possuir SHA-256 reais de 64 caracteres.", code="LLM_HASH_INVALID")
    if int(manifest["runtimeSize"]) <= 0 or int(manifest["modelSize"]) <= 0:
        raise CronosError(503, "Manifest do LLM deve registrar tamanhos reais.", code="LLM_SIZE_INVALID")
    if str(manifest["modelFormat"]).upper() != "GGUF":
        raise CronosError(503, "Modelo local deve estar no formato GGUF.", code="LLM_MODEL_FORMAT_INVALID")
    if manifest["multilingual"] is not True:
        raise CronosError(503, "Modelo local deve ser multilingue para uso em portugues.", code="LLM_MODEL_LANGUAGE_INVALID")
    if manifest["integrityValidated"] is not True:
        raise CronosError(503, "Integridade do modelo local ainda nao foi validada.", code="LLM_INTEGRITY_NOT_VALIDATED")
    if _path_is_absolute_or_personal(str(manifest["officialSource"])):
        raise CronosError(503, "Manifest do LLM nao pode registrar caminho pessoal como origem oficial.", code="LLM_PERSONAL_SOURCE")


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
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _is_sha256(value: object) -> bool:
    text = str(value or "")
    return len(text) == 64 and all(char in "0123456789abcdefABCDEF" for char in text)


def _is_lfs_pointer(path: Path) -> bool:
    with path.open("rb") as handle:
        prefix = handle.read(128)
    return prefix.startswith(b"version https://git-lfs.github.com/spec/v1")


def _path_is_absolute_or_personal(value: str) -> bool:
    lower = value.lower()
    return Path(value).is_absolute() or lower.startswith("\\\\") or ":\\" in lower or "\\users\\" in lower


def _ensure_inside(base: Path, child: Path) -> None:
    base_resolved = base.resolve()
    child_parent = child.parent.resolve()
    if not child_parent.is_relative_to(base_resolved):
        raise CronosError(503, "Caminho do modelo local fora do diretorio permitido.", code="LLM_PATH_ESCAPE")
