import shutil
from pathlib import Path

from pypdf import PdfReader

from cronos.core.config import settings
from cronos.core.db import connect
from cronos.core.errors import CronosError
from cronos.core.security import utcnow


def _extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    pages: list[str] = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        pages.append(f"[pagina {index}]\n{text.strip()}")
    return "\n\n".join(pages).strip()


def save_pdf(filename: str, content: bytes) -> dict:
    if not filename or not filename.lower().endswith(".pdf"):
        raise CronosError(400, "Envie um arquivo PDF.")
    settings.documents_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(filename).name
    target = settings.documents_dir / f"{utcnow().strftime('%Y%m%d%H%M%S')}_{safe_name}"
    with target.open("wb") as output:
        output.write(content)
    text = _extract_pdf_text(target)
    if not text:
        text = "Nao foi possivel extrair texto pesquisavel deste PDF."
    with connect() as db:
        cursor = db.execute(
            """
            INSERT INTO documents (filename, stored_path, text, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (safe_name, str(target), text, utcnow().isoformat()),
        )
        document_id = cursor.lastrowid
    return {"id": document_id, "filename": safe_name, "characters": len(text)}


def list_documents() -> list[dict]:
    with connect() as db:
        rows = db.execute(
            "SELECT id, filename, created_at FROM documents ORDER BY id DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def ask_document(document_id: int, question: str) -> dict:
    with connect() as db:
        document = db.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
    if document is None:
        raise CronosError(404, "Documento nao encontrado.")

    words = [word.lower() for word in question.split() if len(word) > 3]
    chunks = [chunk.strip() for chunk in document["text"].split("\n\n") if chunk.strip()]
    ranked = []
    for chunk in chunks:
        score = sum(chunk.lower().count(word) for word in words)
        if score:
            ranked.append((score, chunk))
    ranked.sort(reverse=True, key=lambda item: item[0])
    citations = [chunk for _, chunk in ranked[:3]] or chunks[:2]
    answer = (
        "Com base no PDF, estes trechos parecem mais relacionados a sua pergunta. "
        "A resposta ainda usa busca local simples; o proximo passo e conectar um modelo para sintese avancada."
    )
    return {"answer": answer, "citations": citations, "document": {"id": document_id, "filename": document["filename"]}}
