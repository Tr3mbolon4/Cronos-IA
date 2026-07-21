MIGRATION = {
    "version": "0004_retrieval_embeddings_schema",
    "description": "Consolidate document embeddings for the retrieval engine.",
    "sql": """
        CREATE TABLE document_embeddings_v4 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            chunk_id INTEGER NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            dimension INTEGER NOT NULL,
            embedding TEXT NOT NULL,
            embedding_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(document_id) REFERENCES documents(id),
            FOREIGN KEY(chunk_id) REFERENCES document_chunks(id),
            UNIQUE(chunk_id, provider, model, embedding_hash)
        );

        INSERT OR IGNORE INTO document_embeddings_v4 (
            id, document_id, chunk_id, provider, model, dimension,
            embedding, embedding_hash, created_at, updated_at
        )
        SELECT
            document_embeddings.id,
            document_chunks.document_id,
            document_embeddings.chunk_id,
            document_embeddings.provider,
            document_embeddings.model,
            document_embeddings.dimensions,
            document_embeddings.vector_json,
            printf('%016x', abs(random())),
            document_embeddings.created_at,
            document_embeddings.created_at
        FROM document_embeddings
        JOIN document_chunks ON document_chunks.id = document_embeddings.chunk_id
        WHERE document_embeddings.chunk_id IS NOT NULL;

        DROP TABLE document_embeddings;
        ALTER TABLE document_embeddings_v4 RENAME TO document_embeddings;

        CREATE INDEX IF NOT EXISTS idx_document_embeddings_document ON document_embeddings(document_id);
        CREATE INDEX IF NOT EXISTS idx_document_embeddings_chunk ON document_embeddings(chunk_id);
        CREATE INDEX IF NOT EXISTS idx_document_embeddings_provider_model ON document_embeddings(provider, model);
    """,
}
