import json
import re

from cronos.core.db import connect
from cronos.core.errors import CronosError
from cronos.core.security import utcnow
from cronos.core.config import settings
from cronos.services import llm_provider

LEGACY_MVP_FALLBACK_MARKERS = (
    "Estou rodando localmente no MVP do CRONOS",
    "Ainda nao tenho um modelo de IA completo conectado",
    "Ainda não tenho um modelo de IA completo conectado",
)

GENERAL_CHAT = "GENERAL_CHAT"
DOCUMENT_QA = "DOCUMENT_QA"
MEMORY_QUERY = "MEMORY_QUERY"
SYSTEM_COMMAND = "SYSTEM_COMMAND"
MIN_DOCUMENT_SCORE = 0.12


def _save_message(
    role: str,
    content: str,
    *,
    owner_id: int = 1,
    conversation_id: str = "legacy",
    route: str | None = None,
    diagnostics: dict | None = None,
) -> None:
    with connect() as db:
        db.execute(
            """
            INSERT INTO messages (owner_id, conversation_id, role, content, created_at, route, diagnostics_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                owner_id,
                _conversation_id(conversation_id),
                role,
                content,
                utcnow().isoformat(),
                route,
                json.dumps(diagnostics, ensure_ascii=False) if diagnostics else None,
            ),
        )


def history(limit: int = 50, owner_id: int = 1, conversation_id: str = "principal") -> list[dict]:
    conversation_id = _conversation_id(conversation_id)
    with connect() as db:
        rows = db.execute(
            """
            SELECT id, owner_id, conversation_id, role, content, created_at, route, diagnostics_json
            FROM messages
            WHERE owner_id = ? AND conversation_id = ? AND deleted_at IS NULL
            ORDER BY id DESC LIMIT ?
            """,
            (owner_id, conversation_id, limit),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


def send_message(content: str, owner_id: int = 1, conversation_id: str = "principal", document_ids: list[int] | None = None) -> dict:
    clean = content.strip()
    if not clean:
        raise CronosError(400, "Mensagem obrigatoria.", code="CHAT_MESSAGE_REQUIRED")
    conversation_id = _conversation_id(conversation_id)
    active_document_ids = _active_document_ids(owner_id, conversation_id, document_ids)
    route = route_message(clean, active_document_ids)
    user_diagnostics = {"attachedDocumentIds": active_document_ids} if active_document_ids else None
    _save_message("user", clean, owner_id=owner_id, conversation_id=conversation_id, route=route, diagnostics=user_diagnostics)
    recent = history(20, owner_id, conversation_id)
    context = _context_for_route(route, owner_id, clean, active_document_ids)
    prompt = _prompt_messages(_sanitize_legacy_fallbacks(recent), context, route)
    response = llm_provider.generate(prompt)
    if _is_legacy_fallback(response):
        raise CronosError(
            503,
            "Resposta legada de fallback bloqueada. O modelo local precisa gerar uma resposta real.",
            code="LLM_LEGACY_FALLBACK_BLOCKED",
        )
    diagnostics = _diagnostics(route, context)
    _save_message("assistant", response, owner_id=owner_id, conversation_id=conversation_id, route=route, diagnostics=diagnostics)
    _write_chat_diagnostic(clean, prompt, response, diagnostics)
    return {
        "role": "assistant",
        "content": response,
        "created_at": utcnow().isoformat(),
        "conversation_id": conversation_id,
        "route": route,
        "diagnostics": diagnostics,
    }


def route_message(content: str, active_document_ids: list[int] | None = None) -> str:
    text = _normalize(content)
    if re.search(r"\b(abrir|execute|executar|instalar|desinstalar|atualizar|apagar|deletar|mover|copiar)\b", text):
        return SYSTEM_COMMAND
    if re.search(r"\b(documento|pdf|arquivo enviado|fonte|citacao|citação|pagina|página|biblioteca)\b", text):
        return DOCUMENT_QA
    if active_document_ids and re.search(r"\b(leia|ler|resuma|resumir|resumo|explique|explicar|interprete|o que esta escrito|sobre isso)\b", text):
        return DOCUMENT_QA
    if re.search(r"\b(nesta conversa|mensagem anterior|codigo que falei|código que falei|lembra|historico|histórico)\b", text):
        return MEMORY_QUERY
    if re.search(r"\b(qual seu nome|quem e voce|quem é você|ola|olá|oi|bom dia|boa tarde|boa noite|como voce esta|como você está|o que voce faz|o que você faz)\b", text):
        return GENERAL_CHAT
    return GENERAL_CHAT


def _prompt_messages(recent: list[dict], context: dict, route: str) -> list[dict]:
    messages = [
        {
            "role": "system",
            "content": (
                "Seu nome e CRONOS. Voce e uma IA pessoal local executada no computador do proprietario. "
                "Responda em portugues do Brasil. Para perguntas sobre seu nome, responda que seu nome e CRONOS. "
                "Separe fatos de inferencias quando houver incerteza. Nao invente conteudo de documentos. "
                "Nao afirme acesso a ferramentas indisponiveis e nao execute acoes sem autorizacao."
            ),
        }
    ]
    messages.append({"role": "system", "content": f"Rota selecionada pelo CRONOS: {route}."})
    if context["items"]:
        formatted = []
        for index, item in enumerate(context["items"], start=1):
            citation = item["citation"]
            formatted.append(
                f"[{index}] Documento: {citation['source_filename']} | Pagina: {citation['page_number']} | Trecho: {citation['excerpt']}"
            )
        messages.append(
            {
                "role": "system",
                "content": (
                    "Contexto documental recuperado. Use apenas se for relevante para a pergunta; "
                    "cite nome do documento, pagina e trecho de suporte.\n" + "\n".join(formatted)
                ),
            }
        )
    elif route == DOCUMENT_QA:
        messages.append({"role": "system", "content": "Nenhum documento relevante foi recuperado acima do limite minimo."})
    if recent:
        transcript = "\n".join(
            f"[{index}] {row['role']}: {row['content']}"
            for index, row in enumerate(recent[-20:], start=1)
        )
        messages.append(
            {
                "role": "system",
                "content": (
                    "Historico recente numerado em ordem cronologica. "
                    "Quando o proprietario perguntar sobre a primeira mensagem ou primeira pergunta desta conversa, use o item [1].\n"
                    f"{transcript}"
                ),
            }
        )
    for row in recent[-8:]:
        role = row["role"] if row["role"] in {"user", "assistant", "system"} else "user"
        messages.append({"role": role, "content": row["content"]})
    return messages


def _local_context(owner_id: int, query: str, document_ids: list[int] | None = None) -> dict:
    try:
        from cronos.services import retrieval_service

        payload: dict = {"query": query, "top_k": 4}
        clean_ids = _clean_document_ids(document_ids)
        if len(clean_ids) == 1:
            payload["filters"] = {"document_id": clean_ids[0]}
        return retrieval_service.retrieve(owner_id, payload)
    except Exception:
        return {"items": []}


def _context_for_route(route: str, owner_id: int, query: str, document_ids: list[int] | None = None) -> dict:
    if route != DOCUMENT_QA:
        return {"items": [], "total": 0, "mode": "none", "provider": {}, "skipped": "route_without_document_retrieval"}
    clean_ids = _clean_document_ids(document_ids)
    context = _local_context(owner_id, query, clean_ids)
    filtered = []
    for item in context.get("items", []):
        if float(item.get("score_final") or 0) >= MIN_DOCUMENT_SCORE:
            filtered.append(item)
    if not filtered and clean_ids:
        filtered = _first_document_chunks(owner_id, clean_ids)
    return {**context, "items": filtered, "total": len(filtered)}


def _diagnostics(route: str, context: dict) -> dict:
    items = context.get("items", [])
    llm = llm_provider.status()
    top_score = max([float(item.get("score_final") or 0) for item in items], default=0.0)
    return {
        "route": route,
        "usedConversationHistory": True,
        "usedPermanentMemory": False,
        "usedDocuments": bool(items),
        "retrievedChunkCount": len(items),
        "topScore": round(top_score, 6),
        "provider": llm.get("provider"),
        "model": llm.get("model"),
        "attachedDocumentIds": _document_ids_from_items(items),
        "retrieval": {"mode": context.get("mode"), "provider": context.get("provider")},
    }


def _first_document_chunks(owner_id: int, document_ids: list[int]) -> list[dict]:
    try:
        from cronos.repositories import retrieval_repository
        from cronos.services import document_citation_service

        items: list[dict] = []
        with connect() as db:
            for document_id in document_ids[:4]:
                chunks = retrieval_repository.list_active_chunks(db, owner_id, {"document_id": document_id})
                for chunk in chunks[:2]:
                    document = {"id": chunk["document_id"], "filename": chunk["document_title"]}
                    source = {"id": chunk["source_id"], "original_filename": chunk["original_filename"]}
                    page = {"id": chunk["page_id"], "page_number": chunk["page_number"]}
                    citation = document_citation_service.build_citation(document, source, page, chunk, relevance_score=0.15)
                    items.append(
                        {
                            "document": document,
                            "page": page,
                            "chunk": chunk,
                            "citation": citation,
                            "score_lexical": 0.0,
                            "score_semantic": 0.0,
                            "score_final": 0.15,
                            "excerpt": citation["excerpt"],
                        }
                    )
                    if len(items) >= 4:
                        return items
    except Exception:
        return []
    return items


def _active_document_ids(owner_id: int, conversation_id: str, document_ids: list[int] | None = None) -> list[int]:
    ids = _clean_document_ids(document_ids)
    if ids:
        return ids
    found: list[int] = []
    with connect() as db:
        rows = db.execute(
            """
            SELECT diagnostics_json
            FROM messages
            WHERE owner_id = ? AND conversation_id = ? AND diagnostics_json IS NOT NULL AND deleted_at IS NULL
            ORDER BY id DESC LIMIT 20
            """,
            (owner_id, conversation_id),
        ).fetchall()
    for row in rows:
        try:
            payload = json.loads(row["diagnostics_json"] or "{}")
        except Exception:
            continue
        for value in payload.get("attachedDocumentIds") or []:
            try:
                parsed = int(value)
            except (TypeError, ValueError):
                continue
            if parsed not in found:
                found.append(parsed)
        if found:
            break
    return found[:8]


def _clean_document_ids(document_ids: list[int] | None) -> list[int]:
    clean: list[int] = []
    for value in document_ids or []:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            continue
        if parsed > 0 and parsed not in clean:
            clean.append(parsed)
    return clean[:8]


def _document_ids_from_items(items: list[dict]) -> list[int]:
    ids: list[int] = []
    for item in items:
        document = item.get("document") or {}
        try:
            document_id = int(document.get("id"))
        except (TypeError, ValueError):
            continue
        if document_id not in ids:
            ids.append(document_id)
    return ids


def _write_chat_diagnostic(message: str, prompt: list[dict], response: str, diagnostics: dict) -> None:
    settings.log_dir.mkdir(parents=True, exist_ok=True)
    safe_prompt = [
        {"role": item.get("role"), "content_preview": str(item.get("content", ""))[:240]}
        for item in prompt
    ]
    payload = {
        **diagnostics,
        "messagePreview": message[:160],
        "prompt": safe_prompt,
        "responsePreview": response[:240],
        "createdAt": utcnow().isoformat(),
    }
    with (settings.log_dir / "chat-routing.log").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def _sanitize_legacy_fallbacks(recent: list[dict]) -> list[dict]:
    sanitized: list[dict] = []
    omitted = 0
    for row in recent:
        if row.get("role") == "assistant" and _is_legacy_fallback(str(row.get("content", ""))):
            omitted += 1
            continue
        sanitized.append(row)
    if omitted:
        sanitized.append(
            {
                "role": "system",
                "content": f"{omitted} resposta(s) legada(s) de fallback MVP foram omitidas do contexto.",
            }
        )
    return sanitized


def _is_legacy_fallback(content: str) -> bool:
    return any(marker in content for marker in LEGACY_MVP_FALLBACK_MARKERS)


def _conversation_id(value: str | None) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_.:-]", "-", str(value or "principal")).strip("-")
    return clean[:80] or "principal"


def _normalize(value: str) -> str:
    return value.strip().lower()
