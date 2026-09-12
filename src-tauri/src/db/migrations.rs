use rusqlite::Connection;

use crate::error::{AppError, ErrorCode};

pub struct Migration {
    pub version: u32,
    pub description: &'static str,
    pub sql: &'static str,
}

/// Append-only migration timeline; `user_version` is the authoritative schema version.
pub const MIGRATIONS: &[Migration] = &[
    Migration {
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
    },
    // Protocol family names are an open set: `api`, `apis` and `compat` carry no
    // CHECK, so an unknown family is rejected by domain validation instead of the
    // schema and adding one stays a zero-migration change. Closed domains
    // (enabled, max_retries, reasoning_output, hide) keep their CHECK.
    Migration {
        version: 2,
        description: "create_provider_config_tables",
        sql: "
            CREATE TABLE providers (
                id                     TEXT PRIMARY KEY,
                name                   TEXT NOT NULL,
                api                    TEXT NOT NULL,
                base_url               TEXT NOT NULL,
                api_key                TEXT NOT NULL DEFAULT '',
                enabled                INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
                headers                TEXT NOT NULL DEFAULT '{}',
                compat                 TEXT,
                request_timeout_ms     INTEGER NOT NULL DEFAULT 120000,
                stream_idle_timeout_ms INTEGER NOT NULL DEFAULT 120000,
                max_retries            INTEGER NOT NULL DEFAULT 2 CHECK (max_retries BETWEEN 0 AND 4),
                abort_on_disconnect    INTEGER NOT NULL DEFAULT 1 CHECK (abort_on_disconnect IN (0, 1)),
                reasoning_output       TEXT NOT NULL DEFAULT 'auto'
                                       CHECK (reasoning_output IN ('auto', 'always', 'off')),
                created_at             TEXT NOT NULL,
                updated_at             TEXT NOT NULL
            ) STRICT;

            CREATE UNIQUE INDEX idx_providers_name ON providers(name);

            CREATE TABLE models (
                provider_id        TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
                id                 TEXT NOT NULL,
                name               TEXT,
                apis               TEXT NOT NULL DEFAULT '[]',
                aliases            TEXT NOT NULL DEFAULT '[]',
                base_url           TEXT,
                reasoning          INTEGER NOT NULL DEFAULT 0 CHECK (reasoning IN (0, 1)),
                thinking_level_map TEXT,
                input              TEXT NOT NULL DEFAULT '[\"text\"]',
                cost               TEXT,
                context_window     INTEGER,
                max_tokens         INTEGER,
                sampling_params    TEXT,
                headers            TEXT,
                compat             TEXT,
                sort_order         INTEGER NOT NULL,
                PRIMARY KEY (provider_id, id),
                UNIQUE (provider_id, sort_order)
            ) STRICT;

            CREATE TABLE unified_models (
                id   TEXT PRIMARY KEY,
                hide INTEGER NOT NULL DEFAULT 0 CHECK (hide IN (0, 1))
            ) STRICT;

            CREATE TABLE unified_model_members (
                unified_id  TEXT NOT NULL REFERENCES unified_models(id) ON DELETE CASCADE,
                provider_id TEXT NOT NULL,
                model       TEXT NOT NULL,
                position    INTEGER NOT NULL,
                PRIMARY KEY (unified_id, provider_id, model),
                UNIQUE (unified_id, position),
                FOREIGN KEY (provider_id, model) REFERENCES models(provider_id, id) ON DELETE CASCADE
            ) STRICT;

            CREATE TABLE default_models (
                singleton   INTEGER PRIMARY KEY CHECK (singleton = 1),
                provider_id TEXT NOT NULL,
                model_id    TEXT NOT NULL,
                FOREIGN KEY (provider_id, model_id) REFERENCES models(provider_id, id) ON DELETE CASCADE
            ) STRICT;
        ",
    },
    // Model aliases and the single default model are gone: a name now reaches
    // a downstream client through a unified model, and the app picks the model
    // it speaks to per conversation. Both are dropped here rather than left as
    // unread columns, so no code can start reading them again.
    Migration {
        version: 3,
        description: "drop_model_aliases_and_default_model",
        sql: "
            DROP TABLE default_models;
            ALTER TABLE models DROP COLUMN aliases;
        ",
    },
    Migration {
        version: 4,
        description: "drop_unified_model_hide",
        sql: "ALTER TABLE unified_models DROP COLUMN hide;",
    },
];

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
    use rusqlite::params;

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
        assert_eq!(version, 4);
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

    #[test]
    fn provider_tables_are_strict_with_expected_columns() {
        let conn = migrated_memory_db();
        let expected: [(&str, &[&str]); 4] = [
            (
                "providers",
                &[
                    "id",
                    "name",
                    "api",
                    "base_url",
                    "api_key",
                    "enabled",
                    "headers",
                    "compat",
                    "request_timeout_ms",
                    "stream_idle_timeout_ms",
                    "max_retries",
                    "abort_on_disconnect",
                    "reasoning_output",
                    "created_at",
                    "updated_at",
                ],
            ),
            (
                "models",
                &[
                    "provider_id",
                    "id",
                    "name",
                    "apis",
                    "base_url",
                    "reasoning",
                    "thinking_level_map",
                    "input",
                    "cost",
                    "context_window",
                    "max_tokens",
                    "sampling_params",
                    "headers",
                    "compat",
                    "sort_order",
                ],
            ),
            ("unified_models", &["id"]),
            ("unified_model_members", &["unified_id", "provider_id", "model", "position"]),
        ];

        for (table, columns) in expected {
            let strict: i64 = conn
                .query_row(
                    "SELECT strict FROM pragma_table_list WHERE name = ?1",
                    params![table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(strict, 1, "table {table} must be STRICT");

            let mut stmt =
                conn.prepare("SELECT name FROM pragma_table_info(?1) ORDER BY cid").unwrap();
            let actual: Vec<String> = stmt
                .query_map(params![table], |row| row.get(0))
                .unwrap()
                .map(|row| row.unwrap())
                .collect();
            let expected: Vec<String> = columns.iter().map(|column| column.to_string()).collect();
            assert_eq!(actual, expected, "columns of {table}");
        }
    }

    #[test]
    fn model_and_member_primary_keys_are_composite() {
        let conn = migrated_memory_db();
        let primary_key = |table: &str| -> Vec<String> {
            let mut stmt = conn
                .prepare("SELECT name FROM pragma_table_info(?1) WHERE pk > 0 ORDER BY pk")
                .unwrap();
            stmt.query_map(params![table], |row| row.get(0))
                .unwrap()
                .map(|row| row.unwrap())
                .collect()
        };

        assert_eq!(primary_key("models"), vec!["provider_id", "id"]);
        assert_eq!(
            primary_key("unified_model_members"),
            vec!["unified_id", "provider_id", "model"]
        );
    }

    #[test]
    fn provider_foreign_keys_cascade_from_their_parents() {
        let conn = migrated_memory_db();
        let foreign_keys = |table: &str| -> Vec<(String, String, String, String)> {
            let mut stmt = conn
                .prepare(
                    "SELECT \"table\", \"from\", \"to\", on_delete FROM pragma_foreign_key_list(?1)",
                )
                .unwrap();
            let mut keys: Vec<(String, String, String, String)> = stmt
                .query_map(params![table], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .unwrap()
                .map(|row| row.unwrap())
                .collect();
            keys.sort();
            keys
        };

        let cascade = |table: &str, from: &str, to: &str| {
            (table.to_string(), from.to_string(), to.to_string(), "CASCADE".to_string())
        };

        assert_eq!(foreign_keys("models"), vec![cascade("providers", "provider_id", "id")]);
        // The member pin is a composite foreign key into (provider_id, id), so its
        // two column pairs show up as two rows.
        let mut members = vec![
            cascade("unified_models", "unified_id", "id"),
            cascade("models", "provider_id", "provider_id"),
            cascade("models", "model", "id"),
        ];
        members.sort();
        assert_eq!(foreign_keys("unified_model_members"), members);
    }

    #[test]
    fn provider_unique_indexes_cover_the_ordering_columns() {
        let conn = migrated_memory_db();
        let unique_index_columns = |table: &str, origin: &str| -> Vec<Vec<String>> {
            let mut list = conn
                .prepare(
                    "SELECT name FROM pragma_index_list(?1)
                     WHERE \"unique\" = 1 AND origin = ?2 ORDER BY name",
                )
                .unwrap();
            let names: Vec<String> = list
                .query_map(params![table, origin], |row| row.get(0))
                .unwrap()
                .map(|row| row.unwrap())
                .collect();
            names
                .into_iter()
                .map(|name| {
                    let mut info = conn
                        .prepare("SELECT name FROM pragma_index_info(?1) ORDER BY seqno")
                        .unwrap();
                    info.query_map(params![name], |row| row.get::<_, String>(0))
                        .unwrap()
                        .map(|row| row.unwrap())
                        .collect()
                })
                .collect()
        };

        assert_eq!(unique_index_columns("providers", "c"), vec![vec!["name"]]);
        assert_eq!(unique_index_columns("models", "u"), vec![vec!["provider_id", "sort_order"]]);
        assert_eq!(
            unique_index_columns("unified_model_members", "u"),
            vec![vec!["unified_id", "position"]]
        );
        assert!(index_names(&conn).contains(&"idx_providers_name".to_string()));
    }

    #[test]
    fn provider_foreign_keys_are_enforced() {
        let conn = migrated_memory_db();
        conn.execute(
            "INSERT INTO providers (id, name, api, base_url, created_at, updated_at)
             VALUES ('p1', 'P', 'openai-completions', 'https://api.example.com', 't', 't')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO models (provider_id, id, sort_order) VALUES ('p1', 'm1', 0)", [])
            .unwrap();

        // Each insert below satisfies every other constraint, so the foreign key it
        // is meant to exercise is the only one that can reject it.
        let orphan_model = conn.execute(
            "INSERT INTO models (provider_id, id, sort_order) VALUES ('missing', 'm2', 0)",
            [],
        );
        assert!(orphan_model.is_err(), "model must reference an existing provider");

        let orphan_member = conn.execute(
            "INSERT INTO unified_model_members (unified_id, provider_id, model, position)
             VALUES ('missing', 'p1', 'm1', 0)",
            [],
        );
        assert!(orphan_member.is_err(), "member must reference an existing unified model");

        conn.execute("INSERT INTO unified_models (id) VALUES ('u1')", []).unwrap();
        let dangling_pin = conn.execute(
            "INSERT INTO unified_model_members (unified_id, provider_id, model, position)
             VALUES ('u1', 'p1', 'ghost', 0)",
            [],
        );
        assert!(dangling_pin.is_err(), "member must pin a registered model");

        conn.execute(
            "INSERT INTO unified_model_members (unified_id, provider_id, model, position)
             VALUES ('u1', 'p1', 'm1', 0)",
            [],
        )
        .unwrap();
    }

    #[test]
    fn unique_constraints_reject_duplicate_keys() {
        let conn = migrated_memory_db();
        let insert_provider = |id: &str, name: &str| {
            conn.execute(
                "INSERT INTO providers (id, name, api, base_url, created_at, updated_at)
                 VALUES (?1, ?2, 'openai-completions', 'https://api.example.com', 't', 't')",
                params![id, name],
            )
        };
        insert_provider("p1", "Primary").unwrap();
        assert!(insert_provider("p2", "Primary").is_err(), "provider names are unique");

        conn.execute("INSERT INTO models (provider_id, id, sort_order) VALUES ('p1', 'm1', 0)", [])
            .unwrap();
        let duplicate_sort_order = conn
            .execute("INSERT INTO models (provider_id, id, sort_order) VALUES ('p1', 'm2', 0)", []);
        assert!(duplicate_sort_order.is_err(), "sort_order is unique per provider");
        conn.execute("INSERT INTO models (provider_id, id, sort_order) VALUES ('p1', 'm2', 1)", [])
            .unwrap();

        conn.execute("INSERT INTO unified_models (id) VALUES ('u1')", []).unwrap();
        let insert_member = |model: &str, position: i64| {
            conn.execute(
                "INSERT INTO unified_model_members (unified_id, provider_id, model, position)
                 VALUES ('u1', 'p1', ?1, ?2)",
                params![model, position],
            )
        };
        insert_member("m1", 0).unwrap();
        let duplicate_position = insert_member("m2", 0);
        assert!(duplicate_position.is_err(), "member position is unique per aggregate");
        insert_member("m2", 1).unwrap();
    }

    #[test]
    fn closed_sets_are_rejected_by_check_constraints() {
        let conn = migrated_memory_db();
        conn.execute(
            "INSERT INTO providers (id, name, api, base_url, created_at, updated_at)
             VALUES ('p1', 'P', 'openai-completions', 'https://api.example.com', 't', 't')",
            [],
        )
        .unwrap();

        let rejects = |sql: &str| assert!(conn.execute(sql, []).is_err(), "must reject: {sql}");
        rejects("UPDATE providers SET reasoning_output = 'sometimes' WHERE id = 'p1'");
        rejects("UPDATE providers SET max_retries = 5 WHERE id = 'p1'");
        rejects("UPDATE providers SET enabled = 2 WHERE id = 'p1'");
        rejects("UPDATE providers SET abort_on_disconnect = 2 WHERE id = 'p1'");
        rejects(
            "INSERT INTO models (provider_id, id, sort_order, reasoning) VALUES ('p1', 'm1', 0, 2)",
        );
        conn.execute("INSERT INTO models (provider_id, id, sort_order) VALUES ('p1', 'm1', 0)", [])
            .unwrap();
    }

    #[test]
    fn protocol_columns_accept_names_outside_the_current_set() {
        let conn = migrated_memory_db();
        conn.execute(
            "INSERT INTO providers (id, name, api, base_url, created_at, updated_at)
             VALUES ('p1', 'P', 'gemini-native', 'https://api.example.com', 't', 't')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO models (provider_id, id, apis, sort_order)
             VALUES ('p1', 'm1', '[\"openai-completions\", \"future-family\"]', 0)",
            [],
        )
        .unwrap();

        let apis: String = conn
            .query_row("SELECT apis FROM models WHERE id = 'm1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(apis, "[\"openai-completions\", \"future-family\"]");
    }

    #[test]
    fn upgrading_a_v3_catalog_preserves_models_and_ordered_members() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        for migration in MIGRATIONS.iter().filter(|migration| migration.version <= 3) {
            conn.execute_batch(migration.sql).unwrap();
        }
        conn.pragma_update(None, "user_version", 3u32).unwrap();
        conn.execute_batch(
            "INSERT INTO providers (id, name, api, base_url, created_at, updated_at)
             VALUES ('p1', 'Saved provider', 'openai-completions', 'https://api.example.com', 't', 't');
             INSERT INTO models (provider_id, id, sort_order) VALUES ('p1', 'm1', 0), ('p1', 'm2', 1);
             INSERT INTO unified_models (id, hide) VALUES ('hidden', 1), ('visible', 0);
             INSERT INTO unified_model_members (unified_id, provider_id, model, position)
             VALUES ('hidden', 'p1', 'm2', 0), ('hidden', 'p1', 'm1', 1), ('visible', 'p1', 'm1', 0);",
        )
        .unwrap();

        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap();

        let columns: Vec<String> = conn
            .prepare("SELECT name FROM pragma_table_info('unified_models')")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(columns, ["id"]);
        let members: Vec<(String, String, String, i64)> = conn
            .prepare("SELECT unified_id, provider_id, model, position FROM unified_model_members ORDER BY unified_id, position")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            members,
            [
                ("hidden".into(), "p1".into(), "m2".into(), 0),
                ("hidden".into(), "p1".into(), "m1".into(), 1),
                ("visible".into(), "p1".into(), "m1".into(), 0),
            ]
        );
        let models: Vec<(String, String, i64)> = conn
            .prepare("SELECT providers.name, models.id, models.sort_order FROM models JOIN providers ON providers.id = models.provider_id ORDER BY models.sort_order")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            models,
            [("Saved provider".into(), "m1".into(), 0), ("Saved provider".into(), "m2".into(), 1),]
        );
        let foreign_key_errors: i64 = conn
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_key_errors, 0);
    }

    #[test]
    fn upgrading_a_v1_database_keeps_its_rows() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        // A v1 database is reproduced by applying migration 1 alone, not by
        // hand-writing DDL that could drift from the frozen migration text.
        conn.execute_batch(MIGRATIONS[0].sql).unwrap();
        conn.pragma_update(None, "user_version", 1u32).unwrap();
        conn.execute(
            "INSERT INTO sessions (id, title, pinned, active_leaf_id, created_at, updated_at)
             VALUES ('s1', 'kept', 0, NULL, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO entries (id, session_id, parent_id, type, payload, created_at)
             VALUES ('e1', 's1', NULL, 'message', '{\"role\":\"user\",\"content\":[]}',
                     '2024-01-01T00:00:00.000Z')",
            [],
        )
        .unwrap();

        run_migrations(&conn).unwrap();

        let version: u32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0)).unwrap();
        assert_eq!(version, 4);
        let title: String = conn
            .query_row("SELECT title FROM sessions WHERE id = 's1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(title, "kept");
        let entries: i64 = conn
            .query_row("SELECT COUNT(*) FROM entries WHERE session_id = 's1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(entries, 1);
        // The v2 tables are usable after the upgrade, and the fresh foreign keys
        // are live on the upgraded connection.
        conn.execute(
            "INSERT INTO providers (id, name, api, base_url, created_at, updated_at)
             VALUES ('p1', 'P', 'openai-completions', 'https://api.example.com', 't', 't')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO models (provider_id, id, sort_order) VALUES ('p1', 'm1', 0)", [])
            .unwrap();
    }
}
