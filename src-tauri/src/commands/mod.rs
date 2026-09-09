//! IPC boundary. `generate_handler!` below is the single command registry.

mod entries;
mod sessions;

use crate::error::{AppError, ErrorCode};
use tauri::ipc::Invoke;

/// The one command registry wired into `lib.rs`'s `invoke_handler`.
pub fn handler() -> impl Fn(Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        sessions::list_sessions,
        sessions::create_session,
        sessions::rename_session,
        sessions::set_session_pinned,
        sessions::delete_session,
        entries::append_message,
        entries::load_active_path,
        entries::load_active_path_before,
        entries::load_active_path_after,
        entries::delete_entry,
        entries::set_active_leaf,
    ]
}

/// Single point where command failures are logged: repo and domain layers
/// stay silent so an error is logged exactly once on its way out. Only
/// infrastructure failures qualify; NotFound/InvalidInput are expected
/// business flows and must not spam the error log.
fn is_infrastructure_failure(code: ErrorCode) -> bool {
    matches!(code, ErrorCode::Db | ErrorCode::Internal)
}

/// Wraps a command's result so `Db`/`Internal` failures reach the log
/// (command name + code + message) before propagating to the frontend.
/// Log content must stay free of user-authored text: messages, titles and
/// payload bodies never appear; AppError::message is technical by contract.
fn log_command_failures<T>(
    command: &'static str,
    result: Result<T, AppError>,
) -> Result<T, AppError> {
    if let Err(err) = &result {
        if is_infrastructure_failure(err.code) {
            log::error!("command `{command}` failed: code={:?}: {err}", err.code);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_infrastructure_codes_are_logged() {
        assert!(is_infrastructure_failure(ErrorCode::Db));
        assert!(is_infrastructure_failure(ErrorCode::Internal));
        for code in [
            ErrorCode::Network,
            ErrorCode::Protocol,
            ErrorCode::Config,
            ErrorCode::NotFound,
            ErrorCode::InvalidInput,
        ] {
            assert!(!is_infrastructure_failure(code));
        }
    }

    #[test]
    fn log_command_failures_passes_errors_through_unchanged() {
        let err = AppError { code: ErrorCode::InvalidInput, message: "limit out of range".into() };
        let result: Result<(), AppError> = log_command_failures("load_active_path", Err(err));
        let returned = result.unwrap_err();
        assert_eq!(returned.code, ErrorCode::InvalidInput);
        assert_eq!(returned.message, "limit out of range");
    }
}
