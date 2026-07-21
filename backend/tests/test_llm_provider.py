import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from cronos.core.errors import CronosError
from cronos.services.llm_provider import CronosLocalLlamaProvider


class LocalLLMProviderTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.base = Path(self.tempdir.name)
        (self.base / "bin").mkdir()
        (self.base / "models").mkdir()
        self.runtime = self.base / "bin" / "llama-server.exe"
        self.model = self.base / "models" / "cronos-test.Q4_K_M.gguf"
        self.runtime.write_bytes(b"runtime")
        self.model.write_bytes(b"GGUF test model")

    def tearDown(self):
        self.tempdir.cleanup()

    def test_accepts_valid_manifest_and_integrity(self):
        self._write_manifest()
        status = CronosLocalLlamaProvider(self.base).get_status()
        self.assertTrue(status["configured"])
        self.assertEqual(status["provider"], "cronos-local-llama")
        self.assertEqual(status["model"], "cronos-test.Q4_K_M.gguf")

    def test_rejects_placeholder_sha(self):
        self._write_manifest(modelSha256="TO_BE_FILLED_BY_PREPARE_SCRIPT")
        status = CronosLocalLlamaProvider(self.base).get_status()
        self.assertFalse(status["configured"])
        self.assertIn("SHA-256", status["error"])

    def test_rejects_absolute_personal_model_path(self):
        self._write_manifest(modelFile="C:\\Users\\alexandre_santos\\Downloads\\model.gguf")
        status = CronosLocalLlamaProvider(self.base).get_status()
        self.assertFalse(status["configured"])
        self.assertIn("caminhos absolutos", status["error"])

    def test_generation_reports_missing_model(self):
        provider = CronosLocalLlamaProvider(self.base / "missing")
        with self.assertRaises(CronosError) as context:
            provider.generate([{"role": "user", "content": "Ola"}])
        self.assertEqual(context.exception.detail, "Nenhum modelo de IA local está instalado ou configurado.")

    def _write_manifest(self, **overrides):
        payload = {
            "provider": "cronos-local-llama",
            "runtime": "llama.cpp",
            "runtimeVersion": "b0000",
            "runtimeFile": "bin/llama-server.exe",
            "runtimeSha256": hashlib.sha256(self.runtime.read_bytes()).hexdigest(),
            "runtimeSize": self.runtime.stat().st_size,
            "modelName": "cronos-test.Q4_K_M.gguf",
            "modelFile": "models/cronos-test.Q4_K_M.gguf",
            "modelSha256": hashlib.sha256(self.model.read_bytes()).hexdigest(),
            "modelSize": self.model.stat().st_size,
            "modelFormat": "GGUF",
            "quantization": "Q4_K_M",
            "contextLength": 4096,
            "architecture": "cpu",
            "multilingual": True,
            "license": "test",
            "officialSource": "https://example.invalid/model",
            "integrityValidated": True,
        }
        payload.update(overrides)
        (self.base / "manifest.json").write_text(json.dumps(payload), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
