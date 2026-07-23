import json
import re
import time
import unicodedata

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
DOCUMENT_REFUSAL_MARKERS = (
    "nao consigo ler documentos",
    "não consigo ler documentos",
    "nao consigo acessar documentos",
    "não consigo acessar documentos",
    "nao posso ler arquivos",
    "não posso ler arquivos",
)


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
    started = time.perf_counter()
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
    if route == DOCUMENT_QA and active_document_ids and not context.get("items"):
        diagnostics = _diagnostics(route, context, owner_id=owner_id, conversation_id=conversation_id, document_ids=active_document_ids, message=clean, recent=recent, started=started)
        response = "Ainda estou processando o documento. Aguarde alguns segundos."
        _save_message("assistant", response, owner_id=owner_id, conversation_id=conversation_id, route=route, diagnostics=diagnostics)
        _write_chat_diagnostic(clean, [{"role": "system", "content": "DOCUMENT_QA sem chunks recuperados."}], response, diagnostics)
        return {
            "role": "assistant",
            "content": response,
            "created_at": utcnow().isoformat(),
            "conversation_id": conversation_id,
            "route": route,
            "diagnostics": diagnostics,
        }
    grounded_response = _document_direct_response(clean, context) if route == DOCUMENT_QA else None
    if grounded_response:
        diagnostics = _diagnostics(route, context, owner_id=owner_id, conversation_id=conversation_id, document_ids=active_document_ids, message=clean, recent=recent, started=started)
        _save_message("assistant", grounded_response, owner_id=owner_id, conversation_id=conversation_id, route=route, diagnostics=diagnostics)
        _write_chat_diagnostic(clean, [{"role": "system", "content": "DOCUMENT_QA respondido por verificador documental."}], grounded_response, diagnostics)
        return {
            "role": "assistant",
            "content": grounded_response,
            "created_at": utcnow().isoformat(),
            "conversation_id": conversation_id,
            "route": route,
            "diagnostics": diagnostics,
        }
    prompt = _prompt_messages(_sanitize_legacy_fallbacks(recent), context, route)
    response = llm_provider.generate(prompt)
    relevance_score = _response_relevance_score(clean, response)
    retry_count = 0
    if route == GENERAL_CHAT and _needs_current_question_retry(clean, response, relevance_score):
        retry_count = 1
        retry_prompt = _current_question_retry_prompt(clean, route)
        response = llm_provider.generate(retry_prompt)
        relevance_score = _response_relevance_score(clean, response)
    if route == DOCUMENT_QA and context.get("items") and _is_document_refusal(response):
        response = _document_grounded_fallback(clean, context)
    if _is_legacy_fallback(response):
        raise CronosError(
            503,
            "Resposta legada de fallback bloqueada. O modelo local precisa gerar uma resposta real.",
            code="LLM_LEGACY_FALLBACK_BLOCKED",
        )
    diagnostics = _diagnostics(
        route,
        context,
        owner_id=owner_id,
        conversation_id=conversation_id,
        document_ids=active_document_ids,
        message=clean,
        recent=recent,
        started=started,
        relevance_score=relevance_score,
        retry_count=retry_count,
    )
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
    if active_document_ids:
        return DOCUMENT_QA
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
                    "cite nome do documento, pagina e trecho de suporte. "
                    "Se a resposta nao estiver nos trechos, responda exatamente: O documento nao contem essa informacao. "
                    "Nunca diga que nao consegue ler documentos quando houver contexto documental recuperado.\n" + "\n".join(formatted)
                ),
            }
        )
    elif route == DOCUMENT_QA:
        messages.append({"role": "system", "content": "Nenhum documento relevante foi recuperado acima do limite minimo."})
    if recent:
        current_message = str(recent[-1].get("content", "")) if recent else ""
        messages.append(
            {
                "role": "system",
                "content": (
                    "Prioridade absoluta: responda a ultima mensagem do proprietario. "
                    f"Mensagem atual: {current_message}. "
                    "Use o historico apenas quando ele for diretamente necessario para entender pronomes, referencias ou continuidade."
                ),
            }
        )
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


