use rusqlite::{params, Transaction};

use crate::error::{AppError, ErrorCode};
use crate::types::{ContentBlock, Entry, MessagePayload, MessageRole};

const ENTRY_TYPE_MESSAGE: &str = "message";

/// Rejects empty content and content whose text blocks are all whitespace.
/// Non-empty content is preserved verbatim, metadata included.
fn validate_content(content: &[ContentBlock]) -> Result<(), AppError> {
    if content.is_empty() {
        return Err(AppError {
            code: ErrorCode::InvalidInput,
            message: "message content must not be empty".into(),
        });
    }
    let has_text = content.iter().any(|block| {
        let ContentBlock::Text { text, .. } = block;
        !text.trim().is_empty()
    });
    if !has_text {
        return Err(AppError {
            code: ErrorCode::InvalidInput,
            message: "message content must contain non-whitespace text".into(),
        });
    }
    Ok(())
}

/// Confirms `parent_id` names an existing entry in the same session. An immutable
/// parent plus PK/FK constraints keep the graph acyclic without trusting a clock.
fn assert_parent_in_session(
    tx: &Transaction,
    session_id: &str,
    parent_id: &str,
) -> Result<(), AppError> {
    let belongs: bool = tx
        .query_row(
            "SELECT 1 FROM entries WHERE id = ?1 AND session_id = ?2",
            params![parent_id, session_id],
            |_| Ok(true),
        )
        .optional_owned()?
        .unwrap_or(false);
    if !belongs {
        return Err(AppError {
            code: ErrorCode::InvalidInput,
            message: "parent entry does not belong to this session".into(),
        });
    }
    Ok(())
}

/// The single in-transaction construction path shared by first-create and append.
/// `Some(parent)` creates a child under an existing node; `None` creates a root,
/// including a second root in the same session. Inserts the entry, advances the
/// session's active leaf to it, and bumps `updated_at` to `now`.
pub fn append_in_transaction(
    tx: &Transaction,
    session_id: &str,
    parent_id: Option<&str>,
    content: &[ContentBlock],
    now: &str,
) -> Result<Entry, AppError> {
    validate_content(content)?;
    if let Some(parent) = parent_id {
        assert_parent_in_session(tx, session_id, parent)?;
    }

    let id = uuid::Uuid::now_v7().to_string();
    let role = MessageRole::User;
    let payload = MessagePayload { role, content: content.to_vec() };
    let payload_json = serde_json::to_string(&payload).map_err(|err| AppError {
        code: ErrorCode::Internal,
        message: format!("cannot encode message payload: {err}"),
    })?;

    tx.prepare_cached(
        "INSERT INTO entries (id, session_id, parent_id, type, payload, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )?
    .execute(params![id, session_id, parent_id, ENTRY_TYPE_MESSAGE, payload_json, now])?;

    tx.prepare_cached("UPDATE sessions SET active_leaf_id = ?1, updated_at = ?2 WHERE id = ?3")?
        .execute(params![id, now, session_id])?;

    Ok(Entry {
        id,
        parent_id: parent_id.map(str::to_string),
        role,
        content: content.to_vec(),
        created_at: now.to_string(),
    })
}

/// Collects every entry id of a session paired with its depth, ordered deepest
/// first. Deleting in this order keeps each CASCADE shallow, so chains beyond the
/// SQLite trigger-recursion limit still delete.
pub fn collect_session_entry_ids_desc(
    tx: &Transaction,
    session_id: &str,
) -> Result<Vec<String>, AppError> {
    let mut stmt = tx.prepare_cached(
        "WITH RECURSIVE tree(id, depth) AS (
             SELECT id, 0 FROM entries WHERE session_id = ?1 AND parent_id IS NULL
             UNION ALL
             SELECT e.id, tree.depth + 1
             FROM entries e JOIN tree ON e.parent_id = tree.id
             WHERE e.session_id = ?1
         )
         SELECT id FROM tree ORDER BY depth DESC",
    )?;
    let ids = stmt
        .query_map(params![session_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

/// Deletes entries one id at a time in the given (deepest-first) order. Each
/// delete runs after its descendants are already gone, so no deep CASCADE fires.
pub fn delete_entries_in_order(tx: &Transaction, ids: &[String]) -> Result<(), AppError> {
    let mut stmt = tx.prepare_cached("DELETE FROM entries WHERE id = ?1")?;
    for id in ids {
        stmt.execute(params![id])?;
    }
    Ok(())
}

/// `rusqlite`'s `OptionalExtension::optional` consumes `self`; this local variant
/// keeps the query-row call site readable without importing the trait everywhere.
trait OptionalOwned<T> {
    fn optional_owned(self) -> Result<Option<T>, AppError>;
}

impl<T> OptionalOwned<T> for Result<T, rusqlite::Error> {
    fn optional_owned(self) -> Result<Option<T>, AppError> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(err.into()),
        }
    }
}
