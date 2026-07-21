from cronos.core.errors import CronosError
from cronos.services import document_ingestion_service, knowledge_service, llm_provider


def save_pdf(filename: str, content: bytes, owner_id: int = 1) -> dict:
    result = document_ingestion_service.import_pdf(owner_id, filename, content)
    document = result["document"]
    source = result["source"]
    return {
        "id": document["id"],
        "filename": document["filename"],
        "characters": len(document["text"]),
        "source_id": source["id"],
        "page_count": result["page_count"],
        "chunk_count": result["chunk_count"],
        "indexing_status": source["indexing_status"],
    }


def list_documents(owner_id: int = 1) -> list[dict]:
    return knowledge_service.list_documents(owner_id)


def ask_document(document_id: int, question: str, owner_id: int = 1) -> dict:
    try:
        search = knowledge_service.search_library(owner_id, {"query": question, "document_id": document_id, "limit": 3})
    except CronosError:
        raise
    citations = [item["citation"] for item in search["items"]]
    legacy_citations = [citation["excerpt"] for citation in citations]
    if not citations:
        answer = "Nao encontrei essa informacao nos documentos selecionados."
    else:
        context = "\n".join(
            f"[{index}] Documento: {citation['source_filename']} | Pagina: {citation['page_number']} | Trecho: {citation['excerpt']}"
            for index, citation in enumerate(citations, start=1)
        )
        answer = llm_provider.generate(
            [
                {
                    "role": "system",
                    "content": (
                        "Voce e o CRONOS. Responda em portugues usando somente o contexto documental fornecido. "
                        "Inclua documento e pagina quando citar. Se a informacao nao existir no contexto, diga que nao encontrou."
                    ),
                },
                {"role": "system", "content": f"Contexto documental:\n{context}"},
                {"role": "user", "content": question},
            ]
        )
    document = knowledge_service.get_document(owner_id, document_id)["document"]
    return {
        "answer": answer,
        "citations": legacy_citations,
        "structured_citations": citations,
        "document": {"id": document_id, "filename": document["filename"]},
    }
