use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(rename_all = "camelCase")]
#[error("{message}")]
pub struct AppError {
    /// Stable machine code the frontend branches on (mirrored in types/ipc.ts).
    pub code: ErrorCode,
    /// Developer-facing diagnostics; user-facing copy comes from frontend i18n.
    pub message: String,
}

// Reason: contract surface mirrored in types/ipc.ts and locales errors.*; codes
// are produced by feature domains as they land (LLM/network, sessions, settings).
// Revoke when every variant is constructed on a production path.
#[allow(dead_code)]
#[derive(Debug, Error, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    #[error("database error")]
    Db,
    #[error("network error")]
    Network,
    #[error("provider protocol error")]
    Protocol,
    #[error("invalid configuration")]
    Config,
    #[error("not found")]
    NotFound,
    #[error("invalid input")]
    InvalidInput,
    #[error("internal error")]
    Internal,
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError { code: ErrorCode::Db, message: format!("database error: {err}") }
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        // Tauri errors here are path/identifier resolution failures, not runtime failures.
        AppError { code: ErrorCode::Config, message: format!("tauri error: {err}") }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_error_code_serializes_to_its_contract_string() {
        let expected = [
            (ErrorCode::Db, "db"),
            (ErrorCode::Network, "network"),
            (ErrorCode::Protocol, "protocol"),
            (ErrorCode::Config, "config"),
            (ErrorCode::NotFound, "not_found"),
            (ErrorCode::InvalidInput, "invalid_input"),
            (ErrorCode::Internal, "internal"),
        ];
        for (code, expected) in expected {
            let value = serde_json::to_value(code).unwrap();
            assert_eq!(value, serde_json::Value::String(expected.into()));
        }
    }

    #[test]
    fn app_error_serializes_camel_case_fields() {
        let err = AppError { code: ErrorCode::NotFound, message: "session gone".into() };
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "not_found");
        assert_eq!(json["message"], "session gone");
    }
}
