use rusqlite::Connection;

use crate::error::{AppError, ErrorCode};

pub struct Migration {
    pub version: u32,
    pub description: &'static str,
    pub sql: &'static str,
}

/// Append-only migration timeline; `user_version` is the authoritative schema version.
pub const MIGRATIONS: &[Migration] = &[];

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

    #[test]
    fn fresh_database_runs_to_latest() {
        let conn = Connection::open_in_memory().unwrap();
        assert!(run_migrations(&conn).is_ok());
        let version: u32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0)).unwrap();
        assert_eq!(version, MIGRATIONS.iter().map(|m| m.version).max().unwrap_or(0));
    }

    #[test]
    fn database_from_newer_binary_is_rejected() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 999).unwrap();
        let err = run_migrations(&conn).unwrap_err();
        assert_eq!(err.code, ErrorCode::Db);
    }
}
