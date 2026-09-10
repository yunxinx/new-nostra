use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::error::{AppError, ErrorCode};
use crate::types::{ContentBlock, Entry, MessagePayload, MessageRole, PathPage};

const ENTRY_TYPE_MESSAGE: &str = "message";
const MAX_PATH_PAGE_SIZE: i64 = 50;

/// SQLite-generated RFC 3339 UTC timestamp with fixed millisecond precision, so
/// lexical order equals chronological order. Taken once per transaction.
pub(super) fn now_utc(conn: &Connection) -> Result<String, AppError> {
    Ok(conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| row.get(0))?)
}

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
        .optional()?
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
pub(super) fn append_in_transaction(
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
pub(super) fn collect_session_entry_ids_desc(
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
pub(super) fn delete_entries_in_order(tx: &Transaction, ids: &[String]) -> Result<(), AppError> {
    let mut stmt = tx.prepare_cached("DELETE FROM entries WHERE id = ?1")?;
    for id in ids {
        stmt.execute(params![id])?;
    }
    Ok(())
}

/// Appends a user message under the session's current active leaf in one
/// transaction: reads the leaf as the parent, then runs the shared in-transaction
/// construction path. A missing session is `NotFound`.
pub fn append(
    conn: &Connection,
    session_id: &str,
    content: &[ContentBlock],
) -> Result<Entry, AppError> {
    let tx = conn.unchecked_transaction()?;
    let active_leaf: Option<String> = tx
        .query_row(
            "SELECT active_leaf_id FROM sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| AppError {
            code: ErrorCode::NotFound,
            message: "session not found".into(),
        })?;
    let now = now_utc(&tx)?;
    let entry = append_in_transaction(&tx, session_id, active_leaf.as_deref(), content, &now)?;
    tx.commit()?;
    Ok(entry)
}

/// Moves the active-leaf pointer to an existing entry of the same session.
/// Creates no node and does not bump `updated_at`: switching branches must not
/// reorder the session list. A foreign or missing entry is `NotFound`.
pub fn set_active_leaf(
    conn: &Connection,
    session_id: &str,
    entry_id: &str,
) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;
    let belongs: Option<i64> = tx
        .query_row(
            "SELECT 1 FROM entries WHERE id = ?1 AND session_id = ?2",
            params![entry_id, session_id],
            |row| row.get(0),
        )
        .optional()?;
    if belongs.is_none() {
        return Err(AppError {
            code: ErrorCode::NotFound,
            message: "entry does not belong to this session".into(),
        });
    }
    let changed = tx
        .prepare_cached("UPDATE sessions SET active_leaf_id = ?1 WHERE id = ?2")?
        .execute(params![entry_id, session_id])?;
    // A session row always exists for an entry that belongs to it (FK), so zero
    // changed rows cannot occur without concurrent interference inside the tx.
    if changed == 0 {
        return Err(AppError { code: ErrorCode::NotFound, message: "session not found".into() });
    }
    Ok(tx.commit()?)
}

