import tempfile
import unittest
from pathlib import Path

from cronos.core import config
from cronos.core.db import init_db
from cronos.core.errors import CronosError
from cronos.services import auth


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        config.settings.data_dir = Path(self.tempdir.name)
        init_db()

    def tearDown(self):
        self.tempdir.cleanup()

    def test_owner_setup_login_and_lock(self):
        created = auth.create_owner("Alexandre", "senha-segura", "1234")
        self.assertIn("token", created)

        session = auth.get_session(created["token"])
        self.assertEqual(session["owner"]["name"], "Alexandre")

        auth.lock_session(created["token"])
        with self.assertRaises(CronosError):
            auth.get_session(created["token"])


if __name__ == "__main__":
    unittest.main()
