use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::repo::sessions;
use crate::error::AppError;
use crate::state::AppState;
use crate::types::{ContentBlock, CreatedSession, Session, SessionCursor, SessionPage};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDto {
    pub id: String,
    pub title: String,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<Session> for SessionDto {
    fn from(session: Session) -> Self {
        SessionDto {
            id: session.id,
            title: session.title,
            pinned: session.pinned,
            created_at: session.created_at,
            updated_at: session.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCursorDto {
    pub updated_at: String,
    pub id: String,
}

impl From<SessionCursor> for SessionCursorDto {
    fn from(cursor: SessionCursor) -> Self {
        SessionCursorDto { updated_at: cursor.updated_at, id: cursor.id }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPageDto {
    pub sessions: Vec<SessionDto>,
    pub next_cursor: Option<SessionCursorDto>,
}

impl From<SessionPage> for SessionPageDto {
    fn from(page: SessionPage) -> Self {
        SessionPageDto {
            sessions: page.sessions.into_iter().map(Into::into).collect(),
            next_cursor: page.next_cursor.map(Into::into),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryDto {
    pub id: String,
    pub parent_id: Option<String>,
    pub role: crate::types::MessageRole,
    #[serde(rename = "type")]
    pub kind: String,
    pub content: Vec<ContentBlock>,
    pub created_at: String,
}

impl From<crate::types::Entry> for EntryDto {
    fn from(entry: crate::types::Entry) -> Self {
        EntryDto {
            id: entry.id,
            parent_id: entry.parent_id,
            role: entry.role,
            kind: "message".into(),
            content: entry.content,
            created_at: entry.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedSessionDto {
    pub session: SessionDto,
    pub entry: EntryDto,
}

impl From<CreatedSession> for CreatedSessionDto {
    fn from(created: CreatedSession) -> Self {
        CreatedSessionDto { session: created.session.into(), entry: created.entry.into() }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsParams {
    pub pinned: bool,
    pub cursor: Option<SessionCursorParam>,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCursorParam {
    pub updated_at: String,
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionParams {
    pub title: String,
    pub content: Vec<ContentBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameSessionParams {
    pub session_id: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSessionPinnedParams {
    pub session_id: String,
    pub pinned: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSessionParams {
    pub session_id: String,
}

#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppState>,
    params: ListSessionsParams,
) -> Result<SessionPageDto, AppError> {
    let cursor = params.cursor.map(|c| SessionCursor { updated_at: c.updated_at, id: c.id });
    let conn = state.db.lock().await;
    Ok(sessions::list(&conn, params.pinned, cursor.as_ref(), params.limit)?.into())
}

#[tauri::command]
pub async fn create_session(
    state: State<'_, AppState>,
    params: CreateSessionParams,
) -> Result<CreatedSessionDto, AppError> {
    let conn = state.db.lock().await;
    Ok(sessions::create(&conn, &params.title, &params.content)?.into())
}

#[tauri::command]
pub async fn rename_session(
    state: State<'_, AppState>,
    params: RenameSessionParams,
) -> Result<(), AppError> {
    let conn = state.db.lock().await;
    sessions::rename(&conn, &params.session_id, &params.title)
}

#[tauri::command]
pub async fn set_session_pinned(
    state: State<'_, AppState>,
    params: SetSessionPinnedParams,
) -> Result<(), AppError> {
    let conn = state.db.lock().await;
    sessions::set_pinned(&conn, &params.session_id, params.pinned)
}

#[tauri::command]
pub async fn delete_session(
    state: State<'_, AppState>,
    params: DeleteSessionParams,
) -> Result<(), AppError> {
    let conn = state.db.lock().await;
    sessions::delete(&conn, &params.session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Entry, MessageRole};

    #[test]
    fn created_session_dto_serializes_camel_case_contract_fields() {
        let created = CreatedSession {
            session: Session {
                id: "s1".into(),
                title: "t".into(),
                pinned: false,
                created_at: "2024-01-01T00:00:00.000Z".into(),
                updated_at: "2024-01-01T00:00:00.000Z".into(),
            },
            entry: Entry {
                id: "e1".into(),
                parent_id: None,
                role: MessageRole::User,
                content: vec![ContentBlock::Text { text: "hi".into(), provider_metadata: None }],
                created_at: "2024-01-01T00:00:00.000Z".into(),
            },
        };

        let value = serde_json::to_value(CreatedSessionDto::from(created)).unwrap();

        // Session DTO field names the TS mirror depends on.
        assert!(value["session"]["createdAt"].is_string());
        assert!(value["session"]["updatedAt"].is_string());
        assert!(value["session"].get("created_at").is_none());
        // Entry DTO: role decoded from payload, entry id preserved, `type` tag,
        // camelCase parentId, ordered content blocks.
        assert_eq!(value["entry"]["role"], serde_json::json!("user"));
        assert_eq!(value["entry"]["id"], serde_json::json!("e1"));
        assert_eq!(value["entry"]["type"], serde_json::json!("message"));
        assert!(value["entry"]["parentId"].is_null());
        assert_eq!(value["entry"]["content"][0]["type"], serde_json::json!("text"));
    }
}
