from . import (
    m0001_base_schema,
    m0002_memory_knowledge_schema,
    m0003_document_library_schema,
    m0004_retrieval_embeddings_schema,
)

MIGRATIONS = [
    m0001_base_schema.MIGRATION,
    m0002_memory_knowledge_schema.MIGRATION,
    m0003_document_library_schema.MIGRATION,
    m0004_retrieval_embeddings_schema.MIGRATION,
]
