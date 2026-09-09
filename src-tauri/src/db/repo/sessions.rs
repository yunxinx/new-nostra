use rusqlite::{params, Connection, Row};

use crate::db::repo::entries;
use crate::error::{AppError, ErrorCode};
use crate::types::{ContentBlock, CreatedSession, Session, SessionCursor, SessionPage};

const MAX_PAGE_SIZE: u32 = 50;

fn clamp_limit(limit: Option<u32>) -> u32 {
    limit.unwrap_or(MAX_PAGE_SIZE).clamp(1, MAX_PAGE_SIZE)
}

fn row_to_session(row: &Row) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get("id")?,
        title: row.get("title")?,
        pinned: row.get::<_, i64>("pinned")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// Atomically inserts a session and its first user message in one transaction.
/// A failure at any step, including commit, leaves neither row behind.
pub fn create(
    conn: &Connection,
    title: &str,
    content: &[ContentBlock],
) -> Result<CreatedSession, AppError> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err(AppError {
            code: ErrorCode::InvalidInput,
            message: "session title must not be blank".into(),
        });
    }

    let tx = conn.unchecked_transaction()?;
    let now = entries::now_utc(&tx)?;
    let id = uuid::Uuid::now_v7().to_string();

    tx.prepare_cached(
        "INSERT INTO sessions (id, title, pinned, active_leaf_id, created_at, updated_at)
         VALUES (?1, ?2, 0, NULL, ?3, ?3)",
    )?
    .execute(params![id, trimmed, now])?;

    let entry = entries::append_in_transaction(&tx, &id, None, content, &now)?;
    let session = Session {
        id,
        title: trimmed.to_string(),
        pinned: false,
        created_at: now.clone(),
        updated_at: now,
    };
    tx.commit()?;
    Ok(CreatedSession { session, entry })
}

/// Keyset pagination within a single `pinned` filter, ordered `(updated_at DESC,
/// id DESC)`. Fetches limit+1 to derive `next_cursor`.
pub fn list(
    conn: &Connection,
    pinned: bool,
    cursor: Option<&SessionCursor>,
    limit: Option<u32>,
) -> Result<SessionPage, AppError> {
    let limit = clamp_limit(limit);
    let probe = i64::from(limit) + 1;
    let pinned_flag = i64::from(pinned);

    let mut sessions: Vec<Session> = match cursor {
        Some(cursor) => {
            let mut stmt = conn.prepare_cached(
                "SELECT id, title, pinned, active_leaf_id, created_at, updated_at
                 FROM sessions
                 WHERE pinned = ?1 AND (updated_at, id) < (?2, ?3)
                 ORDER BY updated_at DESC, id DESC
                 LIMIT ?4",
            )?;
            let rows = stmt
                .query_map(
                    params![pinned_flag, cursor.updated_at, cursor.id, probe],
                    row_to_session,
                )?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        }
        None => {
            let mut stmt = conn.prepare_cached(
                "SELECT id, title, pinned, active_leaf_id, created_at, updated_at
                 FROM sessions
                 WHERE pinned = ?1
                 ORDER BY updated_at DESC, id DESC
                 LIMIT ?2",
            )?;
            let rows = stmt
                .query_map(params![pinned_flag, probe], row_to_session)?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        }
    };

    let next_cursor = if sessions.len() as i64 > i64::from(limit) {
        sessions.truncate(limit as usize);
        sessions
            .last()
            .map(|s| SessionCursor { updated_at: s.updated_at.clone(), id: s.id.clone() })
    } else {
        None
    };

    Ok(SessionPage { sessions, next_cursor })
}

/// Renames a session without touching `updated_at`; a rename must not reorder the
/// list. Rejects a blank title.
pub fn rename(conn: &Connection, session_id: &str, title: &str) -> Result<(), AppError> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err(AppError {
            code: ErrorCode::InvalidInput,
            message: "session title must not be blank".into(),
        });
    }
    let changed = conn
        .prepare_cached("UPDATE sessions SET title = ?1 WHERE id = ?2")?
        .execute(params![trimmed, session_id])?;
    if changed == 0 {
        return Err(AppError { code: ErrorCode::NotFound, message: "session not found".into() });
    }
    Ok(())
}

/// Toggles pinned without touching `updated_at`; pinning only moves a session
/// between groups, it does not reorder within a group.
pub fn set_pinned(conn: &Connection, session_id: &str, pinned: bool) -> Result<(), AppError> {
    let changed = conn
        .prepare_cached("UPDATE sessions SET pinned = ?1 WHERE id = ?2")?
        .execute(params![i64::from(pinned), session_id])?;
    if changed == 0 {
        return Err(AppError { code: ErrorCode::NotFound, message: "session not found".into() });
    }
    Ok(())
}

