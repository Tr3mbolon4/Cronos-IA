from cronos.core.db import connect
from cronos.core.security import utcnow


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


def send_message(content: str) -> dict:
    clean = content.strip()
    _save_message("user", clean)
    recent = history(8)
    response = (
        "Estou rodando localmente no MVP do CRONOS. "
        "Ainda nao tenho um modelo de IA completo conectado, mas ja consigo manter historico, "
        "ler PDFs enviados e responder usando os dados locais. "
        f"Recebi: {clean}"
    )
    if len(recent) > 1:
        response += f"\n\nMemoria recente: {len(recent)} mensagens registradas."
    _save_message("assistant", response)
    return {"role": "assistant", "content": response, "created_at": utcnow().isoformat()}
