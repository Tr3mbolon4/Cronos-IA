import argparse
import hmac
import json
import os
import re
import sys
import threading
import time
import traceback
import uuid
from collections.abc import Mapping
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from cronos.core.config import settings
from cronos.core.db import init_db
from cronos.core.errors import CronosError
from cronos.api import document_routes, library_routes, memory_routes
from cronos.services import auth, backup, chat, diagnostics, documents, embedding_service, llm_provider


STARTED_AT = time.monotonic()
RUNTIME_TOKEN = ""
SHUTTING_DOWN = False

DEFAULT_ALLOWED_ORIGINS = {
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
}


def _runtime_event(event: str, **payload: object) -> None:
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)


class CronosHandler(BaseHTTPRequestHandler):
    server_version = "CRONOS/0.1"

    def do_OPTIONS(self) -> None:
        self._begin_http_trace()
        self._send({}, status=204)

    def do_GET(self) -> None:
        self._begin_http_trace()
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            if path == "/health":
                self._send(
                    {
                        "status": "ok" if not SHUTTING_DOWN else "stopping",
                        "service": "cronos-backend",
                        "version": settings.version,
                        "environment": settings.env,
                        "uptime": round(time.monotonic() - STARTED_AT, 3),
                        "readiness": "ready" if not SHUTTING_DOWN else "stopping",
                        "database": "ready" if settings.db_path.exists() else "missing",
                        "runtime": "ready" if settings.session_id else "missing",
                    }
                )
            elif path == "/runtime/status":
                self._require_runtime_token()
                self._send(
                    {
                        "session_id": settings.session_id,
                        "readiness": "ready" if not SHUTTING_DOWN else "stopping",
                        "version": settings.version,
                        "active_tasks": [],
                        "database": {"ready": settings.db_path.exists()},
                        "directories": {
                            "data": settings.data_dir.exists(),
                            "documents": settings.documents_dir.exists(),
                            "backups": settings.backups_dir.exists(),
                            "logs": settings.log_dir.exists(),
                        },
                    }
                )
            elif path == "/runtime/identity":
                self._require_runtime_token()
                self._send(diagnostics.runtime_identity())
            elif path == "/llm/status":
                self._session()
                self._send(llm_provider.status())
            elif path == "/setup/status":
                self._send(auth.setup_status())
            elif path == "/auth/session":
                self._send(self._session())
            elif path == "/chat/history":
                session = self._session()
                self._send(chat.history(owner_id=int(session["owner"]["id"]), conversation_id=_query_param(parsed.query, "conversation_id") or "principal"))
            elif path == "/documents":
                self._send(document_routes.handle_get(path, parsed.query, self._session()))
            elif document_routes.is_document_path(path):
                self._send(document_routes.handle_get(path, parsed.query, self._session()))
            elif library_routes.is_library_path(path):
                self._send(library_routes.handle_get(path, parsed.query, self._session()))
            elif path == "/diagnostics/hardware":
                self._session()
                self._send(diagnostics.hardware_report())
            elif path == "/diagnostics/core":
                self._session()
                self._send(diagnostics.core_health())
            elif memory_routes.is_memory_path(path):
                self._send(memory_routes.handle_get(path, parsed.query, self._session()))
            else:
                raise CronosError(404, "Rota nao encontrada.")
        except CronosError as error:
            self._error(error)
        except Exception as error:
            self._last_stacktrace = traceback.format_exc()
            self._error(CronosError(500, str(error)))

    def do_POST(self) -> None:
        self._begin_http_trace()
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
                session = self._session()
                payload = self._json_body()
                self._send(chat.send_message(payload.get("message", ""), int(session["owner"]["id"]), payload.get("conversation_id", "principal"), payload.get("document_ids")))
            elif path == "/documents/upload":
                session = self._session()
                filename, content = self._multipart_file()
                self._send(documents.save_pdf(filename, content, int(session["owner"]["id"])))
            elif path == "/documents/import":
                session = self._session()
                filename, content = self._multipart_file()
                self._send(document_routes.handle_post(path, session, file_payload=(filename, content)))
            elif match := re.fullmatch(r"/documents/(\d+)/ask", path):
                session = self._session()
                payload = self._json_body()
                self._send(documents.ask_document(int(match.group(1)), payload.get("question", ""), int(session["owner"]["id"])))
            elif path == "/backup":
                self._session()
                self._send(backup.create_backup())
            elif path == "/restore":
                self._session()
                filename, content = self._multipart_file()
                self._send(backup.restore_backup(filename, content))
            elif path == "/runtime/shutdown":
                self._shutdown()
            elif memory_routes.is_memory_path(path):
                session = self._session()
                self._send(memory_routes.handle_post(path, self._json_body(), session))
            elif document_routes.is_document_path(path):
                session = self._session()
                self._send(document_routes.handle_post(path, session, payload=self._json_body()))
            elif library_routes.is_library_path(path):
                session = self._session()
                self._send(library_routes.handle_post(path, self._json_body(), session))
            else:
                raise CronosError(404, "Rota nao encontrada.")
        except CronosError as error:
            self._error(error)
        except Exception as error:
            self._last_stacktrace = traceback.format_exc()
            self._error(CronosError(500, str(error)))

    def do_PATCH(self) -> None:
        self._begin_http_trace()
        try:
            path = urlparse(self.path).path
            if memory_routes.is_memory_path(path):
                session = self._session()
                self._send(memory_routes.handle_patch(path, self._json_body(), session))
            else:
                raise CronosError(404, "Rota nao encontrada.")
        except CronosError as error:
            self._error(error)
        except Exception as error:
            self._last_stacktrace = traceback.format_exc()
            self._error(CronosError(500, str(error)))

    def do_DELETE(self) -> None:
        self._begin_http_trace()
        try:
            path = urlparse(self.path).path
            if memory_routes.is_memory_path(path):
                self._send(memory_routes.handle_delete(path, self._session()))
            elif document_routes.is_document_path(path):
                self._send(document_routes.handle_delete(path, self._session()))
            else:
                raise CronosError(404, "Rota nao encontrada.")
        except CronosError as error:
            self._error(error)
        except Exception as error:
            self._last_stacktrace = traceback.format_exc()
            self._error(CronosError(500, str(error)))

    def _json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            self._request_payload = {}
            return {}
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        self._request_payload = _redact(payload)
        return payload

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
            filename_match = re.search(r'filename="?([^";\r\n]+)"?', disposition)
            filename = filename_match.group(1) if filename_match else "upload.bin"
            file_content = content.rstrip(b"\r\n-")
            self._request_payload = {"filename": filename, "file_size": len(file_content), "content_type": content_type.split(";")[0]}
            return filename, file_content
        raise CronosError(400, "Arquivo nao encontrado no envio.")

    def _session(self) -> dict:
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            raise CronosError(401, "Sessao obrigatoria.")
        return auth.get_session(authorization.removeprefix("Bearer ").strip())

    def _require_runtime_token(self) -> None:
        if not RUNTIME_TOKEN:
            raise CronosError(403, "Runtime token indisponivel.")
        provided = self.headers.get("X-Cronos-Runtime-Token", "")
        if not hmac.compare_digest(provided, RUNTIME_TOKEN):
            raise CronosError(401, "Runtime token invalido.")

    def _require_local_client(self) -> None:
        client_host = self.client_address[0]
        if client_host not in {"127.0.0.1", "::1", "localhost"}:
            raise CronosError(403, "Runtime disponivel apenas localmente.")

    def _shutdown(self) -> None:
        global SHUTTING_DOWN
        self._require_local_client()
        self._require_runtime_token()
        SHUTTING_DOWN = True
        self._send({"accepted": True, "readiness": "stopping"})

        def stop() -> None:
            time.sleep(0.1)
            self.server.shutdown()

        threading.Thread(target=stop, daemon=True).start()

    def _send(self, payload: object, status: int = 200) -> None:
        raw = b"" if status == 204 else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._log_http_request(status, payload)
        self.send_response(status)
        self._cors()
        for header, value in diagnostics.response_headers().items():
            self.send_header(header, value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if raw:
            self.wfile.write(raw)

    def _error(self, error: CronosError) -> None:
        self._send(
            {
                "detail": error.detail,
                "code": error.code,
                "message": error.detail,
                "details": error.details,
                "request_id": error.request_id,
            },
            status=error.status_code,
        )

    def _cors(self) -> None:
        origin = self.headers.get("Origin", "http://127.0.0.1:5173")
        self.send_header("Access-Control-Allow-Origin", allowed_cors_origin(origin))
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Cronos-Runtime-Token")
        self.send_header(
            "Access-Control-Expose-Headers",
            "X-Cronos-Version,X-Cronos-Commit,X-Cronos-Build-Id,X-Cronos-Protocol-Version,X-Cronos-Backend-Pid,X-Cronos-Provider",
        )

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")

    def _begin_http_trace(self) -> None:
        self._request_started_at = time.monotonic()
        self._request_payload = None
        self._last_stacktrace = None

    def _log_http_request(self, status: int, response_payload: object) -> None:
        started_at = getattr(self, "_request_started_at", None)
        elapsed_ms = round((time.monotonic() - started_at) * 1000, 2) if started_at else None
        parsed = urlparse(self.path)
        payload = {
            "event": "http_request",
            "method": self.command,
            "url": parsed.path,
            "status": status,
            "elapsed_ms": elapsed_ms,
            "payload": _truncate_json(getattr(self, "_request_payload", None)),
            "response": _truncate_json(_redact(response_payload)),
        }
        stacktrace = getattr(self, "_last_stacktrace", None)
        if stacktrace:
            payload["stacktrace"] = stacktrace[-3000:]
        print(json.dumps(payload, ensure_ascii=False), flush=True)


def allowed_cors_origin(origin: str) -> str:
    configured = {
        value.strip()
        for value in os.environ.get("CRONOS_ALLOWED_ORIGINS", "").split(",")
        if value.strip()
    }
    allowed = DEFAULT_ALLOWED_ORIGINS | configured
    if origin in allowed:
        return origin

    parsed = urlparse(origin)
    if parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "localhost", "tauri.localhost"}:
        return origin
    if parsed.scheme == "tauri" and parsed.hostname in {"localhost", "tauri.localhost"}:
        return origin

    return "http://127.0.0.1:5173"


