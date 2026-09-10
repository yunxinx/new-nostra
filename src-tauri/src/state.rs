use rusqlite::Connection;
use tokio::sync::Mutex;

/// Global app state managed by Tauri. The connection is a single SQLite handle
/// guarded by a tokio Mutex: a std Mutex guard is not Send, which would make
/// async command futures non-Send. The critical section is the synchronous repo
/// call itself; no await happens while the guard is held.
pub struct AppState {
    pub db: Mutex<Connection>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn db_connection_is_accessible_through_the_mutex() {
        let state = AppState { db: Mutex::new(Connection::open_in_memory().unwrap()) };
        // try_lock keeps the test free of a tokio runtime; the tokio dep enables
        // only the sync feature, so no runtime exists to borrow.
        let version: u32 = state
            .db
            .try_lock()
            .unwrap()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 0);
    }
}
