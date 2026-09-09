//! Connection management and migrations for the single SQLite database.

mod migrations;
pub mod repo;

use std::fs;
use std::path::PathBuf;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, ErrorCode};

pub use migrations::run_migrations;

const DB_FILE_NAME: &str = "nostra.db";

/// Opens (or creates) `app_data_dir()/nostra.db`, applies PRAGMAs and migrations.
/// Fails startup on any error rather than running against a degraded database.
pub fn init(app: &AppHandle) -> Result<Connection, AppError> {
    let dir: PathBuf = app.path().app_data_dir().map_err(|err| AppError {
        code: ErrorCode::Config,
        message: format!("cannot resolve app data dir: {err}"),
    })?;
    fs::create_dir_all(&dir).map_err(|err| AppError {
        code: ErrorCode::Db,
        message: format!("cannot create app data dir {}: {err}", dir.display()),
    })?;

    let conn = Connection::open(dir.join(DB_FILE_NAME))?;
    // WAL: fewer fssync and better crash behavior for a desktop app; busy_timeout
    // tolerates transient locks; foreign keys are enforced per-connection.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    // NORMAL skips WAL fsync on ordinary commits; power loss may roll back recent
    // commits, but ordinary app restart and process-crash recovery are preserved.
    conn.pragma_update(None, "synchronous", "NORMAL")?;

    run_migrations(&conn)?;
    log::info!("database ready at {}", dir.join(DB_FILE_NAME).display());
    Ok(conn)
}
