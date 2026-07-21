import tempfile
import unittest
from pathlib import Path

from cronos.core import config
from cronos.core.db import init_db
from cronos.core.errors import CronosError
from cronos.services import auth, chat, llm_provider


class FakeLLMProvider(llm_provider.LLMProvider):
    def get_status(self) -> dict:
        return {"configured": True, "ready": True, "provider": "fake-local-llm"}

    def start(self) -> None:
        return None

    def stop(self) -> None:
        return None

    def health_check(self) -> bool:
        return True

    def list_models(self) -> list[dict]:
        return [{"id": "fake.gguf"}]

    def load_model(self, model_name: str | None = None) -> None:
        return None

    def generate(self, messages: list[dict], *, timeout: int = 120) -> str:
        user_message = next(item["content"] for item in reversed(messages) if item["role"] == "user")
        return f"Resposta real do provider local para: {user_message}"

    def stream(self, messages: list[dict]):
        raise NotImplementedError

    def cancel(self, request_id: str | None = None) -> None:
        return None

    def get_capabilities(self) -> dict:
        return {"chat": True}


class ChatTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        config.settings.data_dir = Path(self.tempdir.name)
        config.settings.resource_dir = Path(self.tempdir.name) / "resources"
        init_db()
        auth.create_owner("Alexandre", "senha-segura", "1234")
        llm_provider.set_provider_for_tests(None)

    def tearDown(self):
        llm_provider.set_provider_for_tests(None)
        self.tempdir.cleanup()

    def test_chat_requires_local_llm(self):
        with self.assertRaises(CronosError) as context:
            chat.send_message("Ola Cronos")
        self.assertEqual(context.exception.status_code, 503)
        self.assertEqual(context.exception.detail, "Nenhum modelo de IA local está instalado ou configurado.")
        history = chat.history()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["role"], "user")

    def test_chat_history_is_persisted_with_local_provider(self):
        llm_provider.set_provider_for_tests(FakeLLMProvider())
        response = chat.send_message("Ola Cronos")
        self.assertEqual(response["role"], "assistant")
        self.assertIn("Resposta real do provider local", response["content"])
        self.assertNotIn("Estou rodando localmente no MVP do CRONOS", response["content"])
        history = chat.history()
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["role"], "user")


if __name__ == "__main__":
    unittest.main()
