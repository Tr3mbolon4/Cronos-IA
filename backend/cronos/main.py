from fastapi import Depends, FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from cronos.api.deps import require_session
from cronos.api.schemas import ChatRequest, DocumentQuestion, LoginRequest, OwnerCreate
from cronos.core.db import init_db
from cronos.services import auth, backup, chat, diagnostics, documents

app = FastAPI(title="CRONOS Local API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "name": "CRONOS", "version": "0.1.0"}


@app.get("/setup/status")
def setup_status() -> dict:
    return auth.setup_status()


@app.post("/setup/owner")
def setup_owner(payload: OwnerCreate) -> dict:
    return auth.create_owner(payload.name, payload.password, payload.pin)


@app.post("/auth/login")
def login(payload: LoginRequest) -> dict:
    return auth.login(payload.password, payload.pin)


@app.post("/auth/lock")
def lock(session: dict = Depends(require_session)) -> dict:
    return auth.lock_session(session["token"])


@app.get("/auth/session")
def session(session_data: dict = Depends(require_session)) -> dict:
    return session_data


@app.post("/chat")
def send_chat(payload: ChatRequest, _: dict = Depends(require_session)) -> dict:
    return chat.send_message(payload.message)


@app.get("/chat/history")
def chat_history(_: dict = Depends(require_session)) -> list[dict]:
    return chat.history()


@app.post("/documents/upload")
def upload_document(file: UploadFile = File(...), _: dict = Depends(require_session)) -> dict:
    return documents.save_upload(file)


@app.get("/documents")
def list_documents(_: dict = Depends(require_session)) -> list[dict]:
    return documents.list_documents()


@app.post("/documents/{document_id}/ask")
def ask_document(document_id: int, payload: DocumentQuestion, _: dict = Depends(require_session)) -> dict:
    return documents.ask_document(document_id, payload.question)


@app.get("/diagnostics/hardware")
def hardware(_: dict = Depends(require_session)) -> dict:
    return diagnostics.hardware_report()


@app.post("/backup")
def create_backup(_: dict = Depends(require_session)) -> dict:
    return backup.create_backup()


@app.post("/restore")
def restore_backup(file: UploadFile = File(...), _: dict = Depends(require_session)) -> dict:
    return backup.restore_backup(file)