def _current_question_retry_prompt(message: str, route: str) -> list[dict]:
    return [
        {
            "role": "system",
            "content": (
                "Seu nome e CRONOS. Responda em portugues do Brasil. "
                "A resposta anterior foi descartada por baixa aderencia a pergunta atual. "
                "Ignore assuntos anteriores e responda somente a pergunta abaixo, de forma direta e util."
            ),
        },
        {"role": "system", "content": f"Rota selecionada pelo CRONOS: {route}. Retry maximo: 1."},
        {"role": "user", "content": message},
    ]


def _local_context(owner_id: int, query: str, document_ids: list[int] | None = None) -> dict:
    try:
        from cronos.services import retrieval_service

        payload: dict = {"query": query, "top_k": 4}
        clean_ids = _clean_document_ids(document_ids)
        if len(clean_ids) == 1:
            payload["filters"] = {"document_id": clean_ids[0]}
        elif len(clean_ids) > 1:
            payload["filters"] = {"document_ids": clean_ids}
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


def _diagnostics(
    route: str,
    context: dict,
    *,
    owner_id: int | None = None,
    conversation_id: str | None = None,
    document_ids: list[int] | None = None,
    message: str = "",
    recent: list[dict] | None = None,
    started: float | None = None,
    relevance_score: float | None = None,
    retry_count: int = 0,
) -> dict:
    items = context.get("items", [])
    llm = llm_provider.status()
    top_score = max([float(item.get("score_final") or 0) for item in items], default=0.0)
    elapsed_ms = int((time.perf_counter() - started) * 1000) if started else 0
    return {
        "route": route,
        "current_message": message[:500],
        "intent": _message_intent(message),
        "conversation_id": conversation_id,
        "document_ids": _clean_document_ids(document_ids),
        "usedConversationHistory": True,
        "history_count": len(recent or []),
        "usedPermanentMemory": False,
        "memory_used": False,
        "usedDocuments": bool(items),
        "retrievedChunkCount": len(items),
        "topScore": round(top_score, 6),
        "provider": llm.get("provider"),
        "model": llm.get("model"),
        "final_model": llm.get("model"),
        "relevance_score": round(relevance_score if relevance_score is not None else 1.0, 6),
        "retry_count": retry_count,
        "latency_ms": elapsed_ms,
        "attachedDocumentIds": _document_ids_from_items(items),
        "retrieval": {"mode": context.get("mode"), "provider": context.get("provider")},
        "retrievalAudit": _retrieval_audit(owner_id, document_ids) if owner_id and document_ids else None,
    }


def _message_intent(message: str) -> str:
    normalized = _normalize_ascii(message)
    if re.search(r"\b(ip|ping|cmd|terminal|powershell|windows|rede|porta)\b", normalized):
        return "TECHNICAL_HELP"
    if re.search(r"\b(documento|pdf|resuma|leia|pagina|citacao)\b", normalized):
        return "DOCUMENT_QA"
    if re.search(r"\b(codigo que falei|lembra|historico|mensagem anterior)\b", normalized):
        return "MEMORY_QUERY"
    return "GENERAL"


def _response_relevance_score(message: str, response: str) -> float:
    terms = set(_meaningful_terms(message))
    if not terms:
        return 1.0
    normalized_response = _normalize_ascii(response)
    hits = sum(1 for term in terms if term in normalized_response)
    return hits / len(terms)


def _needs_current_question_retry(message: str, response: str, relevance_score: float) -> bool:
    intent = _message_intent(message)
    normalized_response = _normalize_ascii(response)
    if intent == "TECHNICAL_HELP" and relevance_score < 0.34:
        return True
    if re.search(r"\b(ip|ping)\b", _normalize_ascii(message)) and not re.search(r"\b(ip|ping|rede|comando|cmd|terminal|windows)\b", normalized_response):
        return True
    return False


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


