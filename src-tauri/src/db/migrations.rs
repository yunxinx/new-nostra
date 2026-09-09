use rusqlite::Connection;

use crate::error::{AppError, ErrorCode};

pub struct Migration {
    pub version: u32,
    pub description: &'static str,
    pub sql: &'static str,
}

/// Append-only migration timeline; `user_version` is the authoritative schema version.
pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    description: "create_sessions_and_entries",
    sql: "
        CREATE TABLE sessions (
            id             TEXT PRIMARY KEY,
            title          TEXT NOT NULL,
            pinned         INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
            active_leaf_id TEXT,
            created_at     TEXT NOT NULL,
            updated_at     TEXT NOT NULL
        ) STRICT;

        CREATE TABLE entries (
            id         TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            parent_id  TEXT REFERENCES entries(id) ON DELETE CASCADE,
            type       TEXT NOT NULL,
            payload    TEXT NOT NULL,
            created_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX idx_sessions_pinned_updated_id
            ON sessions(pinned, updated_at DESC, id DESC);
        CREATE INDEX idx_entries_session_parent
            ON entries(session_id, parent_id);
        CREATE INDEX idx_entries_parent
            ON entries(parent_id);
    ",
}];

pub fn run_migrations(conn: &Connection) -> Result<(), AppError> {
    let current: u32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let known = MIGRATIONS.iter().map(|m| m.version).max().unwrap_or(0);

    // Old binaries reinstalled over a newer schema would corrupt data; refuse to guess.
    if current > known {
        return Err(AppError {
            code: ErrorCode::Db,
            message: format!(
                "database schema version {current} is newer than supported version {known}"
            ),
        });
    }

    for migration in MIGRATIONS.iter().filter(|m| m.version > current) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(migration.sql)?;
        tx.pragma_update(None, "user_version", migration.version)?;
        tx.commit()?;
        log::info!(
            "applied migration version={} description={}",
            migration.version,
            migration.description
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn migrated_memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    fn table_names(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap();
        let rows = stmt.query_map([], |row| row.get::<_, String>(0)).unwrap();
        rows.map(|r| r.unwrap()).collect()
    }

    fn index_names(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .unwrap();
        let rows = stmt.query_map([], |row| row.get::<_, String>(0)).unwrap();
        rows.map(|r| r.unwrap()).collect()
    }

    #[test]
    fn fresh_database_runs_to_latest() {
        let conn = migrated_memory_db();
        let version: u32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0)).unwrap();
        assert_eq!(version, 1);
    }

    #[test]
    fn database_from_newer_binary_is_rejected() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 999).unwrap();
        let err = run_migrations(&conn).unwrap_err();
        assert_eq!(err.code, ErrorCode::Db);
    }

    #[test]
    fn both_business_tables_exist() {
        let conn = migrated_memory_db();
        let tables = table_names(&conn);
        assert!(tables.contains(&"sessions".to_string()));
        assert!(tables.contains(&"entries".to_string()));
    }

    #[test]
    fn all_three_indexes_exist() {
        let conn = migrated_memory_db();
        let indexes = index_names(&conn);
        assert!(indexes.contains(&"idx_sessions_pinned_updated_id".to_string()));
        assert!(indexes.contains(&"idx_entries_session_parent".to_string()));
        assert!(indexes.contains(&"idx_entries_parent".to_string()));
    }

    #[test]
    fn both_tables_are_strict() {
        let conn = migrated_memory_db();
        let mut stmt = conn
            .prepare(
                "SELECT name, strict FROM pragma_table_list WHERE name IN ('sessions', 'entries')",
            )
            .unwrap();
        let rows: Vec<(String, i64)> = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(rows.len(), 2);
        for (name, strict) in rows {
            assert_eq!(strict, 1, "table {name} must be STRICT");
        }
    }

    #[test]
    fn sessions_columns_match_schema() {
        let conn = migrated_memory_db();
        let mut stmt =
            conn.prepare("SELECT name FROM pragma_table_info('sessions') ORDER BY cid").unwrap();
        let cols: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(
            cols,
            vec!["id", "title", "pinned", "active_leaf_id", "created_at", "updated_at"]
        );
    }

    #[test]
    fn entries_columns_match_schema() {
        let conn = migrated_memory_db();
        let mut stmt =
            conn.prepare("SELECT name FROM pragma_table_info('entries') ORDER BY cid").unwrap();
        let cols: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(cols, vec!["id", "session_id", "parent_id", "type", "payload", "created_at"]);
    }

    #[test]
    fn entries_foreign_keys_cascade_on_both_references() {
        let conn = migrated_memory_db();
        let mut stmt = conn
            .prepare("SELECT \"table\", \"from\", \"to\", on_delete FROM pragma_foreign_key_list('entries')")
            .unwrap();
        let fks: Vec<(String, String, String, String)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert!(fks.iter().any(|(t, from, to, on_delete)| t == "sessions"
            && from == "session_id"
            && to == "id"
            && on_delete == "CASCADE"));
        assert!(fks.iter().any(|(t, from, to, on_delete)| t == "entries"
            && from == "parent_id"
            && to == "id"
            && on_delete == "CASCADE"));
    }

    #[test]
    fn foreign_keys_are_enforced_on_test_connection() {
        let conn = migrated_memory_db();
        let orphan = conn.execute(
            "INSERT INTO entries (id, session_id, parent_id, type, payload, created_at)
             VALUES ('e1', 'missing', NULL, 'message', '{}', '2024-01-01T00:00:00.000Z')",
            [],
        );
        assert!(orphan.is_err(), "foreign key must reject an orphan entry");
    }
}
