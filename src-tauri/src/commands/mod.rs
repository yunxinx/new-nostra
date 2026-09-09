//! IPC boundary. `generate_handler!` below is the single command registry.

mod sessions;

use tauri::ipc::Invoke;

/// The one command registry wired into `lib.rs`'s `invoke_handler`.
pub fn handler() -> impl Fn(Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        sessions::list_sessions,
        sessions::create_session,
        sessions::rename_session,
        sessions::set_session_pinned,
        sessions::delete_session,
    ]
}
