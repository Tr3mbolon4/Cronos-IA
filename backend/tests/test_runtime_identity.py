import json
import tempfile
import unittest
from pathlib import Path

from cronos.core import config
from cronos.services import diagnostics, llm_provider


class RuntimeIdentityTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.resource_dir = Path(self.tempdir.name) / "resources"
        self.resource_dir.mkdir()
        self.old_resource_dir = config.settings.resource_dir
        self.old_data_dir = config.settings.data_dir
        self.old_env = config.settings.env
        self.old_build_id = config.settings.build_id
        self.old_git_commit = config.settings.git_commit
        self.old_protocol_version = config.settings.protocol_version
        config.settings.resource_dir = self.resource_dir
        config.settings.data_dir = Path(self.tempdir.name) / "data"
        config.settings.env = "desktop"
        config.settings.build_id = "v0.3.0-abc1234-test"
        config.settings.git_commit = "abc1234"
        config.settings.protocol_version = "1"
        llm_provider.set_provider_for_tests(None)

    def tearDown(self):
        llm_provider.set_provider_for_tests(None)
        config.settings.resource_dir = self.old_resource_dir
        config.settings.data_dir = self.old_data_dir
        config.settings.env = self.old_env
        config.settings.build_id = self.old_build_id
        config.settings.git_commit = self.old_git_commit
        config.settings.protocol_version = self.old_protocol_version
        self.tempdir.cleanup()

    def test_runtime_identity_reports_build_and_disables_fallback(self):
        (self.resource_dir / "build-info.json").write_text(
            json.dumps(
                {
                    "version": "v0.3.0",
                    "gitCommit": "abc1234",
                    "buildTimestamp": "2026-07-22T00:00:00Z",
                    "buildId": "v0.3.0-abc1234-test",
                    "protocolVersion": "1",
                }
            ),
            encoding="utf-8",
        )

        identity = diagnostics.runtime_identity()

        self.assertEqual(identity["appVersion"], "v0.3.0")
        self.assertEqual(identity["gitCommit"], "abc1234")
        self.assertEqual(identity["runtimeGitCommit"], "abc1234")
        self.assertEqual(identity["buildId"], "v0.3.0-abc1234-test")
        self.assertEqual(identity["runtimeBuildId"], "v0.3.0-abc1234-test")
        self.assertEqual(identity["protocolVersion"], "1")
        self.assertEqual(identity["runtimeProtocolVersion"], "1")
        self.assertFalse(identity["fallbackEnabled"])
        self.assertIn("backendExecutable", identity)


if __name__ == "__main__":
    unittest.main()
