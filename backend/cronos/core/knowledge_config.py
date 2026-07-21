from dataclasses import dataclass


@dataclass(frozen=True)
class KnowledgeConfig:
    max_file_bytes: int = 25 * 1024 * 1024
    max_pages: int = 500
    chunk_size: int = 1200
    chunk_overlap: int = 200
    min_chunk_size: int = 120
    allowed_extensions: tuple[str, ...] = (".pdf",)
    allowed_mime_types: tuple[str, ...] = ("application/pdf",)


knowledge_config = KnowledgeConfig()