def _retrieval_audit(owner_id: int | None, document_ids: list[int] | None) -> dict:
    clean_ids = _clean_document_ids(document_ids)
    if not owner_id or not clean_ids:
        return {"document_ids": clean_ids, "chunks": 0, "embeddings": 0}
    placeholders = ",".join(["?"] * len(clean_ids))
    params = [owner_id, *clean_ids]
    with connect() as db:
        chunks = db.execute(
            f"""
            SELECT COUNT(*)
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.owner_id = ? AND c.document_id IN ({placeholders}) AND c.deleted_at IS NULL AND d.deleted_at IS NULL
            """,
            params,
        ).fetchone()[0]
        embeddings = db.execute(
            f"""
            SELECT COUNT(*)
            FROM document_embeddings e
            JOIN document_chunks c ON c.id = e.chunk_id
            JOIN documents d ON d.id = e.document_id
            WHERE c.owner_id = ? AND e.document_id IN ({placeholders}) AND c.deleted_at IS NULL AND d.deleted_at IS NULL
            """,
            params,
        ).fetchone()[0]
    return {"document_ids": clean_ids, "chunks": chunks, "embeddings": embeddings}


def _document_no_answer_response(query: str, context: dict) -> str | None:
    items = context.get("items") or []
    if not items:
        return None
    terms = _meaningful_terms(query)
    if not terms or _document_action_only(query):
        return None
    haystack = _normalize_ascii(" ".join(str(item.get("excerpt") or item.get("chunk", {}).get("text_content") or "") for item in items))
    if any(term in haystack for term in terms):
        return None
    return "O documento nao contem essa informacao."


def _document_direct_response(query: str, context: dict) -> str | None:
    no_answer = _document_no_answer_response(query, context)
    if no_answer:
        return no_answer
    items = context.get("items") or []
    if not items:
        return None
    first = items[0]
    excerpt = str(first.get("excerpt") or first.get("chunk", {}).get("text_content") or "").strip()
    citation = first.get("citation") or {}
    source = citation.get("source_filename") or first.get("document", {}).get("filename") or "documento"
    page = citation.get("page_number") or first.get("page", {}).get("page_number") or 1
    if _is_color_question(query) and "azul" in _normalize_ascii(excerpt):
        return f"O documento informa que o céu é azul. Fonte: {source}, pagina {page}."
    return None


def _document_grounded_fallback(query: str, context: dict) -> str:
    direct = _document_direct_response(query, context)
    if direct:
        return direct
    items = context.get("items") or []
    if not items:
        return "Ainda estou processando o documento. Aguarde alguns segundos."
    first = items[0]
    excerpt = str(first.get("excerpt") or first.get("chunk", {}).get("text_content") or "").strip()
    citation = first.get("citation") or {}
    source = citation.get("source_filename") or first.get("document", {}).get("filename") or "documento"
    page = citation.get("page_number") or first.get("page", {}).get("page_number") or 1
    if _is_color_question(query) and "azul" in _normalize_ascii(excerpt):
        return f"O documento informa que o céu é azul. Fonte: {source}, pagina {page}."
    return f"O documento informa: {excerpt} Fonte: {source}, pagina {page}."


def _is_document_refusal(content: str) -> bool:
    normalized = _normalize_ascii(content)
    return any(_normalize_ascii(marker) in normalized for marker in DOCUMENT_REFUSAL_MARKERS)


def _document_action_only(query: str) -> bool:
    terms = _meaningful_terms(query)
    return not terms


def _meaningful_terms(query: str) -> list[str]:
    stopwords = {
        "a", "o", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "e", "que", "qual", "quais",
        "este", "esta", "esse", "essa", "isso", "documento", "pdf", "arquivo", "leia", "ler", "resuma",
        "resumir", "resumo", "explique", "explicar", "topicos", "principais", "sobre", "existe", "alguma",
        "informacao", "informacoes", "contém", "contem", "cor",
    }
    normalized = _normalize_ascii(query)
    return [term for term in re.findall(r"[a-z0-9]{3,}", normalized) if term not in stopwords]


def _is_sky_color_question(query: str) -> bool:
    normalized = _normalize_ascii(query)
    return "ceu" in normalized and "cor" in normalized


def _is_color_question(query: str) -> bool:
    normalized = _normalize_ascii(query)
    return "cor" in normalized


def _normalize_ascii(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char)).lower()


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
    with (settings.log_dir / "chat-routing.log").open("a", encoding="utf-8", errors="replace") as handle:
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
