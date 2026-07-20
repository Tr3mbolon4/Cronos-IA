import tempfile
import unittest
from pathlib import Path

from cronos.core import config
from cronos.core.db import init_db
from cronos.services import auth, chat


class ChatTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        config.settings.data_dir = Path(self.tempdir.name)
        init_db()
        auth.create_owner("Alexandre", "senha-segura", "1234")

    def tearDown(self):
        self.tempdir.cleanup()

    def test_chat_history_is_persisted(self):
        response = chat.send_message("Ola Cronos")
        self.assertEqual(response["role"], "assistant")
        history = chat.history()
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["role"], "user")


if __name__ == "__main__":
    unittest.main()
