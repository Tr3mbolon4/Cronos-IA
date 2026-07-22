import tempfile
import unittest
from pathlib import Path

from cronos.core import config
from cronos.core.db import init_db
from cronos.core.errors import CronosError
from cronos.services import auth, chat, llm_provider


class FakeLLMProvider(llm_provider.LLMProvider):
    def __init__(self) -> None:
        self.messages: list[dict] = []

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
        self.messages = messages
        user_message = next(item["content"] for item in reversed(messages) if item["role"] == "user")
        return f"Resposta real do provider local para: {user_message}"

    def stream(self, messages: list[dict]):
        raise NotImplementedError

    def cancel(self, request_id: str | None = None) -> None:
        return None

    def get_capabilities(self) -> dict:
        return {"chat": True}


class LegacyFallbackLLMProvider(FakeLLMProvider):
    def generate(self, messages: list[dict], *, timeout: int = 120) -> str:
        self.messages = messages
        return (
            "Estou rodando localmente no MVP do CRONOS. Ainda nao tenho um modelo de IA completo conectado, "
            "mas ja consigo manter historico, ler PDFs enviados e responder usando os dados locais. Recebi: Ola"
        )


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
        self.assertEqual(context.exception.detail, llm_provider.LOCAL_LLM_ERROR)
        self.assertEqual(context.exception.code, "LLM_MODEL_NOT_AVAILABLE")
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

    def test_legacy_mvp_fallback_history_is_not_sent_to_llm_prompt(self):
        chat._save_message("user", "ola", conversation_id="principal")
        chat._save_message(
            "assistant",
            "Estou rodando localmente no MVP do CRONOS. Ainda nao tenho um modelo de IA completo conectado. Recebi: ola",
            conversation_id="principal",
        )
        provider = FakeLLMProvider()
        llm_provider.set_provider_for_tests(provider)

        chat.send_message("Ola qual seu nome?")

        prompt_text = "\n".join(item["content"] for item in provider.messages)
        self.assertNotIn("Estou rodando localmente no MVP do CRONOS", prompt_text)
        self.assertIn("resposta(s) legada(s) de fallback MVP foram omitidas", prompt_text)

    def test_legacy_mvp_fallback_response_is_blocked(self):
        llm_provider.set_provider_for_tests(LegacyFallbackLLMProvider())

        with self.assertRaises(CronosError) as context:
            chat.send_message("Ola qual seu nome?")

        self.assertEqual(context.exception.status_code, 503)
        self.assertEqual(context.exception.code, "LLM_LEGACY_FALLBACK_BLOCKED")
        history = chat.history()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["role"], "user")

    def test_general_chat_route_does_not_use_document_context(self):
        provider = FakeLLMProvider()
        llm_provider.set_provider_for_tests(provider)

        response = chat.send_message("Ola, qual seu nome?", conversation_id="conversa-b")

        self.assertEqual(response["route"], chat.GENERAL_CHAT)
        self.assertEqual(response["diagnostics"]["retrievedChunkCount"], 0)
        self.assertFalse(response["diagnostics"]["usedDocuments"])
        prompt_text = "\n".join(item["content"] for item in provider.messages)
        self.assertIn("Seu nome e CRONOS", prompt_text)
        self.assertNotIn("Contexto documental recuperado", prompt_text)

    def test_new_conversation_is_not_contaminated_by_previous_messages(self):
        provider = FakeLLMProvider()
        llm_provider.set_provider_for_tests(provider)
        chat.send_message("Como abrir o disco C?", conversation_id="conversa-a")

        response = chat.send_message("Ola, qual seu nome?", conversation_id="conversa-b")

        self.assertEqual(response["route"], chat.GENERAL_CHAT)
        prompt_text = "\n".join(item["content"] for item in provider.messages)
        self.assertNotIn("disco C", prompt_text)
        history_a = chat.history(conversation_id="conversa-a")
        history_b = chat.history(conversation_id="conversa-b")
        self.assertEqual(len(history_a), 2)
        self.assertEqual(len(history_b), 2)

    def test_document_question_uses_document_route(self):
        provider = FakeLLMProvider()
        llm_provider.set_provider_for_tests(provider)

        response = chat.send_message("No documento enviado, qual e o codigo de validacao?", conversation_id="doc-qa")

        self.assertEqual(response["route"], chat.DOCUMENT_QA)

    def test_current_conversation_memory_query_stays_local(self):
        provider = FakeLLMProvider()
        llm_provider.set_provider_for_tests(provider)
        chat.send_message("O codigo e CRONOS-123", conversation_id="memoria-local")

        response = chat.send_message("Qual foi o codigo que falei nesta conversa?", conversation_id="memoria-local")

        self.assertEqual(response["route"], chat.MEMORY_QUERY)
        prompt_text = "\n".join(item["content"] for item in provider.messages)
        self.assertIn("CRONOS-123", prompt_text)


if __name__ == "__main__":
    unittest.main()
