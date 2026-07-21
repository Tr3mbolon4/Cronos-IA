MIGRATION = {
    "version": "0003_document_library_schema",
    "description": "Extend document library tables for sources, pages, chunks, citations and soft delete.",
    "sql": """
        ALTER TABLE documents ADD COLUMN owner_id INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE documents ADD COLUMN updated_at TEXT;
        ALTER TABLE documents ADD COLUMN deleted_at TEXT;

        UPDATE documents SET updated_at = created_at WHERE updated_at IS NULL;

        CREATE TABLE document_sources_v3 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL DEFAULT 1,
            document_id INTEGER NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'legacy_import',
            original_filename TEXT NOT NULL,
            stored_filename TEXT,
            original_path TEXT,
            stored_path TEXT,
            mime_type TEXT,
            file_size INTEGER NOT NULL DEFAULT 0,
            file_hash TEXT,
            page_count INTEGER NOT NULL DEFAULT 0,
            language TEXT,
            extraction_status TEXT NOT NULL DEFAULT 'pending',
            indexing_status TEXT NOT NULL DEFAULT 'pending',
            error_code TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            indexed_at TEXT,
            deleted_at TEXT,
            FOREIGN KEY(document_id) REFERENCES documents(id)
        );

        INSERT INTO document_sources_v3 (
            id, owner_id, document_id, source_type, original_filename, stored_filename,
            original_path, stored_path, mime_type, file_size, file_hash, page_count,
            language, extraction_status, indexing_status, error_code, error_message,
            created_at, updated_at, indexed_at, deleted_at
        )
        SELECT
            id, 1, document_id, 'legacy_import', original_filename, original_filename,
            original_path, original_path, mime_type, 0, content_hash, 0,
            NULL,
            CASE WHEN status IN ('pending', 'processing', 'completed', 'partial', 'failed') THEN status ELSE 'pending' END,
            CASE WHEN status IN ('pending', 'processing', 'completed', 'partial', 'failed') THEN status ELSE 'pending' END,
            NULL, error_message, created_at, updated_at, NULL, deleted_at
        FROM document_sources;

        DROP TABLE document_sources;
        ALTER TABLE document_sources_v3 RENAME TO document_sources;

        CREATE TABLE document_pages_v3 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL DEFAULT 1,
            document_id INTEGER NOT NULL,
            source_id INTEGER,
            page_number INTEGER NOT NULL,
            text_content TEXT NOT NULL,
            normalized_text TEXT NOT NULL,
            character_count INTEGER NOT NULL DEFAULT 0,
            extraction_status TEXT NOT NULL DEFAULT 'completed',
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            FOREIGN KEY(document_id) REFERENCES documents(id),
            FOREIGN KEY(source_id) REFERENCES document_sources(id)
        );

        INSERT INTO document_pages_v3 (
            id, owner_id, document_id, source_id, page_number, text_content,
            normalized_text, character_count, extraction_status, error_message,
            created_at, updated_at, deleted_at
        )
        SELECT
            id, 1, document_id, source_id, page_number, text,
            lower(text), length(COALESCE(text, '')), 'completed', NULL,
            created_at, created_at, NULL
        FROM document_pages;

        DROP TABLE document_pages;
        ALTER TABLE document_pages_v3 RENAME TO document_pages;

        CREATE TABLE document_chunks_v3 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL DEFAULT 1,
            document_id INTEGER NOT NULL,
            source_id INTEGER,
            page_id INTEGER,
            chunk_index INTEGER NOT NULL,
            text_content TEXT NOT NULL,
            normalized_text TEXT NOT NULL,
            character_start INTEGER NOT NULL DEFAULT 0,
            character_end INTEGER NOT NULL DEFAULT 0,
            token_estimate INTEGER NOT NULL DEFAULT 0,
            content_hash TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            FOREIGN KEY(document_id) REFERENCES documents(id),
            FOREIGN KEY(source_id) REFERENCES document_sources(id),
            FOREIGN KEY(page_id) REFERENCES document_pages(id)
        );

        INSERT INTO document_chunks_v3 (
            id, owner_id, document_id, source_id, page_id, chunk_index,
            text_content, normalized_text, character_start, character_end,
            token_estimate, content_hash, created_at, updated_at, deleted_at
        )
        SELECT
            id, 1, document_id, source_id, page_id, chunk_index,
            text, lexical_text, start_char, end_char,
            MAX(1, length(COALESCE(text, '')) / 4), NULL, created_at, created_at, NULL
        FROM document_chunks;

        DROP TABLE document_chunks;
        ALTER TABLE document_chunks_v3 RENAME TO document_chunks;

        CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
        CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_document_sources_owner ON document_sources(owner_id);
        CREATE INDEX IF NOT EXISTS idx_document_sources_document ON document_sources(document_id);
        CREATE INDEX IF NOT EXISTS idx_document_sources_hash ON document_sources(file_hash);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_document_pages_source_page_active
            ON document_pages(owner_id, source_id, page_number)
            WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_document_pages_document ON document_pages(document_id);
        CREATE INDEX IF NOT EXISTS idx_document_chunks_owner ON document_chunks(owner_id);
        CREATE INDEX IF NOT EXISTS idx_document_chunks_source ON document_chunks(source_id);
        CREATE INDEX IF NOT EXISTS idx_document_chunks_page ON document_chunks(page_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_hash_active
            ON document_chunks(owner_id, source_id, page_id, content_hash)
            WHERE deleted_at IS NULL AND content_hash IS NOT NULL;
    """,
}