/// Deletes an entire session forest in one transaction: clears the active leaf,
/// removes every entry deepest-first (never a deep CASCADE), confirms the session
/// is empty, then deletes the session row.
pub fn delete(conn: &Connection, session_id: &str) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;

    let exists: bool = tx
        .query_row("SELECT 1 FROM sessions WHERE id = ?1", params![session_id], |_| Ok(true))
        .map(Some)
        .or_else(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(AppError::from(other)),
        })?
        .unwrap_or(false);
    if !exists {
        return Err(AppError { code: ErrorCode::NotFound, message: "session not found".into() });
    }

    tx.execute("UPDATE sessions SET active_leaf_id = NULL WHERE id = ?1", params![session_id])?;

    let ids = entries::collect_session_entry_ids_desc(&tx, session_id)?;
    entries::delete_entries_in_order(&tx, &ids)?;

    let remaining: i64 = tx.query_row(
        "SELECT COUNT(*) FROM entries WHERE session_id = ?1",
        params![session_id],
        |row| row.get(0),
    )?;
    if remaining != 0 {
        return Err(AppError {
            code: ErrorCode::Internal,
            message: "session still has entries after ordered delete".into(),
        });
    }

    tx.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::run_migrations;
    use crate::types::MessageRole;

    fn read_session(conn: &Connection, session_id: &str) -> Result<Session, AppError> {
        conn.query_row(
            "SELECT id, title, pinned, active_leaf_id, created_at, updated_at
             FROM sessions WHERE id = ?1",
            params![session_id],
            row_to_session,
        )
        .map_err(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError { code: ErrorCode::NotFound, message: "session not found".into() }
            }
            other => other.into(),
        })
    }

    fn text(body: &str) -> Vec<ContentBlock> {
        vec![ContentBlock::Text { text: body.into(), provider_metadata: None }]
    }

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    /// Appends a linear chain of `len` entries under the session's current leaf,
    /// returning the deepest entry id. Uses a fresh transaction per append to
    /// mirror production write granularity.
    fn append_chain(conn: &Connection, session_id: &str, len: usize) {
        for i in 0..len {
            let tx = conn.unchecked_transaction().unwrap();
            let now = entries::now_utc(&tx).unwrap();
            let leaf: Option<String> = tx
                .query_row(
                    "SELECT active_leaf_id FROM sessions WHERE id = ?1",
                    params![session_id],
                    |row| row.get(0),
                )
                .unwrap();
            entries::append_in_transaction(
                &tx,
                session_id,
                leaf.as_deref(),
                &text(&format!("m{i}")),
                &now,
            )
            .unwrap();
            tx.commit().unwrap();
        }
    }

    #[test]
    fn create_writes_session_and_first_entry_atomically() {
        let conn = memory_db();
        let created = create(&conn, "Hello", &text("hi there")).unwrap();
        assert_eq!(created.session.title, "Hello");
        assert_eq!(created.entry.role, MessageRole::User);

        let active_leaf: Option<String> = conn
            .query_row(
                "SELECT active_leaf_id FROM sessions WHERE id = ?1",
                params![created.session.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(active_leaf.as_deref(), Some(created.entry.id.as_str()));

        let sessions: i64 =
            conn.query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0)).unwrap();
        let entries_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM entries", [], |r| r.get(0)).unwrap();
        assert_eq!(sessions, 1);
        assert_eq!(entries_count, 1);
    }

    #[test]
    fn create_rejects_blank_title() {
        let conn = memory_db();
        let err = create(&conn, "   ", &text("hi")).unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidInput);
    }

    #[test]
    fn create_rejects_whitespace_only_content() {
        let conn = memory_db();
        let err = create(&conn, "Title", &text("   ")).unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidInput);
        let sessions: i64 =
            conn.query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0)).unwrap();
        assert_eq!(sessions, 0, "rejected create must not leave a session row");
    }

    #[test]
    fn first_send_failure_rolls_back_both_tables() {
        let conn = memory_db();
        // A trigger that fails on entry insert simulates a mid-transaction failure
        // after the session row is already inserted in the same transaction.
        conn.execute(
            "CREATE TRIGGER fail_entry_insert BEFORE INSERT ON entries
             BEGIN SELECT RAISE(ABORT, 'injected'); END",
            [],
        )
        .unwrap();

        let result = create(&conn, "Title", &text("hi"));
        assert!(result.is_err());

        let sessions: i64 =
            conn.query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0)).unwrap();
        let entries_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM entries", [], |r| r.get(0)).unwrap();
        assert_eq!(sessions, 0);
        assert_eq!(entries_count, 0);
    }

    #[test]
    fn rename_and_pin_do_not_bump_updated_at() {
        let conn = memory_db();
        let created = create(&conn, "Old", &text("hi")).unwrap();
        let original_updated = created.session.updated_at.clone();

        rename(&conn, &created.session.id, "New").unwrap();
        set_pinned(&conn, &created.session.id, true).unwrap();

        let after = read_session(&conn, &created.session.id).unwrap();
        assert_eq!(after.title, "New");
        assert!(after.pinned);
        assert_eq!(after.updated_at, original_updated);
    }

    #[test]
    fn rename_rejects_blank_title() {
        let conn = memory_db();
        let created = create(&conn, "Keep", &text("hi")).unwrap();
        let err = rename(&conn, &created.session.id, "  ").unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidInput);
    }

    #[test]
    fn missing_session_operations_report_not_found() {
        let conn = memory_db();
        assert_eq!(rename(&conn, "nope", "x").unwrap_err().code, ErrorCode::NotFound);
        assert_eq!(set_pinned(&conn, "nope", true).unwrap_err().code, ErrorCode::NotFound);
        assert_eq!(delete(&conn, "nope").unwrap_err().code, ErrorCode::NotFound);
    }

    #[test]
    fn keyset_paginates_equal_timestamps_across_three_pages_without_gaps() {
        let conn = memory_db();
        // Insert sessions sharing one updated_at so ordering falls entirely to id.
        let shared_ts = "2024-01-01T00:00:00.000Z";
        let mut ids: Vec<String> = Vec::new();
        for _ in 0..7 {
            let id = uuid::Uuid::now_v7().to_string();
            conn.execute(
                "INSERT INTO sessions (id, title, pinned, active_leaf_id, created_at, updated_at)
                 VALUES (?1, 't', 0, NULL, ?2, ?2)",
                params![id, shared_ts],
            )
            .unwrap();
            ids.push(id);
        }

        let mut seen: Vec<String> = Vec::new();
        let mut cursor: Option<SessionCursor> = None;
        loop {
            let page = list(&conn, false, cursor.as_ref(), Some(3)).unwrap();
            for s in &page.sessions {
                assert_eq!(s.updated_at, shared_ts);
                seen.push(s.id.clone());
            }
            match page.next_cursor {
                Some(next) => cursor = Some(next),
                None => break,
            }
        }

        assert_eq!(seen.len(), 7, "all sessions read exactly once");
        let mut unique = seen.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(unique.len(), 7, "no duplicates across pages");

        // id DESC ordering across the whole scan.
        let mut expected = ids.clone();
        expected.sort();
        expected.reverse();
        assert_eq!(seen, expected);
    }

    #[test]
    fn list_filters_by_pinned() {
        let conn = memory_db();
        let a = create(&conn, "plain", &text("hi")).unwrap();
        let b = create(&conn, "fav", &text("hi")).unwrap();
        set_pinned(&conn, &b.session.id, true).unwrap();

        let plain = list(&conn, false, None, None).unwrap();
        let pinned = list(&conn, true, None, None).unwrap();
        assert_eq!(plain.sessions.len(), 1);
        assert_eq!(plain.sessions[0].id, a.session.id);
        assert_eq!(pinned.sessions.len(), 1);
        assert_eq!(pinned.sessions[0].id, b.session.id);
    }

    #[test]
    fn delete_clears_deep_multi_root_forest_beyond_trigger_recursion_limit() {
        let conn = memory_db();
        let created = create(&conn, "deep", &text("root-a")).unwrap();
        let session_id = &created.session.id;

        // First root already exists (from create). Grow it past the SQLite trigger
        // recursion depth (default 1000) to prove ordered delete, not CASCADE.
        append_chain(&conn, session_id, 1500);

        // A second, independent root with its own branch.
        {
            let tx = conn.unchecked_transaction().unwrap();
            let now = entries::now_utc(&tx).unwrap();
            let root_b =
                entries::append_in_transaction(&tx, session_id, None, &text("root-b"), &now)
                    .unwrap();
            entries::append_in_transaction(
                &tx,
                session_id,
                Some(&root_b.id),
                &text("b-child"),
                &now,
            )
            .unwrap();
            tx.commit().unwrap();
        }

        let before: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM entries WHERE session_id = ?1",
                params![session_id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(before >= 1503, "expected deep multi-root forest, got {before}");

        delete(&conn, session_id).unwrap();

        let entries_left: i64 =
            conn.query_row("SELECT COUNT(*) FROM entries", [], |r| r.get(0)).unwrap();
        let sessions_left: i64 =
            conn.query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0)).unwrap();
        assert_eq!(entries_left, 0);
        assert_eq!(sessions_left, 0);

        let orphans: i64 = conn
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0))
            .unwrap();
        assert_eq!(orphans, 0, "foreign key check must find no orphans");
    }

    #[test]
    fn delete_leaves_other_sessions_untouched() {
        let conn = memory_db();
        let keep = create(&conn, "keep", &text("hi")).unwrap();
        let drop = create(&conn, "drop", &text("hi")).unwrap();
        append_chain(&conn, &drop.session.id, 5);

        delete(&conn, &drop.session.id).unwrap();

        let keep_entries: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM entries WHERE session_id = ?1",
                params![keep.session.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(keep_entries, 1);
        assert!(read_session(&conn, &keep.session.id).is_ok());
    }
}
