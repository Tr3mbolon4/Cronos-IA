import unittest

from cronos.server import allowed_cors_origin


class ServerCorsTests(unittest.TestCase):
    def test_allows_tauri_desktop_origins(self):
        self.assertEqual(allowed_cors_origin("tauri://localhost"), "tauri://localhost")
        self.assertEqual(allowed_cors_origin("http://tauri.localhost"), "http://tauri.localhost")
        self.assertEqual(allowed_cors_origin("https://tauri.localhost"), "https://tauri.localhost")

    def test_allows_local_development_origins(self):
        self.assertEqual(allowed_cors_origin("http://127.0.0.1:5173"), "http://127.0.0.1:5173")
        self.assertEqual(allowed_cors_origin("http://localhost:5173"), "http://localhost:5173")

    def test_falls_back_for_external_origins(self):
        self.assertEqual(allowed_cors_origin("https://example.com"), "http://127.0.0.1:5173")


if __name__ == "__main__":
    unittest.main()
