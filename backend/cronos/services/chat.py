from cronos.core.db import connect
from cronos.core.errors import CronosError
from cronos.core.security import utcnow
from cronos.services import llm_provider, retrieval_service


def _save_message(role: str, content: str) -> None:
    with connect() as db:
        db.execute(
            "INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)",
            (role, content, utcnow().isoformat()),
        )


def history(limit: int = 50) -> list[dict]:
    with connect() as db:
        rows = db.execute(
            "SELECT id, role, content, created_at FROM messages ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


def send_message(content: str, owner_id: int = 1) -> dict:
    clean = content.strip()
    if not clean:
        raise CronosError(400, "Mensagem obrigatoria.", code="CHAT_MESSAGE_REQUIRED")
    _save_message("user", clean)
    recent = history(8)
    context = _local_context(owner_id, clean)
    response = llm_provider.generate(_prompt_messages(recent, context))
    _save_message("assistant", response)
    return {"role": "assistant", "content": response, "created_at": utcnow().isoformat()}


def _prompt_messages(recent: list[dict], context: dict) -> list[dict]:
    messages = [
        {
            "role": "system",
            "content": (
                "Voce e o CRONOS, uma IA pessoal local. Responda em portugues do Brasil. "
                "Separe fatos de inferencias quando houver incerteza. Nao invente conteudo de documentos. "
                "Quando usar documentos, cite nome do documento, pagina e trecho de suporte. "
                "Se a informacao nao estiver nos documentos recuperados, diga que nao encontrou a informacao. "
                "Nao afirme acesso a ferramentas indisponiveis e nao execute acoes sem autorizacao."
            ),
        }
    ]
    if context["items"]:
        formatted = []
        for index, item in enumerate(context["items"], start=1):
            citation = item["citation"]
            formatted.append(
                f"[{index}] Documento: {citation['source_filename']} | Pagina: {citation['page_number']} | Trecho: {citation['excerpt']}"
            )
        messages.append({"role": "system", "content": "Contexto documental recuperado:\n" + "\n".join(formatted)})
    for row in recent[-8:]:
        role = row["role"] if row["role"] in {"user", "assistant"} else "user"
        messages.append({"role": role, "content": row["content"]})
    return messages


def _local_context(owner_id: int, query: str) -> dict:
    try:
        return retrieval_service.retrieve(owner_id, {"query": query, "top_k": 4})
    except Exception:
        return {"items": []}