/// Collects the subtree rooted at `entry_id` (ids only), deepest first, always
/// restricted to `session_id`. Used by `delete_entry` for ordered deletion.
fn collect_subtree_ids_desc(
    tx: &Transaction,
    session_id: &str,
    entry_id: &str,
) -> Result<Vec<String>, AppError> {
    let mut stmt = tx.prepare_cached(
        "WITH RECURSIVE subtree(id, depth) AS (
             SELECT id, 0 FROM entries WHERE id = ?1 AND session_id = ?2
             UNION ALL
             SELECT e.id, subtree.depth + 1
             FROM entries e JOIN subtree ON e.parent_id = subtree.id
             WHERE e.session_id = ?2
         )
         SELECT id FROM subtree ORDER BY depth DESC",
    )?;
    let ids = stmt
        .query_map(params![entry_id, session_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

/// Physically truncates a subtree in one transaction: validates ownership,
/// materializes the subtree ids deepest-first, relocates the active pointer only
/// when it lies inside the deleted set (to the target's parent), deletes in
/// order (never a deep CASCADE), then bumps `updated_at`. Any failure rolls the
/// pointer and rows back. A target outside the session is `NotFound`.
pub fn delete_entry(conn: &Connection, session_id: &str, entry_id: &str) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;

    let target_parent: Option<String> = tx
        .query_row(
            "SELECT parent_id FROM entries WHERE id = ?1 AND session_id = ?2",
            params![entry_id, session_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| AppError {
            code: ErrorCode::NotFound,
            message: "entry does not belong to this session".into(),
        })?;

    let ids = collect_subtree_ids_desc(&tx, session_id, entry_id)?;

    let active_leaf: Option<String> = tx.query_row(
        "SELECT active_leaf_id FROM sessions WHERE id = ?1",
        params![session_id],
        |row| row.get(0),
    )?;
    if let Some(leaf) = active_leaf {
        if ids.iter().any(|id| id == &leaf) {
            tx.prepare_cached("UPDATE sessions SET active_leaf_id = ?1 WHERE id = ?2")?
                .execute(params![target_parent, session_id])?;
        }
    }

    delete_entries_in_order(&tx, &ids)?;

    let now = now_utc(&tx)?;
    tx.prepare_cached("UPDATE sessions SET updated_at = ?1 WHERE id = ?2")?
        .execute(params![now, session_id])?;
    Ok(tx.commit()?)
}

/// Recursive CTE that walks the active path upward from the session's active
/// leaf, assigning `up = 0` to the leaf. A NULL active leaf seeds no rows.
const ACTIVE_PATH_CTE: &str = "
    WITH RECURSIVE path(id, parent_id, up) AS (
        SELECT id, parent_id, 0 FROM entries
        WHERE id = (SELECT active_leaf_id FROM sessions WHERE id = ?1)
        UNION ALL
        SELECT e.id, e.parent_id, path.up + 1
        FROM entries e JOIN path ON e.id = path.parent_id
        WHERE e.session_id = ?1
    )
";

/// Page-size contract for path reads: default 50, valid range 1-50. Values
/// outside the range are rejected rather than clamped, so a caller cannot probe
/// with an unbounded read.
fn validate_limit(limit: Option<u32>) -> Result<i64, AppError> {
    let limit = i64::from(limit.unwrap_or(MAX_PATH_PAGE_SIZE as u32));
    if !(1..=MAX_PATH_PAGE_SIZE).contains(&limit) {
        return Err(AppError {
            code: ErrorCode::InvalidInput,
            message: format!("path page limit must be within 1..={MAX_PATH_PAGE_SIZE}"),
        });
    }
    Ok(limit)
}

/// Raw entry columns straight off a path query, before payload decoding.
type EntryColumns = (String, Option<String>, String, String, String);

/// Decodes one row into the domain `Entry`. Payload decoding happens exactly
/// once, here at the repository boundary; decode errors never echo payload text.
fn decode_entry_columns(columns: EntryColumns) -> Result<Entry, AppError> {
    let (id, parent_id, kind, payload_json, created_at) = columns;
    if kind != ENTRY_TYPE_MESSAGE {
        return Err(AppError {
            code: ErrorCode::Db,
            message: format!("unsupported entry type for entry {id}"),
        });
    }
    let payload: MessagePayload = serde_json::from_str(&payload_json).map_err(|_| AppError {
        code: ErrorCode::Db,
        message: format!("cannot decode message payload for entry {id}"),
    })?;
    Ok(Entry { id, parent_id, role: payload.role, content: payload.content, created_at })
}

fn ensure_session(conn: &Connection, session_id: &str) -> Result<(), AppError> {
    let exists: Option<i64> = conn
        .query_row("SELECT 1 FROM sessions WHERE id = ?1", params![session_id], |row| row.get(0))
        .optional()?;
    if exists.is_none() {
        return Err(AppError { code: ErrorCode::NotFound, message: "session not found".into() });
    }
    Ok(())
}

/// Locates `cursor` on the active path and returns its distance from the leaf.
/// A cursor from another session, a deleted cursor, or one on an inactive branch
/// is `InvalidInput`; the caller checks session existence first for `NotFound`.
fn path_up_of(conn: &Connection, session_id: &str, cursor: &str) -> Result<i64, AppError> {
    let sql = format!("{ACTIVE_PATH_CTE} SELECT up FROM path WHERE id = ?2");
    let up: Option<i64> =
        conn.query_row(&sql, params![session_id, cursor], |row| row.get(0)).optional()?;
    up.ok_or_else(|| AppError {
        code: ErrorCode::InvalidInput,
        message: "cursor is not on the current active path".into(),
    })
}

/// Newest page of the active path: walks up from the active leaf, keeps the
/// `limit` entries nearest the leaf, and returns them oldest-to-newest. The
/// page's newest entry is the leaf itself, so `next_cursor` is always `None`.
pub fn load_active_path(
    conn: &Connection,
    session_id: &str,
    limit: Option<u32>,
) -> Result<PathPage, AppError> {
    ensure_session(conn, session_id)?;
    let limit = validate_limit(limit)?;
    let sql = format!(
        "{ACTIVE_PATH_CTE}
        SELECT e.id, e.parent_id, e.type, e.payload, e.created_at
        FROM path JOIN entries e ON e.id = path.id
        ORDER BY path.up ASC
        LIMIT ?2"
    );
    let mut stmt = conn.prepare_cached(&sql)?;
    // Rows arrive newest-first; the probe row (limit+1-th) is the oldest.
    let mut rows: Vec<EntryColumns> = stmt
        .query_map(params![session_id, limit + 1], |row| {
            Ok((
                row.get("id")?,
                row.get("parent_id")?,
                row.get("type")?,
                row.get("payload")?,
                row.get("created_at")?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let has_older = rows.len() as i64 > limit;
    rows.truncate(limit as usize);
    rows.reverse();
    let entries: Vec<Entry> =
        rows.into_iter().map(decode_entry_columns).collect::<Result<_, _>>()?;
    let prev_cursor = if has_older { entries.first().map(|e| e.id.clone()) } else { None };
    Ok(PathPage { entries, prev_cursor, next_cursor: None })
}

/// The page immediately older than `cursor`. Requires the cursor to sit on the
/// current active path; the returned page excludes the cursor itself and always
/// carries `next_cursor` (the cursor's parent has the cursor as its successor).
pub fn load_active_path_before(
    conn: &Connection,
    session_id: &str,
    cursor: &str,
    limit: Option<u32>,
) -> Result<PathPage, AppError> {
    ensure_session(conn, session_id)?;
    let limit = validate_limit(limit)?;
    let cursor_up = path_up_of(conn, session_id, cursor)?;
    let sql = format!(
        "{ACTIVE_PATH_CTE}
        SELECT e.id, e.parent_id, e.type, e.payload, e.created_at
        FROM path JOIN entries e ON e.id = path.id
        WHERE path.up > ?2 AND path.up <= ?2 + ?3
        ORDER BY path.up DESC"
    );
    let mut stmt = conn.prepare_cached(&sql)?;
    // Rows arrive oldest-first; the probe row (limit+1-th) is the oldest.
    let mut rows: Vec<EntryColumns> = stmt
        .query_map(params![session_id, cursor_up, limit + 1], |row| {
            Ok((
                row.get("id")?,
                row.get("parent_id")?,
                row.get("type")?,
                row.get("payload")?,
                row.get("created_at")?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let has_older = rows.len() as i64 > limit;
    if has_older {
        rows.remove(0);
    }
    let entries: Vec<Entry> =
        rows.into_iter().map(decode_entry_columns).collect::<Result<_, _>>()?;
    let prev_cursor = if has_older { entries.first().map(|e| e.id.clone()) } else { None };
    let next_cursor = entries.last().map(|e| e.id.clone());
    Ok(PathPage { entries, prev_cursor, next_cursor })
}

/// The page immediately newer than `cursor`, chosen by depth on the current
/// active path (never an arbitrary sibling child, which would leave the path).
/// The returned page excludes the cursor itself and always carries `prev_cursor`
/// (the page's oldest entry has the cursor as its parent).
pub fn load_active_path_after(
    conn: &Connection,
    session_id: &str,
    cursor: &str,
    limit: Option<u32>,
) -> Result<PathPage, AppError> {
    ensure_session(conn, session_id)?;
    let limit = validate_limit(limit)?;
    let cursor_up = path_up_of(conn, session_id, cursor)?;
    let sql = format!(
        "{ACTIVE_PATH_CTE}
        SELECT e.id, e.parent_id, e.type, e.payload, e.created_at
        FROM path JOIN entries e ON e.id = path.id
        WHERE path.up < ?2 AND path.up >= ?2 - ?3
        ORDER BY path.up DESC"
    );
    let mut stmt = conn.prepare_cached(&sql)?;
    // Rows arrive oldest-first; the probe row (limit+1-th) is the newest.
    let mut rows: Vec<EntryColumns> = stmt
        .query_map(params![session_id, cursor_up, limit + 1], |row| {
            Ok((
                row.get("id")?,
                row.get("parent_id")?,
                row.get("type")?,
                row.get("payload")?,
                row.get("created_at")?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let has_newer = rows.len() as i64 > limit;
    if has_newer {
        rows.pop();
    }
    let entries: Vec<Entry> =
        rows.into_iter().map(decode_entry_columns).collect::<Result<_, _>>()?;
    let prev_cursor = entries.first().map(|e| e.id.clone());
    let next_cursor = if has_newer { entries.last().map(|e| e.id.clone()) } else { None };
    Ok(PathPage { entries, prev_cursor, next_cursor })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::repo::sessions;
    use crate::db::run_migrations;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    fn text(body: &str) -> Vec<ContentBlock> {
        vec![ContentBlock::Text { text: body.into(), provider_metadata: None }]
    }

    fn active_leaf(conn: &Connection, session_id: &str) -> Option<String> {
        conn.query_row(
            "SELECT active_leaf_id FROM sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn updated_at(conn: &Connection, session_id: &str) -> String {
        conn.query_row(
            "SELECT updated_at FROM sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn session_entry_count(conn: &Connection, session_id: &str) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM entries WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .unwrap()
    }

    /// Timestamps share millisecond precision, so a bump is made observable by
    /// resetting the column to a sentinel value first.
    fn set_updated_at(conn: &Connection, session_id: &str, value: &str) {
        conn.execute(
            "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
            params![value, session_id],
        )
        .unwrap();
    }

    /// Ground truth for pagination equality: walks parents one by one from the
    /// active leaf, independently of the repository's recursive CTE.
    fn walk_active_path(conn: &Connection, session_id: &str) -> Vec<String> {
        let mut ids = Vec::new();
        let mut current = active_leaf(conn, session_id);
        while let Some(id) = current {
            let parent: Option<String> = conn
                .query_row("SELECT parent_id FROM entries WHERE id = ?1", params![id], |row| {
                    row.get(0)
                })
                .unwrap();
            ids.push(id);
            current = parent;
        }
        ids.reverse();
        ids
    }

    fn ids(page: &PathPage) -> Vec<String> {
        page.entries.iter().map(|e| e.id.clone()).collect()
    }

    /// Appends a linear chain under the session's current leaf through the public
    /// entry point, mirroring production write granularity.
    fn append_chain(conn: &Connection, session_id: &str, len: usize) -> Vec<String> {
        (0..len).map(|i| append(conn, session_id, &text(&format!("msg-{i}"))).unwrap().id).collect()
    }

    fn fork_child(conn: &Connection, session_id: &str, parent: Option<&str>, body: &str) -> Entry {
        let tx = conn.unchecked_transaction().unwrap();
        let now = now_utc(&tx).unwrap();
        let entry = append_in_transaction(&tx, session_id, parent, &text(body), &now).unwrap();
        tx.commit().unwrap();
        entry
    }

    #[test]
    fn append_grows_chain_from_active_leaf_and_bumps_updated_at() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        set_updated_at(&conn, sid, "2000-01-01T00:00:00.000Z");

        let entry = append(&conn, sid, &text("msg-1")).unwrap();

        assert_eq!(entry.parent_id.as_deref(), Some(created.entry.id.as_str()));
        assert_eq!(entry.role, MessageRole::User);
        assert_eq!(active_leaf(&conn, sid).as_deref(), Some(entry.id.as_str()));
        assert_ne!(updated_at(&conn, sid), "2000-01-01T00:00:00.000Z");
    }

    #[test]
    fn append_requires_existing_session() {
        let conn = memory_db();
        assert_eq!(append(&conn, "nope", &text("hi")).unwrap_err().code, ErrorCode::NotFound);
    }

    #[test]
    fn append_rejects_blank_content() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let err = append(&conn, &created.session.id, &text("   ")).unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidInput);
        assert_eq!(session_entry_count(&conn, &created.session.id), 1);
    }

    #[test]
    fn append_under_foreign_parent_is_rejected() {
        let conn = memory_db();
        let a = sessions::create(&conn, "a", &text("root")).unwrap();
        let b = sessions::create(&conn, "b", &text("root")).unwrap();
        let tx = conn.unchecked_transaction().unwrap();
        let now = now_utc(&tx).unwrap();
        let err = append_in_transaction(&tx, &a.session.id, Some(&b.entry.id), &text("x"), &now)
            .unwrap_err();
        drop(tx);
        assert_eq!(err.code, ErrorCode::InvalidInput);
        assert_eq!(session_entry_count(&conn, &a.session.id), 1);
        assert_eq!(session_entry_count(&conn, &b.session.id), 1);
    }

    #[test]
    fn set_active_leaf_moves_pointer_without_bumping_updated_at() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        append_chain(&conn, sid, 2);
        set_updated_at(&conn, sid, "2000-01-01T00:00:00.000Z");

        set_active_leaf(&conn, sid, &created.entry.id).unwrap();

        assert_eq!(active_leaf(&conn, sid).as_deref(), Some(created.entry.id.as_str()));
        assert_eq!(updated_at(&conn, sid), "2000-01-01T00:00:00.000Z");
        assert_eq!(session_entry_count(&conn, sid), 3);
    }

    #[test]
    fn set_active_leaf_rejects_foreign_or_missing_targets() {
        let conn = memory_db();
        let a = sessions::create(&conn, "a", &text("root")).unwrap();
        let b = sessions::create(&conn, "b", &text("root")).unwrap();
        assert_eq!(
            set_active_leaf(&conn, &a.session.id, &b.entry.id).unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(
            set_active_leaf(&conn, "nope", &a.entry.id).unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(active_leaf(&conn, &a.session.id).as_deref(), Some(a.entry.id.as_str()));
    }

    #[test]
    fn delete_non_active_branch_keeps_pointer() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        let chain = append_chain(&conn, sid, 2);
        let sibling = fork_child(&conn, sid, Some(&chain[0]), "sib");
        set_active_leaf(&conn, sid, &chain[1]).unwrap();
        set_updated_at(&conn, sid, "2000-01-01T00:00:00.000Z");

        delete_entry(&conn, sid, &sibling.id).unwrap();

        assert_eq!(active_leaf(&conn, sid).as_deref(), Some(chain[1].as_str()));
        assert_eq!(session_entry_count(&conn, sid), 3);
        assert_ne!(updated_at(&conn, sid), "2000-01-01T00:00:00.000Z");
    }

    #[test]
    fn delete_active_leaf_moves_pointer_to_its_parent() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        let chain = append_chain(&conn, sid, 2);

        delete_entry(&conn, sid, &chain[1]).unwrap();

        assert_eq!(active_leaf(&conn, sid).as_deref(), Some(chain[0].as_str()));
        assert_eq!(session_entry_count(&conn, sid), 2);
    }

    #[test]
    fn delete_ancestor_of_active_relocates_pointer_to_target_parent() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        let chain = append_chain(&conn, sid, 2);

        // Deleting `a` truncates {a, b}; the pointer must land on a's parent.
        delete_entry(&conn, sid, &chain[0]).unwrap();

        assert_eq!(active_leaf(&conn, sid).as_deref(), Some(created.entry.id.as_str()));
        assert_eq!(session_entry_count(&conn, sid), 1);
    }

    #[test]
    fn delete_root_leaves_empty_session_with_null_pointer() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        append_chain(&conn, sid, 2);

        delete_entry(&conn, sid, &created.entry.id).unwrap();

        assert_eq!(active_leaf(&conn, sid), None);
        assert_eq!(session_entry_count(&conn, sid), 0);
        assert_eq!(sessions::list(&conn, false, None, None).unwrap().sessions.len(), 1);
    }

    #[test]
    fn delete_root_with_active_in_other_branch_keeps_pointer() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root-a")).unwrap();
        let sid = &created.session.id;
        let chain = append_chain(&conn, sid, 1);
        let root_b = fork_child(&conn, sid, None, "root-b");
        let b_child = fork_child(&conn, sid, Some(&root_b.id), "b1");
        set_active_leaf(&conn, sid, &chain[0]).unwrap();

        delete_entry(&conn, sid, &root_b.id).unwrap();

        assert_eq!(active_leaf(&conn, sid).as_deref(), Some(chain[0].as_str()));
        assert_eq!(session_entry_count(&conn, sid), 2);
        let b_child_left: i64 = conn
            .query_row("SELECT COUNT(*) FROM entries WHERE id = ?1", params![b_child.id], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(b_child_left, 0);
    }

    #[test]
    fn delete_deep_subtree_beyond_trigger_recursion_limit() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        append_chain(&conn, sid, 1500);

        delete_entry(&conn, sid, &created.entry.id).unwrap();

        assert_eq!(active_leaf(&conn, sid), None);
        assert_eq!(session_entry_count(&conn, sid), 0);
        let orphans: i64 = conn
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0))
            .unwrap();
        assert_eq!(orphans, 0, "foreign key check must find no orphans");
    }

    #[test]
    fn delete_failure_rolls_back_rows_and_pointer() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        let chain = append_chain(&conn, sid, 3);
        set_updated_at(&conn, sid, "2000-01-01T00:00:00.000Z");

        // Fail while deleting `a`: the pointer has already been relocated inside
        // the transaction, so recovery must restore both pointer and rows.
        conn.execute(
            &format!(
                "CREATE TRIGGER fail_mid_delete BEFORE DELETE ON entries
                 WHEN old.id = '{}' BEGIN SELECT RAISE(ABORT, 'injected'); END",
                chain[0]
            ),
            [],
        )
        .unwrap();

        assert!(delete_entry(&conn, sid, &created.entry.id).is_err());

        assert_eq!(active_leaf(&conn, sid).as_deref(), Some(chain[2].as_str()));
        assert_eq!(session_entry_count(&conn, sid), 4);
        assert_eq!(updated_at(&conn, sid), "2000-01-01T00:00:00.000Z");

        conn.execute("DROP TRIGGER fail_mid_delete", []).unwrap();
        delete_entry(&conn, sid, &created.entry.id).unwrap();
        assert_eq!(session_entry_count(&conn, sid), 0);
    }

    #[test]
    fn delete_entry_rejects_cross_session_target() {
        let conn = memory_db();
        let a = sessions::create(&conn, "a", &text("root")).unwrap();
        let b = sessions::create(&conn, "b", &text("root")).unwrap();
        assert_eq!(
            delete_entry(&conn, &b.session.id, &a.entry.id).unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(session_entry_count(&conn, &a.session.id), 1);
        assert_eq!(active_leaf(&conn, &a.session.id).as_deref(), Some(a.entry.id.as_str()));
    }

    #[test]
    fn multiple_roots_and_siblings_coexist_and_switch() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root-a")).unwrap();
        let sid = &created.session.id;
        let chain_a = append_chain(&conn, sid, 1);
        let root_b = fork_child(&conn, sid, None, "root-b");
        let sibling = fork_child(&conn, sid, Some(&created.entry.id), "a1-fork");

        set_active_leaf(&conn, sid, &chain_a[0]).unwrap();
        assert_eq!(
            ids(&load_active_path(&conn, sid, None).unwrap()),
            vec![created.entry.id.clone(), chain_a[0].clone()]
        );
        set_active_leaf(&conn, sid, &root_b.id).unwrap();
        assert_eq!(ids(&load_active_path(&conn, sid, None).unwrap()), vec![root_b.id.clone()]);
        set_active_leaf(&conn, sid, &sibling.id).unwrap();
        assert_eq!(
            ids(&load_active_path(&conn, sid, None).unwrap()),
            vec![created.entry.id.clone(), sibling.id.clone()]
        );
        assert_eq!(session_entry_count(&conn, sid), 4);
    }

    #[test]
    fn tail_page_reports_boundaries() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        append_chain(&conn, sid, 4);
        let full = walk_active_path(&conn, sid);
        assert_eq!(full.len(), 5);

        let page = load_active_path(&conn, sid, Some(3)).unwrap();
        assert_eq!(ids(&page), full[2..].to_vec());
        assert_eq!(page.prev_cursor.as_deref(), Some(full[2].as_str()));
        assert_eq!(page.next_cursor, None);

        // Exact fit and partial page: the whole path in one page, no older history.
        let exact = load_active_path(&conn, sid, Some(5)).unwrap();
        assert_eq!(ids(&exact), full.clone());
        assert_eq!(exact.prev_cursor, None);
        assert_eq!(exact.next_cursor, None);
    }

    #[test]
    fn exactly_full_default_page_gets_prev_cursor_only_at_limit_plus_one() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        append_chain(&conn, sid, 49);
        let full = walk_active_path(&conn, sid);
        assert_eq!(full.len(), 50);

        let page = load_active_path(&conn, sid, None).unwrap();
        assert_eq!(ids(&page), full.clone());
        assert_eq!(page.prev_cursor, None);

        append(&conn, sid, &text("more")).unwrap();
        let full = walk_active_path(&conn, sid);
        let page = load_active_path(&conn, sid, None).unwrap();
        assert_eq!(ids(&page), full[1..].to_vec());
        assert_eq!(page.prev_cursor.as_deref(), Some(full[1].as_str()));
    }

    #[test]
    fn before_and_after_exclude_cursor_and_report_directions() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        append_chain(&conn, sid, 4);
        let full = walk_active_path(&conn, sid);

        let before = load_active_path_before(&conn, sid, &full[2], Some(3)).unwrap();
        assert_eq!(ids(&before), vec![full[0].clone(), full[1].clone()]);
        assert_eq!(before.prev_cursor, None);
        assert_eq!(before.next_cursor.as_deref(), Some(full[1].as_str()));

        let after = load_active_path_after(&conn, sid, &full[2], Some(3)).unwrap();
        assert_eq!(ids(&after), vec![full[3].clone(), full[4].clone()]);
        assert_eq!(after.prev_cursor.as_deref(), Some(full[3].as_str()));
        assert_eq!(after.next_cursor, None);

        // A full `after` page cut short of the leaf still has a newer successor.
        let after_from_root = load_active_path_after(&conn, sid, &full[0], Some(3)).unwrap();
        assert_eq!(ids(&after_from_root), full[1..4].to_vec());
        assert_eq!(after_from_root.prev_cursor.as_deref(), Some(full[1].as_str()));
        assert_eq!(after_from_root.next_cursor.as_deref(), Some(full[3].as_str()));
    }

    #[test]
    fn empty_path_returns_empty_page() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        delete_entry(&conn, sid, &created.entry.id).unwrap();

        let page = load_active_path(&conn, sid, None).unwrap();
        assert!(page.entries.is_empty());
        assert_eq!(page.prev_cursor, None);
        assert_eq!(page.next_cursor, None);
    }

    #[test]
    fn deleted_and_foreign_cursors_are_rejected() {
        let conn = memory_db();
        let a = sessions::create(&conn, "a", &text("root")).unwrap();
        let other = sessions::create(&conn, "b", &text("root")).unwrap();
        let sid = &a.session.id;
        let chain = append_chain(&conn, sid, 2);

        delete_entry(&conn, sid, &chain[1]).unwrap();
        assert_eq!(
            load_active_path_before(&conn, sid, &chain[1], None).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            load_active_path_after(&conn, sid, &chain[1], None).unwrap_err().code,
            ErrorCode::InvalidInput
        );

        assert_eq!(
            load_active_path_before(&conn, sid, &other.entry.id, None).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            load_active_path_after(&conn, sid, &other.entry.id, None).unwrap_err().code,
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn missing_session_reads_report_not_found() {
        let conn = memory_db();
        assert_eq!(load_active_path(&conn, "nope", None).unwrap_err().code, ErrorCode::NotFound);
        assert_eq!(
            load_active_path_before(&conn, "nope", "any", None).unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(
            load_active_path_after(&conn, "nope", "any", None).unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[test]
    fn cursor_on_inactive_branch_is_rejected_after_switch() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        let chain = append_chain(&conn, sid, 2);
        let fork = fork_child(&conn, sid, Some(&chain[0]), "fork");
        set_active_leaf(&conn, sid, &chain[1]).unwrap();

        assert_eq!(
            load_active_path_before(&conn, sid, &fork.id, None).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            ids(&load_active_path(&conn, sid, None).unwrap()),
            vec![created.entry.id.clone(), chain[0].clone(), chain[1].clone()]
        );
    }

    #[test]
    fn limit_boundaries() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        append_chain(&conn, sid, 4);
        let full = walk_active_path(&conn, sid);

        assert_eq!(
            load_active_path(&conn, sid, Some(0)).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            load_active_path(&conn, sid, Some(51)).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        let one = load_active_path(&conn, sid, Some(1)).unwrap();
        assert_eq!(ids(&one), vec![full[4].clone()]);
        assert_eq!(one.prev_cursor.as_deref(), Some(full[4].as_str()));
        let fifty = load_active_path(&conn, sid, Some(50)).unwrap();
        assert_eq!(ids(&fifty), full.clone());
        assert_eq!(fifty.prev_cursor, None);
        // Cursor-bearing reads share the same limit contract.
        assert_eq!(
            load_active_path_before(&conn, sid, &full[2], Some(0)).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            load_active_path_after(&conn, sid, &full[2], Some(51)).unwrap_err().code,
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn path_pagination_round_trip_equals_full_walk_on_long_chain() {
        let conn = memory_db();
        let created = sessions::create(&conn, "t", &text("root")).unwrap();
        let sid = &created.session.id;
        append_chain(&conn, sid, 1499);
        let full = walk_active_path(&conn, sid);
        assert_eq!(full.len(), 1500);

        // tail + walking `before` must reconstruct the entire path. Pages arrive
        // newest-page-first (the window layout); the old-to-new flatten reverses
        // the page order, not the order inside each page.
        let mut paged: Vec<Vec<Entry>> = Vec::new();
        let mut pages = 0usize;
        let mut cursor: Option<String> = None;
        loop {
            let page = match &cursor {
                Some(c) => load_active_path_before(&conn, sid, c, Some(50)).unwrap(),
                None => load_active_path(&conn, sid, Some(50)).unwrap(),
            };
            paged.push(page.entries.clone());
            pages += 1;
            match page.prev_cursor {
                Some(next) => cursor = Some(next),
                None => break,
            }
        }
        let older: Vec<Entry> = paged.iter().rev().flatten().cloned().collect();
        assert_eq!(older.iter().map(|e| e.id.clone()).collect::<Vec<_>>(), full);
        assert_eq!(pages, 30, "1500 entries at page size 50 is 30 pages");

        // Walking `after` from the root reconstructs the path minus the cursor.
        let mut newer: Vec<String> = Vec::new();
        let mut cursor = full[0].clone();
        loop {
            let page = load_active_path_after(&conn, sid, &cursor, Some(50)).unwrap();
            newer.extend(ids(&page));
            match page.next_cursor {
                Some(next) => cursor = next,
                None => break,
            }
        }
        assert_eq!(newer, full[1..].to_vec());

        // Uniqueness and parent-child continuity of the full reconstruction.
        let mut unique = older.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
        unique.sort();
        unique.dedup();
        assert_eq!(unique.len(), older.len(), "no duplicate ids across pages");
        for pair in older.windows(2) {
            assert_eq!(
                pair[1].parent_id.as_deref(),
                Some(pair[0].id.as_str()),
                "consecutive entries must be parent and child"
            );
        }
    }
}
