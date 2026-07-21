MIGRATION = {
    "version": "0001_base_schema",
    "description": "Create CRONOS 0.1.x base tables.",
    "sql": """
        CREATE TABLE IF NOT EXISTS owner (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            pin_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            owner_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            locked_at TEXT,
            FOREIGN KEY(owner_id) REFERENCES owner(id)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            stored_path TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            detail TEXT,
            created_at TEXT NOT NULL
        );
    """,
}
