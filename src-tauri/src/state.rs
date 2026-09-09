use rusqlite::Connection;
use tokio::sync::Mutex;

/// Global app state managed by Tauri. The connection is a single SQLite handle
/// guarded by a tokio Mutex so async commands can hold it across await points.
pub struct AppState {
    pub db: Mutex<Connection>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn db_connection_is_accessible_through_the_mutex() {
        let state = AppState { db: Mutex::new(Connection::open_in_memory().unwrap()) };
        // try_lock keeps the test free of a tokio runtime; sync-only feature is a
        // scaffold constraint.
        let version: u32 = state
            .db
            .try_lock()
            .unwrap()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 0);
    }
}