def _query_param(query: str, name: str) -> str | None:
    from urllib.parse import parse_qs

    values = parse_qs(query).get(name)
    return values[0] if values else None


def _redact(value: object) -> object:
    secret_keys = {"authorization", "password", "pin", "token", "runtime_token", "x-cronos-runtime-token"}
    if isinstance(value, Mapping):
        redacted = {}
        for key, item in value.items():
            lowered = str(key).lower()
            redacted[key] = "***redacted***" if any(secret in lowered for secret in secret_keys) else _redact(item)
        return redacted
    if isinstance(value, list):
        return [_redact(item) for item in value[:20]]
    return value


def _truncate_json(value: object, limit: int = 1600) -> object:
    if value is None:
        return None
    serialized = json.dumps(value, ensure_ascii=False, default=str)
    if len(serialized) <= limit:
        return value
    return serialized[:limit] + "...[truncated]"


def main() -> None:
    parser = argparse.ArgumentParser(description="CRONOS local backend")
    parser.add_argument("--host", default=os.environ.get("CRONOS_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("CRONOS_PORT", "8000")))
    parser.add_argument("--data-dir", default=os.environ.get("CRONOS_DATA_DIR"))
    parser.add_argument("--log-dir", default=os.environ.get("CRONOS_LOG_DIR"))
    parser.add_argument("--runtime-token", default=os.environ.get("CRONOS_RUNTIME_TOKEN", ""))
    parser.add_argument("--session-id", default=os.environ.get("CRONOS_SESSION_ID", ""))
    parser.add_argument("--parent-pid", default=os.environ.get("CRONOS_PARENT_PID", ""))
    parser.add_argument("--environment", default=os.environ.get("CRONOS_ENV", "development"))
    parser.add_argument("--resource-dir", default=os.environ.get("CRONOS_RESOURCE_DIR"))
    parser.add_argument("--build-id", default=os.environ.get("CRONOS_BUILD_ID", ""))
    parser.add_argument("--git-commit", default=os.environ.get("CRONOS_GIT_COMMIT", ""))
    parser.add_argument("--protocol-version", default=os.environ.get("CRONOS_PROTOCOL_VERSION", "1"))
    args = parser.parse_args()

    global RUNTIME_TOKEN
    RUNTIME_TOKEN = args.runtime_token

    if args.environment in {"desktop", "production"} and args.host != "127.0.0.1":
        _runtime_event(
            "cronos_backend_error",
            code="INVALID_HOST",
            message="Desktop production backend must bind only to 127.0.0.1.",
        )
        sys.exit(2)

    settings.configure(
        env=args.environment,
        data_dir=args.data_dir,
        log_dir=args.log_dir,
        session_id=args.session_id or str(uuid.uuid4()),
        parent_pid=args.parent_pid,
        resource_dir=args.resource_dir,
        build_id=args.build_id,
        git_commit=args.git_commit,
        protocol_version=args.protocol_version,
    )

    try:
        settings.ensure_directories()
        init_db()
        server = ThreadingHTTPServer((args.host, args.port), CronosHandler)
    except OSError as error:
        _runtime_event("cronos_backend_error", code="PORT_BIND_FAILED", message=str(error))
        sys.exit(3)
    except Exception as error:
        _write_technical_error(error)
        _runtime_event("cronos_backend_error", code="STARTUP_FAILED", message=str(error))
        sys.exit(4)

    actual_host, actual_port = server.server_address[:2]
    _runtime_event(
        "cronos_backend_ready",
        host=actual_host,
        port=actual_port,
        pid=os.getpid(),
        session_id=settings.session_id,
        version=settings.version,
        build_id=settings.build_id,
        git_commit=settings.git_commit,
        protocol_version=settings.protocol_version,
        resource_dir=str(settings.resource_dir),
    )
    try:
        server.serve_forever()
    finally:
        embedding_service.stop()
        llm_provider.stop()
        server.server_close()


def _write_technical_error(error: Exception) -> None:
    try:
        settings.ensure_directories()
        log_path = settings.log_dir / "cronos-backend.log"
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} STARTUP_FAILED {error}\n")
            handle.write(traceback.format_exc())
            handle.write("\n")
    except Exception:
        return


if __name__ == "__main__":
    main()
