MIGRATION = {
    "version": "0002_memory_knowledge_schema",
    "description": "Create initial memory and knowledge library tables.",
    "sql": """
        CREATE TABLE IF NOT EXISTS memory_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL DEFAULT 1,
            category_id INTEGER,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            normalized_content TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_reference TEXT,
            confidence REAL NOT NULL DEFAULT 0.7,
            importance INTEGER NOT NULL DEFAULT 3,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_accessed_at TEXT,
            access_count INTEGER NOT NULL DEFAULT 0,
            deleted_at TEXT,
            FOREIGN KEY(owner_id) REFERENCES owner(id),
            FOREIGN KEY(category_id) REFERENCES memory_categories(id)
        );

        CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
        CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category_id);
        CREATE INDEX IF NOT EXISTS idx_memories_owner ON memories(owner_id);

        CREATE TABLE IF NOT EXISTS memory_revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            memory_id INTEGER NOT NULL,
            revision_number INTEGER NOT NULL,
            previous_title TEXT NOT NULL,
            previous_content TEXT NOT NULL,
            previous_category_id INTEGER,
            previous_confidence REAL NOT NULL,
            previous_importance INTEGER NOT NULL,
            previous_status TEXT NOT NULL,
            changed_fields TEXT NOT NULL,
            change_reason TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(memory_id) REFERENCES memories(id),
            UNIQUE(memory_id, revision_number)
        );

        CREATE TABLE IF NOT EXISTS memory_relations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL DEFAULT 1,
            source_memory_id INTEGER NOT NULL,
            target_memory_id INTEGER NOT NULL,
            relation_type TEXT NOT NULL,
            strength REAL NOT NULL DEFAULT 0.7,
            description TEXT,
            created_at TEXT NOT NULL,
            deleted_at TEXT,
            FOREIGN KEY(owner_id) REFERENCES owner(id),
            FOREIGN KEY(source_memory_id) REFERENCES memories(id),
            FOREIGN KEY(target_memory_id) REFERENCES memories(id),
            UNIQUE(owner_id, source_memory_id, target_memory_id, relation_type, deleted_at)
        );

        CREATE INDEX IF NOT EXISTS idx_memory_relations_owner ON memory_relations(owner_id);
        CREATE INDEX IF NOT EXISTS idx_memory_relations_source ON memory_relations(source_memory_id);
        CREATE INDEX IF NOT EXISTS idx_memory_relations_target ON memory_relations(target_memory_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_relations_active_unique
            ON memory_relations(owner_id, source_memory_id, target_memory_id, relation_type)
            WHERE deleted_at IS NULL;

        CREATE TABLE IF NOT EXISTS document_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            original_filename TEXT NOT NULL,
            original_path TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            mime_type TEXT,
            status TEXT NOT NULL DEFAULT 'indexed',
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            FOREIGN KEY(document_id) REFERENCES documents(id),
            UNIQUE(content_hash)
        );

        CREATE INDEX IF NOT EXISTS idx_document_sources_status ON document_sources(status);

        CREATE TABLE IF NOT EXISTS document_pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            source_id INTEGER,
            page_number INTEGER NOT NULL,
            text TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(document_id) REFERENCES documents(id),
            FOREIGN KEY(source_id) REFERENCES document_sources(id),
            UNIQUE(document_id, page_number)
        );

        CREATE TABLE IF NOT EXISTS document_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            source_id INTEGER,
            page_id INTEGER,
            chunk_index INTEGER NOT NULL,
            text TEXT NOT NULL,
            lexical_text TEXT NOT NULL,
            start_char INTEGER NOT NULL DEFAULT 0,
            end_char INTEGER NOT NULL DEFAULT 0,
            relevance_hint TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(document_id) REFERENCES documents(id),
            FOREIGN KEY(source_id) REFERENCES document_sources(id),
            FOREIGN KEY(page_id) REFERENCES document_pages(id),
            UNIQUE(document_id, chunk_index)
        );

        CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON document_chunks(document_id);
        CREATE INDEX IF NOT EXISTS idx_document_chunks_page ON document_chunks(page_id);

        CREATE TABLE IF NOT EXISTS document_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chunk_id INTEGER NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            vector_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(chunk_id) REFERENCES document_chunks(id),
            UNIQUE(chunk_id, provider, model)
        );

        INSERT OR IGNORE INTO memory_categories (name, description, created_at)
        VALUES
            ('Preferencias', 'Categoria inicial: Preferencias', CURRENT_TIMESTAMP),
            ('Pessoas', 'Categoria inicial: Pessoas', CURRENT_TIMESTAMP),
            ('Projetos', 'Categoria inicial: Projetos', CURRENT_TIMESTAMP),
            ('Procedimentos', 'Categoria inicial: Procedimentos', CURRENT_TIMESTAMP),
            ('Trabalho', 'Categoria inicial: Trabalho', CURRENT_TIMESTAMP),
            ('Conhecimento', 'Categoria inicial: Conhecimento', CURRENT_TIMESTAMP),
            ('Decisoes', 'Categoria inicial: Decisoes', CURRENT_TIMESTAMP),
            ('Lembretes', 'Categoria inicial: Lembretes', CURRENT_TIMESTAMP),
            ('Configuracoes', 'Categoria inicial: Configuracoes', CURRENT_TIMESTAMP),
            ('Outros', 'Categoria inicial: Outros', CURRENT_TIMESTAMP);
    """,
}
