import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from cronos.core.db import init_db
from cronos.core.errors import CronosError
from cronos.services import auth, backup, chat, diagnostics, documents


class CronosHandler(BaseHTTPRequestHandler):
    server_version = "CRONOS/0.1"

    def do_OPTIONS(self) -> None:
        self._send({}, status=204)

    def do_GET(self) -> None:
        try:
            path = urlparse(self.path).path
            if path == "/health":
                self._send({"ok": True, "name": "CRONOS", "version": "0.1.0"})
            elif path == "/setup/status":
                self._send(auth.setup_status())
            elif path == "/auth/session":
                self._send(self._session())
            elif path == "/chat/history":
                self._session()
                self._send(chat.history())
            elif path == "/documents":
                self._session()
                self._send(documents.list_documents())
            elif path == "/diagnostics/hardware":
                self._session()
                self._send(diagnostics.hardware_report())
            else:
                raise CronosError(404, "Rota nao encontrada.")
        except CronosError as error:
            self._error(error)
        except Exception as error:
            self._error(CronosError(500, str(error)))

    def do_POST(self) -> None:
        try:
            path = urlparse(self.path).path
            if path == "/setup/owner":
                payload = self._json_body()
                self._send(auth.create_owner(payload.get("name", ""), payload.get("password", ""), payload.get("pin", "")))
            elif path == "/auth/login":
                payload = self._json_body()
                self._send(auth.login(payload.get("password", ""), payload.get("pin", "")))
            elif path == "/auth/lock":
                session = self._session()
                self._send(auth.lock_session(session["token"]))
            elif path == "/chat":
                self._session()
                payload = self._json_body()
                self._send(chat.send_message(payload.get("message", "")))
            elif path == "/documents/upload":
                self._session()
                filename, content = self._multipart_file()
                self._send(documents.save_pdf(filename, content))
            elif match := re.fullmatch(r"/documents/(\d+)/ask", path):
                self._session()
                payload = self._json_body()
                self._send(documents.ask_document(int(match.group(1)), payload.get("question", "")))
            elif path == "/backup":
                self._session()
                self._send(backup.create_backup())
            elif path == "/restore":
                self._session()
                filename, content = self._multipart_file()
                self._send(backup.restore_backup(filename, content))
            else:
                raise CronosError(404, "Rota nao encontrada.")
        except CronosError as error:
            self._error(error)
        except Exception as error:
            self._error(CronosError(500, str(error)))

    def _json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _multipart_file(self) -> tuple[str, bytes]:
        content_type = self.headers.get("Content-Type", "")
        boundary_match = re.search(r"boundary=([^;]+)", content_type)
        if not boundary_match:
            raise CronosError(400, "Formulario multipart invalido.")
        boundary = ("--" + boundary_match.group(1)).encode("utf-8")
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        for part in body.split(boundary):
            if b"Content-Disposition" not in part or b"filename=" not in part:
                continue
            header, _, content = part.partition(b"\r\n\r\n")
            disposition = header.decode("utf-8", errors="ignore")
            filename_match = re.search(r'filename="([^"]+)"', disposition)
            filename = filename_match.group(1) if filename_match else "upload.bin"
            return filename, content.rstrip(b"\r\n-")
        raise CronosError(400, "Arquivo nao encontrado no envio.")

    def _session(self) -> dict:
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            raise CronosError(401, "Sessao obrigatoria.")
        return auth.get_session(authorization.removeprefix("Bearer ").strip())

    def _send(self, payload: object, status: int = 200) -> None:
        raw = b"" if status == 204 else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if raw:
            self.wfile.write(raw)

    def _error(self, error: CronosError) -> None:
        self._send({"detail": error.detail}, status=error.status_code)

    def _cors(self) -> None:
        origin = self.headers.get("Origin", "http://127.0.0.1:5173")
        allowed = os.environ.get("CRONOS_ALLOWED_ORIGINS", "http://127.0.0.1:5173").split(",")
        self.send_header("Access-Control-Allow-Origin", origin if origin in allowed else allowed[0])
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


def main() -> None:
    init_db()
    host = os.environ.get("CRONOS_HOST", "127.0.0.1")
    port = int(os.environ.get("CRONOS_PORT", "8000"))
    server = ThreadingHTTPServer((host, port), CronosHandler)
    print(f"CRONOS API rodando em http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
