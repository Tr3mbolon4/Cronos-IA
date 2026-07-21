from pathlib import Path

from pypdf import PdfReader

from cronos.core.knowledge_config import knowledge_config
from cronos.schemas.document_schemas import document_error, sanitize_error_message


def validate_pdf_file(filename: str, content: bytes) -> None:
    if not filename or Path(filename).name != filename:
        raise document_error("DOCUMENT_VALIDATION_ERROR", "Nome de arquivo invalido.")
    if not filename.lower().endswith(".pdf"):
        raise document_error("DOCUMENT_TYPE_UNSUPPORTED", "Envie um arquivo PDF.", 415)
    if len(content) > knowledge_config.max_file_bytes:
        raise document_error("DOCUMENT_TOO_LARGE", "Documento acima do limite permitido.", 413)
    if not content.startswith(b"%PDF"):
        raise document_error("DOCUMENT_TYPE_UNSUPPORTED", "Assinatura de PDF invalida.", 415)


def extract_pdf_pages(path: Path) -> dict:
    if not path.exists():
        raise document_error("DOCUMENT_FILE_MISSING", "Arquivo do documento nao encontrado.", 404)
    try:
        reader = PdfReader(str(path))
    except Exception as error:
        raise document_error("DOCUMENT_EXTRACTION_FAILED", "Nao foi possivel abrir o PDF.", 422, {"error": sanitize_error_message(error)}) from error

    page_count = len(reader.pages)
    if page_count > knowledge_config.max_pages:
        raise document_error("DOCUMENT_TOO_LARGE", "Documento excede o limite de paginas.", 413, {"pages": page_count})

    pages: list[dict] = []
    extracted_pages = 0
    failed_pages = 0
    for index, page in enumerate(reader.pages, start=1):
        try:
            text = (page.extract_text() or "").strip()
            status = "completed" if text else "failed"
            message = None if text else "PDF sem texto pesquisavel nesta pagina."
            if text:
                extracted_pages += 1
            else:
                failed_pages += 1
            pages.append({"page_number": index, "text": text, "status": status, "error_message": message})
        except Exception as error:
            failed_pages += 1
            pages.append(
                {
                    "page_number": index,
                    "text": "",
                    "status": "failed",
                    "error_message": sanitize_error_message(error) or "Falha ao extrair pagina.",
                }
            )

    if extracted_pages == 0:
        return {"pages": pages or [{"page_number": 1, "text": "", "status": "failed", "error_message": "PDF sem texto pesquisavel."}], "status": "failed", "code": "DOCUMENT_SCANNED_NO_TEXT", "page_count": page_count}
    status = "partial" if failed_pages else "completed"
    return {"pages": pages, "status": status, "code": None, "page_count": page_count}
