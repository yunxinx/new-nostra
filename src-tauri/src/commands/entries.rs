use serde::{Deserialize, Serialize};
use tauri::State;

use super::sessions::EntryDto;
use crate::db::repo::entries;
use crate::error::AppError;
use crate::state::AppState;
use crate::types::{ContentBlock, PathPage};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathPageDto {
    pub entries: Vec<EntryDto>,
    pub prev_cursor: Option<String>,
    pub next_cursor: Option<String>,
}

impl From<PathPage> for PathPageDto {
    fn from(page: PathPage) -> Self {
        PathPageDto {
            entries: page.entries.into_iter().map(Into::into).collect(),
            prev_cursor: page.prev_cursor,
            next_cursor: page.next_cursor,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendMessageParams {
    pub session_id: String,
    pub content: Vec<ContentBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadActivePathParams {
    pub session_id: String,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadActivePathCursorParams {
    pub session_id: String,
    pub cursor: String,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteEntryParams {
    pub session_id: String,
    pub entry_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetActiveLeafParams {
    pub session_id: String,
    pub entry_id: String,
}

#[tauri::command]
pub async fn append_message(
    state: State<'_, AppState>,
    params: AppendMessageParams,
) -> Result<EntryDto, AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "append_message",
        entries::append(&conn, &params.session_id, &params.content).map(Into::into),
    )
}

#[tauri::command]
pub async fn load_active_path(
    state: State<'_, AppState>,
    params: LoadActivePathParams,
) -> Result<PathPageDto, AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "load_active_path",
        entries::load_active_path(&conn, &params.session_id, params.limit).map(Into::into),
    )
}

#[tauri::command]
pub async fn load_active_path_before(
    state: State<'_, AppState>,
    params: LoadActivePathCursorParams,
) -> Result<PathPageDto, AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "load_active_path_before",
        entries::load_active_path_before(&conn, &params.session_id, &params.cursor, params.limit)
            .map(Into::into),
    )
}

#[tauri::command]
pub async fn load_active_path_after(
    state: State<'_, AppState>,
    params: LoadActivePathCursorParams,
) -> Result<PathPageDto, AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "load_active_path_after",
        entries::load_active_path_after(&conn, &params.session_id, &params.cursor, params.limit)
            .map(Into::into),
    )
}

#[tauri::command]
pub async fn delete_entry(
    state: State<'_, AppState>,
    params: DeleteEntryParams,
) -> Result<(), AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "delete_entry",
        entries::delete_entry(&conn, &params.session_id, &params.entry_id),
    )
}

#[tauri::command]
pub async fn set_active_leaf(
    state: State<'_, AppState>,
    params: SetActiveLeafParams,
) -> Result<(), AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "set_active_leaf",
        entries::set_active_leaf(&conn, &params.session_id, &params.entry_id),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Entry, MessageRole};

    #[test]
    fn path_page_dto_serializes_camel_case_contract_fields() {
        let page = PathPage {
            entries: vec![Entry {
                id: "e1".into(),
                parent_id: Some("e0".into()),
                role: MessageRole::User,
                content: vec![ContentBlock::Text { text: "hi".into(), provider_metadata: None }],
                created_at: "2024-01-01T00:00:00.000Z".into(),
            }],
            prev_cursor: Some("e0".into()),
            next_cursor: None,
        };

        let value = serde_json::to_value(PathPageDto::from(page)).unwrap();

        // Field names the TS mirror depends on; cursors serialize as explicit null.
        assert!(value["entries"].is_array());
        assert_eq!(value["prevCursor"], serde_json::json!("e0"));
        assert!(value["nextCursor"].is_null());
        assert!(value.get("prev_cursor").is_none());
        assert_eq!(value["entries"][0]["parentId"], serde_json::json!("e0"));
        assert_eq!(value["entries"][0]["role"], serde_json::json!("user"));
        assert_eq!(value["entries"][0]["type"], serde_json::json!("message"));
        assert_eq!(value["entries"][0]["createdAt"], serde_json::json!("2024-01-01T00:00:00.000Z"));
    }
}
