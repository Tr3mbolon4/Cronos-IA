MIGRATION = {
    "version": "0005_chat_conversations",
    "description": "Add owner and conversation isolation to chat messages.",
    "sql": """
        ALTER TABLE messages ADD COLUMN owner_id INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE messages ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'legacy';
        ALTER TABLE messages ADD COLUMN route TEXT;
        ALTER TABLE messages ADD COLUMN diagnostics_json TEXT;
        ALTER TABLE messages ADD COLUMN deleted_at TEXT;

        CREATE INDEX IF NOT EXISTS idx_messages_owner_conversation
            ON messages(owner_id, conversation_id, id);
        CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(deleted_at);
    """,
}
