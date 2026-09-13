use std::collections::{BTreeSet, HashMap};

use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::db::repo::entries;
use crate::error::{AppError, ErrorCode};
use crate::types::{
    CorruptedProvider, CorruptedUnified, ModelEntry, Protocol, Provider, ProviderConfig,
    ReasoningOutputMode, SecretString, UnifiedMember, UnifiedModel,
};

/// One entry of [`list`]: a decoded provider, or a placeholder for a row whose
/// stored columns no longer decode.
#[derive(Debug, Clone, PartialEq)]
pub enum ProviderListItem {
    Provider(Provider),
    Corrupted(CorruptedProvider),
}

/// One entry of [`list_unified`], with the same degraded-row handling as
/// [`ProviderListItem`].
#[derive(Debug, Clone, PartialEq)]
pub enum UnifiedModelListItem {
    Unified(UnifiedModel),
    Corrupted(CorruptedUnified),
}

fn encode_json<T: Serialize>(value: &T) -> Result<String, AppError> {
    serde_json::to_string(value).map_err(|err| AppError {
        code: ErrorCode::Internal,
        message: format!("cannot encode provider JSON column: {err}"),
    })
}

fn encode_optional_json<T: Serialize>(value: &Option<T>) -> Result<Option<String>, AppError> {
    value.as_ref().map(encode_json).transpose()
}

/// Decodes one stored JSON column. The failure message names the column only —
/// never the stored payload — and the caller decides between a placeholder row
/// and an error.
fn decode_json<T: DeserializeOwned>(raw: &str, column: &str) -> Result<T, AppError> {
    serde_json::from_str(raw).map_err(|_| AppError {
        code: ErrorCode::Db,
        message: format!("cannot decode `{column}` column"),
    })
}

fn decode_optional_json<T: DeserializeOwned>(
    raw: Option<String>,
    column: &str,
) -> Result<Option<T>, AppError> {
    raw.map(|raw| decode_json(&raw, column)).transpose()
}

/// INTEGER columns hold `u32` values; a row written outside the app can fall out
/// of range, which degrades that one row instead of failing the whole read.
fn decode_u32(value: i64, column: &str) -> Result<u32, AppError> {
    u32::try_from(value).map_err(|_| AppError {
        code: ErrorCode::Db,
        message: format!("`{column}` column is out of range"),
    })
}

fn encode_reasoning_output(mode: ReasoningOutputMode) -> &'static str {
    match mode {
        ReasoningOutputMode::Auto => "auto",
        ReasoningOutputMode::Always => "always",
        ReasoningOutputMode::Off => "off",
    }
}

fn decode_reasoning_output(raw: &str) -> Result<ReasoningOutputMode, AppError> {
    match raw {
        "auto" => Ok(ReasoningOutputMode::Auto),
        "always" => Ok(ReasoningOutputMode::Always),
        "off" => Ok(ReasoningOutputMode::Off),
        _ => Err(AppError {
            code: ErrorCode::Db,
            message: "`reasoning_output` column holds an unknown mode".into(),
        }),
    }
}

struct RawProvider {
    id: String,
    name: String,
    api: String,
    base_url: String,
    api_key: String,
    enabled: i64,
    headers: String,
    compat: Option<String>,
    request_timeout_ms: i64,
    stream_idle_timeout_ms: i64,
    max_retries: i64,
    abort_on_disconnect: i64,
    reasoning_output: String,
}

struct RawModel {
    provider_id: String,
    id: String,
    name: Option<String>,
    apis: String,
    base_url: Option<String>,
    reasoning: i64,
    thinking_level_map: Option<String>,
    input: String,
    cost: Option<String>,
    context_window: Option<i64>,
    max_tokens: Option<i64>,
    sampling_params: Option<String>,
    headers: Option<String>,
    compat: Option<String>,
}

fn read_provider_row(row: &Row) -> rusqlite::Result<RawProvider> {
    Ok(RawProvider {
        id: row.get("id")?,
        name: row.get("name")?,
        api: row.get("api")?,
        base_url: row.get("base_url")?,
        api_key: row.get("api_key")?,
        enabled: row.get("enabled")?,
        headers: row.get("headers")?,
        compat: row.get("compat")?,
        request_timeout_ms: row.get("request_timeout_ms")?,
        stream_idle_timeout_ms: row.get("stream_idle_timeout_ms")?,
        max_retries: row.get("max_retries")?,
        abort_on_disconnect: row.get("abort_on_disconnect")?,
        reasoning_output: row.get("reasoning_output")?,
    })
}

fn read_model_row(row: &Row) -> rusqlite::Result<RawModel> {
    Ok(RawModel {
        provider_id: row.get("provider_id")?,
        id: row.get("id")?,
        name: row.get("name")?,
        apis: row.get("apis")?,
        base_url: row.get("base_url")?,
        reasoning: row.get("reasoning")?,
        thinking_level_map: row.get("thinking_level_map")?,
        input: row.get("input")?,
        cost: row.get("cost")?,
        context_window: row.get("context_window")?,
        max_tokens: row.get("max_tokens")?,
        sampling_params: row.get("sampling_params")?,
        headers: row.get("headers")?,
        compat: row.get("compat")?,
    })
}

struct RawUnified {
    id: String,
}

/// Reads providers and their models in two queries (no per-provider round trip).
/// `created_at` has millisecond precision, so the id tiebreak keeps the order of
/// two providers created within the same millisecond deterministic.
fn read_provider_rows(conn: &Connection) -> Result<Vec<RawProvider>, AppError> {
    let mut stmt = conn.prepare_cached(
        "SELECT id, name, api, base_url, api_key, enabled, headers, compat, request_timeout_ms,
                stream_idle_timeout_ms, max_retries, abort_on_disconnect, reasoning_output
         FROM providers
         ORDER BY created_at ASC, id ASC",
    )?;
    let rows = stmt.query_map([], read_provider_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn read_model_rows(conn: &Connection) -> Result<Vec<RawModel>, AppError> {
    let mut stmt = conn.prepare_cached(
        "SELECT provider_id, id, name, apis, base_url, reasoning, thinking_level_map,
                input, cost, context_window, max_tokens, sampling_params, headers, compat
         FROM models
         ORDER BY provider_id ASC, sort_order ASC",
    )?;
    let rows = stmt.query_map([], read_model_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn decode_model(raw: RawModel) -> Result<ModelEntry, AppError> {
    Ok(ModelEntry {
        id: raw.id,
        name: raw.name,
        apis: decode_json(&raw.apis, "apis")?,
        base_url: raw.base_url,
        reasoning: raw.reasoning != 0,
        thinking_level_map: decode_optional_json(raw.thinking_level_map, "thinking_level_map")?,
        input: decode_json(&raw.input, "input")?,
        cost: decode_optional_json(raw.cost, "cost")?,
        context_window: raw
            .context_window
            .map(|value| decode_u32(value, "context_window"))
            .transpose()?,
        max_tokens: raw.max_tokens.map(|value| decode_u32(value, "max_tokens")).transpose()?,
        sampling_params: decode_optional_json(raw.sampling_params, "sampling_params")?,
        headers: decode_optional_json(raw.headers, "headers")?,
        compat: decode_optional_json(raw.compat, "compat")?,
    })
}

fn decode_provider(raw: RawProvider, models: Vec<RawModel>) -> Result<Provider, AppError> {
    let config = ProviderConfig {
        name: raw.name,
        base_url: raw.base_url,
        api: Protocol::from(raw.api),
        api_key: SecretString::from(raw.api_key),
        enabled: raw.enabled != 0,
        headers: decode_json(&raw.headers, "headers")?,
        compat: decode_optional_json(raw.compat, "compat")?,
        request_timeout_ms: decode_u32(raw.request_timeout_ms, "request_timeout_ms")?,
        stream_idle_timeout_ms: decode_u32(raw.stream_idle_timeout_ms, "stream_idle_timeout_ms")?,
        max_retries: decode_u32(raw.max_retries, "max_retries")?,
        abort_on_disconnect: raw.abort_on_disconnect != 0,
        reasoning_output: decode_reasoning_output(&raw.reasoning_output)?,
        models: models.into_iter().map(decode_model).collect::<Result<Vec<_>, _>>()?,
    };
    Ok(Provider { id: raw.id, config })
}

/// Reads every provider with its models in stored order. A row whose columns
/// no longer decode becomes a [`ProviderListItem::Corrupted`] placeholder instead
/// of failing the whole read.
pub fn list(conn: &Connection) -> Result<Vec<ProviderListItem>, AppError> {
    let providers = read_provider_rows(conn)?;
    let mut models: HashMap<String, Vec<RawModel>> = HashMap::new();
    for model in read_model_rows(conn)? {
        models.entry(model.provider_id.clone()).or_default().push(model);
    }

    let mut items = Vec::with_capacity(providers.len());
    for raw in providers {
        let id = raw.id.clone();
        // The decode error text is dropped on purpose: the placeholder carries the
        // row id only, never the stored payload.
        match decode_provider(raw, models.remove(&id).unwrap_or_default()) {
            Ok(provider) => items.push(ProviderListItem::Provider(provider)),
            Err(_) => items.push(ProviderListItem::Corrupted(CorruptedProvider { id })),
        }
    }
    Ok(items)
}

/// Inserts one provider row and its models in one transaction and returns it
/// with the generated UUIDv7 id. A failure at any step, including commit, leaves
/// neither table changed.
pub fn create(conn: &Connection, spec: &ProviderConfig) -> Result<Provider, AppError> {
    let tx = conn.unchecked_transaction()?;
    let now = entries::now_utc(&tx)?;
    let id = uuid::Uuid::now_v7().to_string();

    tx.prepare_cached(
        "INSERT INTO providers (id, name, api, base_url, api_key, enabled, headers, compat,
                                request_timeout_ms, stream_idle_timeout_ms, max_retries,
                                abort_on_disconnect, reasoning_output, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
    )?
    .execute(params![
        id,
        spec.name,
        spec.api.as_str(),
        spec.base_url,
        spec.api_key.expose(),
        i64::from(spec.enabled),
        encode_json(&spec.headers)?,
        encode_optional_json(&spec.compat)?,
        i64::from(spec.request_timeout_ms),
        i64::from(spec.stream_idle_timeout_ms),
        i64::from(spec.max_retries),
        i64::from(spec.abort_on_disconnect),
        encode_reasoning_output(spec.reasoning_output),
        now,
        now,
    ])?;

    // `sort_order` is the model's position in the draft, so the stored order is the
    // order the editor submitted.
    for (position, model) in spec.models.iter().enumerate() {
        upsert_model(&tx, &id, model, position as i64)?;
    }

    tx.commit()?;
    Ok(Provider { id, config: spec.clone() })
}

/// Replaces the stored provider with `spec` in one transaction: the model set
/// is diffed (upserts plus explicit deletes), and dependents of a removed model
/// disappear with it. An unknown id is `NotFound`.
pub fn update(conn: &Connection, id: &str, spec: &ProviderConfig) -> Result<Provider, AppError> {
    let tx = conn.unchecked_transaction()?;
    let exists: Option<bool> = tx
        .query_row("SELECT 1 FROM providers WHERE id = ?1", params![id], |_| Ok(true))
        .optional()?;
    if exists.is_none() {
        return Err(AppError { code: ErrorCode::NotFound, message: "provider not found".into() });
    }

    // Deleting a model also removes its unified-member references through the FK.
    let stored: Vec<String> = {
        let mut stmt = tx.prepare_cached("SELECT id FROM models WHERE provider_id = ?1")?;
        let ids =
            stmt.query_map(params![id], |row| row.get(0))?.collect::<Result<Vec<String>, _>>()?;
        ids
    };
    let kept: BTreeSet<&str> = spec.models.iter().map(|model| model.id.as_str()).collect();
    for model_id in stored.iter().filter(|model_id| !kept.contains(model_id.as_str())) {
        tx.prepare_cached("DELETE FROM models WHERE provider_id = ?1 AND id = ?2")?
            .execute(params![id, model_id])?;
    }

    // Reordering swaps sort_order between two kept rows, which UNIQUE (provider_id,
    // sort_order) rejects mid-update; park the kept rows in a negative range first
    // (upsert targets are draft indices, never negative).
    tx.prepare_cached("UPDATE models SET sort_order = -(sort_order + 1) WHERE provider_id = ?1")?
        .execute(params![id])?;
    for (position, model) in spec.models.iter().enumerate() {
        upsert_model(&tx, id, model, position as i64)?;
    }

    prune_empty_unified_models(&tx)?;

    let now = entries::now_utc(&tx)?;
    tx.prepare_cached(
        "UPDATE providers SET name = ?1, api = ?2, base_url = ?3, api_key = ?4, enabled = ?5,
                headers = ?6, compat = ?7, request_timeout_ms = ?8, stream_idle_timeout_ms = ?9,
                max_retries = ?10, abort_on_disconnect = ?11, reasoning_output = ?12,
                updated_at = ?13
         WHERE id = ?14",
    )?
    .execute(params![
        spec.name,
        spec.api.as_str(),
        spec.base_url,
        spec.api_key.expose(),
        i64::from(spec.enabled),
        encode_json(&spec.headers)?,
        encode_optional_json(&spec.compat)?,
        i64::from(spec.request_timeout_ms),
        i64::from(spec.stream_idle_timeout_ms),
        i64::from(spec.max_retries),
        i64::from(spec.abort_on_disconnect),
        encode_reasoning_output(spec.reasoning_output),
        now,
        id,
    ])?;

    tx.commit()?;
    Ok(Provider { id: id.to_string(), config: spec.clone() })
}

/// Deletes a provider in one transaction, removing its dependent rows before
/// the provider itself. An unknown id is `NotFound`.
pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;
    let exists: Option<bool> = tx
        .query_row("SELECT 1 FROM providers WHERE id = ?1", params![id], |_| Ok(true))
        .optional()?;
    if exists.is_none() {
        return Err(AppError { code: ErrorCode::NotFound, message: "provider not found".into() });
    }

    // Explicit deletes in dependency order; the ON DELETE CASCADE clauses only back
    // them up, so no row ever disappears through an action this module did not plan.
    tx.prepare_cached("DELETE FROM models WHERE provider_id = ?1")?.execute(params![id])?;
    prune_empty_unified_models(&tx)?;
    tx.prepare_cached("DELETE FROM providers WHERE id = ?1")?.execute(params![id])?;

    tx.commit()?;
    Ok(())
}

/// Reads every aggregate with its members in `position` order. An aggregate
/// holding a member whose model row is gone becomes a
/// [`UnifiedModelListItem::Corrupted`] placeholder.
pub fn list_unified(conn: &Connection) -> Result<Vec<UnifiedModelListItem>, AppError> {
    let mut members: HashMap<String, (Vec<UnifiedMember>, bool)> = HashMap::new();
    {
        // The LEFT JOIN marks members whose model row is gone: the aggregate cannot
        // be resolved or edited then, so it degrades like a damaged provider row.
        let mut stmt = conn.prepare_cached(
            "SELECT m.unified_id, m.provider_id, m.model, mo.id IS NOT NULL AS known
             FROM unified_model_members m
             LEFT JOIN models mo ON mo.provider_id = m.provider_id AND mo.id = m.model
             ORDER BY m.unified_id ASC, m.position ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        for row in rows {
            let (unified_id, provider_id, model, known) = row?;
            let slot = members.entry(unified_id).or_insert_with(|| (Vec::new(), false));
            slot.1 |= known == 0;
            slot.0.push(UnifiedMember { provider_id, model });
        }
    }

    let mut stmt = conn.prepare_cached("SELECT id FROM unified_models ORDER BY id ASC")?;
    let rows = stmt
        .query_map([], |row| Ok(RawUnified { id: row.get(0)? }))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut items = Vec::with_capacity(rows.len());
    for raw in rows {
        let (members, corrupted) = members.remove(&raw.id).unwrap_or_default();
        if corrupted {
            items.push(UnifiedModelListItem::Corrupted(CorruptedUnified { id: raw.id }));
        } else {
            items.push(UnifiedModelListItem::Unified(UnifiedModel { id: raw.id, members }));
        }
    }
    Ok(items)
}

/// Inserts one aggregate and its members in one transaction, in draft order.
/// A duplicate id trips the primary key; a member without a registered model
/// trips the composite foreign key.
pub fn create_unified(conn: &Connection, spec: &UnifiedModel) -> Result<UnifiedModel, AppError> {
    let tx = conn.unchecked_transaction()?;
    tx.prepare_cached("INSERT INTO unified_models (id) VALUES (?1)")?.execute(params![spec.id])?;
    insert_members(&tx, spec)?;
    tx.commit()?;
    Ok(spec.clone())
}

/// Replaces the aggregate in one transaction; a changed `spec.id` renames it,
/// and members are rewritten in draft order. An unknown id is `NotFound`.
pub fn update_unified(
    conn: &Connection,
    id: &str,
    spec: &UnifiedModel,
) -> Result<UnifiedModel, AppError> {
    let tx = conn.unchecked_transaction()?;
    // The visible id is the primary key and member rows reference it, so a rename
    // is a replace: drop the old aggregate, then insert the draft under its own id
    // with members rewritten in draft order.
    let removed =
        tx.prepare_cached("DELETE FROM unified_models WHERE id = ?1")?.execute(params![id])?;
    if removed == 0 {
        return Err(AppError {
            code: ErrorCode::NotFound,
            message: "unified model not found".into(),
        });
    }
    tx.prepare_cached("INSERT INTO unified_models (id) VALUES (?1)")?.execute(params![spec.id])?;
    insert_members(&tx, spec)?;
    tx.commit()?;
    Ok(spec.clone())
}

/// Deletes one aggregate; its member rows go with it through the foreign key.
/// An unknown id is `NotFound`.
pub fn delete_unified(conn: &Connection, id: &str) -> Result<(), AppError> {
    let removed =
        conn.prepare_cached("DELETE FROM unified_models WHERE id = ?1")?.execute(params![id])?;
    if removed == 0 {
        return Err(AppError {
            code: ErrorCode::NotFound,
            message: "unified model not found".into(),
        });
    }
    Ok(())
}

/// Inserts or updates one model row by `(provider_id, id)`. The upsert keeps the
/// row identity, so unified members pointing at the model survive a provider
/// rewrite.
fn upsert_model(
    tx: &Transaction,
    provider_id: &str,
    model: &ModelEntry,
    sort_order: i64,
) -> Result<(), AppError> {
    tx.prepare_cached(
        "INSERT INTO models (provider_id, id, name, apis, base_url, reasoning,
                             thinking_level_map, input, cost, context_window, max_tokens,
                             sampling_params, headers, compat, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
         ON CONFLICT(provider_id, id) DO UPDATE SET
             name = excluded.name,
             apis = excluded.apis,
             base_url = excluded.base_url,
             reasoning = excluded.reasoning,
             thinking_level_map = excluded.thinking_level_map,
             input = excluded.input,
             cost = excluded.cost,
             context_window = excluded.context_window,
             max_tokens = excluded.max_tokens,
             sampling_params = excluded.sampling_params,
             headers = excluded.headers,
             compat = excluded.compat,
             sort_order = excluded.sort_order",
    )?
    .execute(params![
        provider_id,
        model.id,
        model.name,
        encode_json(&model.apis)?,
        model.base_url,
        i64::from(model.reasoning),
        encode_optional_json(&model.thinking_level_map)?,
        encode_json(&model.input)?,
        encode_optional_json(&model.cost)?,
        model.context_window.map(i64::from),
        model.max_tokens.map(i64::from),
        encode_optional_json(&model.sampling_params)?,
        encode_optional_json(&model.headers)?,
        encode_optional_json(&model.compat)?,
        sort_order,
    ])?;
    Ok(())
}

fn insert_members(tx: &Transaction, spec: &UnifiedModel) -> Result<(), AppError> {
    let mut stmt = tx.prepare_cached(
        "INSERT INTO unified_model_members (unified_id, provider_id, model, position)
         VALUES (?1, ?2, ?3, ?4)",
    )?;
    for (position, member) in spec.members.iter().enumerate() {
        stmt.execute(params![spec.id, member.provider_id, member.model, position as i64])?;
    }
    Ok(())
}

/// Removes unified models whose members are all gone. Deleting a model cascades
/// its member rows, but that cascade cannot express the aggregate rule "a unified
/// model needs at least one member".
fn prune_empty_unified_models(tx: &Transaction) -> Result<(), AppError> {
    tx.prepare_cached(
        "DELETE FROM unified_models
         WHERE NOT EXISTS (
             SELECT 1 FROM unified_model_members m WHERE m.unified_id = unified_models.id
         )",
    )?
    .execute([])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::run_migrations;
    use crate::types::{
        InputModality, ModelCost, ModelCostTier, PeakPricing, ThinkingLevel, TimeWindow, Weekday,
    };
    use serde_json::json;
    use std::collections::BTreeMap;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    /// A model with every optional column unset and no checked protocol.
    fn sparse_model() -> ModelEntry {
        ModelEntry {
            id: "gpt-5.2".into(),
            name: None,
            apis: Vec::new(),
            base_url: None,
            reasoning: false,
            thinking_level_map: None,
            input: vec![InputModality::Text],
            cost: None,
            context_window: None,
            max_tokens: None,
            sampling_params: None,
            headers: None,
            compat: None,
        }
    }

    /// A model with non-default values in every column, so a dropped field cannot
    /// hide behind a default.
    fn full_model() -> ModelEntry {
        ModelEntry {
            id: "anthropic/claude-sonnet-5".into(),
            name: Some("Claude Sonnet 5".into()),
            apis: vec![Protocol::from("anthropic-messages"), Protocol::from("openai-completions")],
            base_url: Some("https://proxy.example.com/v1".into()),
            reasoning: true,
            thinking_level_map: Some(BTreeMap::from([
                (ThinkingLevel::Off, None),
                (ThinkingLevel::High, Some("high".to_string())),
            ])),
            input: vec![InputModality::Text, InputModality::Image],
            cost: Some(ModelCost {
                input: 3.0,
                output: 15.0,
                cache_read: 0.3,
                cache_write: 3.75,
                tiers: Some(vec![ModelCostTier {
                    input_tokens_above: 200_000,
                    input: 6.0,
                    output: 22.5,
                    cache_read: 0.6,
                    cache_write: 7.5,
                }]),
                peak: Some(PeakPricing {
                    input: 1.5,
                    output: 7.5,
                    cache_read: 0.15,
                    cache_write: 1.875,
                    windows: vec![TimeWindow {
                        days: vec![Weekday::Mon, Weekday::Tue],
                        start: "01:00".into(),
                        end: "04:00".into(),
                    }],
                }),
            }),
            context_window: Some(200_000),
            max_tokens: Some(8_192),
            sampling_params: Some(
                json!({ "temperature": 0.5, "topP": 0.9 }).as_object().unwrap().clone(),
            ),
            headers: Some(BTreeMap::from([("X-Model".to_string(), "strict".to_string())])),
            compat: Some(BTreeMap::from([(
                Protocol::from("anthropic-messages"),
                json!({ "supportsTemperature": false }),
            )])),
        }
    }

    fn full_config() -> ProviderConfig {
        ProviderConfig {
            name: "Primary Gateway".into(),
            base_url: "https://api.example.com/v1".into(),
            api: Protocol::from("openai-completions"),
            api_key: SecretString::from("sk-test-123"),
            enabled: false,
            headers: BTreeMap::from([
                ("X-Org".to_string(), "nostra".to_string()),
                ("X-Trace".to_string(), "on".to_string()),
            ]),
            compat: Some(BTreeMap::from([
                (Protocol::from("openai-completions"), json!({ "maxTokensField": "max_tokens" })),
                (Protocol::from("anthropic-messages"), json!({ "supportsTemperature": true })),
            ])),
            request_timeout_ms: 30_000,
            stream_idle_timeout_ms: 45_000,
            max_retries: 3,
            abort_on_disconnect: false,
            reasoning_output: ReasoningOutputMode::Always,
            models: vec![full_model(), sparse_model()],
        }
    }

    fn simple_config(name: &str, model_id: &str) -> ProviderConfig {
        ProviderConfig {
            name: name.into(),
            base_url: "https://simple.example.com".into(),
            api: Protocol::from("openai-completions"),
            api_key: SecretString::from("sk-simple"),
            models: vec![ModelEntry {
                id: model_id.into(),
                apis: vec![Protocol::from("openai-completions")],
                ..sparse_model()
            }],
            ..full_config()
        }
    }

    fn provider_of(items: &[ProviderListItem], id: &str) -> Provider {
        items
            .iter()
            .find_map(|item| match item {
                ProviderListItem::Provider(provider) if provider.id == id => Some(provider.clone()),
                _ => None,
            })
            .unwrap()
    }

    fn corrupted_provider_ids(items: &[ProviderListItem]) -> Vec<String> {
        items
            .iter()
            .filter_map(|item| match item {
                ProviderListItem::Corrupted(corrupted) => Some(corrupted.id.clone()),
                _ => None,
            })
            .collect()
    }

    fn unified_of(items: &[UnifiedModelListItem], id: &str) -> UnifiedModel {
        items
            .iter()
            .find_map(|item| match item {
                UnifiedModelListItem::Unified(unified) if unified.id == id => Some(unified.clone()),
                _ => None,
            })
            .unwrap()
    }

    fn corrupted_unified_ids(items: &[UnifiedModelListItem]) -> Vec<String> {
        items
            .iter()
            .filter_map(|item| match item {
                UnifiedModelListItem::Corrupted(corrupted) => Some(corrupted.id.clone()),
                _ => None,
            })
            .collect()
    }

    fn row_count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0)).unwrap()
    }

    #[test]
    fn create_and_list_round_trip_every_field() {
        let conn = memory_db();
        let spec = full_config();
        let created = create(&conn, &spec).unwrap();

        assert!(uuid::Uuid::parse_str(&created.id).is_ok(), "provider id must be a UUID");
        assert_eq!(created.config, spec);

        let items = list(&conn).unwrap();
        assert_eq!(items.len(), 1);
        assert!(corrupted_provider_ids(&items).is_empty());
        assert_eq!(provider_of(&items, &created.id).config, spec);
    }

    #[test]
    fn list_keeps_creation_order_and_model_draft_order() {
        let conn = memory_db();
        let first = create(&conn, &full_config()).unwrap();
        let second = create(&conn, &simple_config("Second", "second-model")).unwrap();

        let items = list(&conn).unwrap();
        let ids: Vec<&str> = items
            .iter()
            .map(|item| match item {
                ProviderListItem::Provider(provider) => provider.id.as_str(),
                ProviderListItem::Corrupted(_) => "corrupted",
            })
            .collect();
        assert_eq!(ids, vec![first.id.as_str(), second.id.as_str()]);

        let stored = provider_of(&items, &first.id);
        let models: Vec<&str> = stored.config.models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(models, vec!["anthropic/claude-sonnet-5", "gpt-5.2"]);
    }

    #[test]
    fn update_reorders_models_in_place_and_keeps_dependents() {
        let conn = memory_db();
        let created = create(&conn, &full_config()).unwrap();
        let provider_id = created.id.clone();

        // A unified member pins rows that must survive the
        // rewrite; a swapped sort_order would trip UNIQUE (provider_id, sort_order)
        // without the pre-upsert parking step.
        create_unified(
            &conn,
            &UnifiedModel {
                id: "fast".into(),

                members: vec![UnifiedMember {
                    provider_id: provider_id.clone(),
                    model: "gpt-5.2".into(),
                }],
            },
        )
        .unwrap();
        let mut spec = full_config();
        spec.models.reverse();
        spec.name = "Renamed Gateway".into();
        spec.enabled = true;
        let updated = update(&conn, &provider_id, &spec).unwrap();
        assert_eq!(updated.id, provider_id);
        assert_eq!(updated.config, spec);

        let stored = provider_of(&list(&conn).unwrap(), &provider_id);
        assert_eq!(stored.config, spec);
        let models: Vec<&str> = stored.config.models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(models, vec!["gpt-5.2", "anthropic/claude-sonnet-5"]);
        assert_eq!(unified_of(&list_unified(&conn).unwrap(), "fast").members.len(), 1);
    }

    #[test]
    fn update_removes_deleted_models_and_prunes_what_depended_on_them() {
        let conn = memory_db();
        let created = create(&conn, &full_config()).unwrap();
        let provider_id = created.id.clone();
        create_unified(
            &conn,
            &UnifiedModel {
                id: "fast".into(),

                members: vec![
                    UnifiedMember {
                        provider_id: provider_id.clone(),
                        model: "anthropic/claude-sonnet-5".into(),
                    },
                    UnifiedMember { provider_id: provider_id.clone(), model: "gpt-5.2".into() },
                ],
            },
        )
        .unwrap();
        // Dropping a pinned model takes the member with it.
        let mut spec = full_config();
        spec.models.retain(|model| model.id != "anthropic/claude-sonnet-5");
        update(&conn, &provider_id, &spec).unwrap();
        let unified = unified_of(&list_unified(&conn).unwrap(), "fast");
        assert_eq!(unified.members.len(), 1);
        assert_eq!(unified.members[0].model, "gpt-5.2");

        // Dropping the last member leaves the aggregate empty, so it goes too.
        spec.models.clear();
        update(&conn, &provider_id, &spec).unwrap();
        assert!(list_unified(&conn).unwrap().is_empty());
        assert_eq!(row_count(&conn, "models"), 0);
        assert_eq!(list(&conn).unwrap().len(), 1);
    }

    #[test]
    fn delete_provider_clears_its_dependents_and_leaves_others_whole() {
        let conn = memory_db();
        let doomed = create(&conn, &full_config()).unwrap();
        let kept = create(&conn, &simple_config("Secondary", "kept-model")).unwrap();

        create_unified(
            &conn,
            &UnifiedModel {
                id: "shared".into(),

                members: vec![
                    UnifiedMember { provider_id: doomed.id.clone(), model: "gpt-5.2".into() },
                    UnifiedMember { provider_id: kept.id.clone(), model: "kept-model".into() },
                ],
            },
        )
        .unwrap();
        create_unified(
            &conn,
            &UnifiedModel {
                id: "doomed-only".into(),

                members: vec![UnifiedMember {
                    provider_id: doomed.id.clone(),
                    model: "gpt-5.2".into(),
                }],
            },
        )
        .unwrap();
        delete(&conn, &doomed.id).unwrap();

        assert_eq!(row_count(&conn, "providers"), 1);
        let models: Vec<String> = {
            let mut stmt = conn.prepare("SELECT id FROM models ORDER BY id").unwrap();
            let ids =
                stmt.query_map([], |row| row.get(0)).unwrap().map(|row| row.unwrap()).collect();
            ids
        };
        assert_eq!(models, vec!["kept-model"]);

        // The shared aggregate shrank to its surviving member; the one pinned only
        // to the deleted provider is gone.
        let items = list_unified(&conn).unwrap();
        assert_eq!(items.len(), 1);
        let shared = unified_of(&items, "shared");
        assert_eq!(
            shared.members,
            vec![UnifiedMember { provider_id: kept.id.clone(), model: "kept-model".into() }]
        );
    }

    #[test]
    fn a_damaged_provider_row_degrades_without_failing_the_list() {
        let conn = memory_db();
        let damaged = create(&conn, &simple_config("Damaged", "m1")).unwrap();
        let model_damage = create(&conn, &simple_config("Model damage", "m2")).unwrap();
        let range_damage = create(&conn, &simple_config("Range damage", "m3")).unwrap();
        let healthy = create(&conn, &full_config()).unwrap();

        conn.execute(
            "UPDATE providers SET headers = 'not json' WHERE id = ?1",
            params![damaged.id],
        )
        .unwrap();
        conn.execute(
            "UPDATE models SET cost = '{{' WHERE provider_id = ?1",
            params![model_damage.id],
        )
        .unwrap();
        conn.execute(
            "UPDATE models SET max_tokens = -1 WHERE provider_id = ?1",
            params![range_damage.id],
        )
        .unwrap();

        let items = list(&conn).unwrap();
        assert_eq!(items.len(), 4);
        let mut corrupted = corrupted_provider_ids(&items);
        corrupted.sort();
        let mut expected =
            vec![damaged.id.clone(), model_damage.id.clone(), range_damage.id.clone()];
        expected.sort();
        assert_eq!(corrupted, expected);
        // The intact neighbour still reads back completely.
        assert_eq!(provider_of(&items, &healthy.id).config, full_config());
    }

    #[test]
    fn a_unified_model_with_a_dangling_member_degrades_without_failing_the_list() {
        let conn = memory_db();
        let provider = create(&conn, &simple_config("Primary", "m1")).unwrap();
        for id in ["healthy", "dangling"] {
            create_unified(
                &conn,
                &UnifiedModel {
                    id: id.into(),

                    members: vec![UnifiedMember {
                        provider_id: provider.id.clone(),
                        model: "m1".into(),
                    }],
                },
            )
            .unwrap();
        }

        // A database edited outside the app can hold a member whose model row is
        // gone; foreign keys are off for this single write to reproduce that state.
        conn.pragma_update(None, "foreign_keys", false).unwrap();
        conn.execute(
            "UPDATE unified_model_members SET model = 'ghost' WHERE unified_id = 'dangling'",
            [],
        )
        .unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();

        let items = list_unified(&conn).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(corrupted_unified_ids(&items), vec!["dangling".to_string()]);
        assert_eq!(unified_of(&items, "healthy").members.len(), 1);
    }

    #[test]
    fn unified_models_round_trip_reorder_and_rename() {
        let conn = memory_db();
        let provider = create(&conn, &simple_config("Primary", "m1")).unwrap();
        let second = create(&conn, &simple_config("Secondary", "m2")).unwrap();

        let spec = UnifiedModel {
            id: "fast".into(),

            members: vec![
                UnifiedMember { provider_id: provider.id.clone(), model: "m1".into() },
                UnifiedMember { provider_id: second.id.clone(), model: "m2".into() },
            ],
        };
        assert_eq!(create_unified(&conn, &spec).unwrap(), spec);
        assert_eq!(unified_of(&list_unified(&conn).unwrap(), "fast"), spec);

        // Renaming and reordering in one update rewrites positions wholesale.
        let renamed = UnifiedModel {
            id: "faster".into(),

            members: vec![
                UnifiedMember { provider_id: second.id.clone(), model: "m2".into() },
                UnifiedMember { provider_id: provider.id.clone(), model: "m1".into() },
            ],
        };
        assert_eq!(update_unified(&conn, "fast", &renamed).unwrap(), renamed);
        let items = list_unified(&conn).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(unified_of(&items, "faster"), renamed);

        delete_unified(&conn, "faster").unwrap();
        assert!(list_unified(&conn).unwrap().is_empty());
        assert_eq!(
            row_count(&conn, "unified_model_members"),
            0,
            "members must not outlive their aggregate"
        );
        assert_eq!(delete_unified(&conn, "faster").unwrap_err().code, ErrorCode::NotFound);
        assert_eq!(
            update_unified(&conn, "faster", &renamed).unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[test]
    fn writes_to_a_missing_provider_report_not_found() {
        let conn = memory_db();
        assert_eq!(
            update(&conn, "missing", &simple_config("Nope", "m1")).unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(delete(&conn, "missing").unwrap_err().code, ErrorCode::NotFound);
    }

    #[test]
    fn failed_create_leaves_all_five_tables_empty() {
        let conn = memory_db();
        // A trigger failing on the model insert reproduces a mid-transaction failure
        // after the provider row was already written in the same transaction.
        conn.execute(
            "CREATE TRIGGER fail_model_insert BEFORE INSERT ON models
             BEGIN SELECT RAISE(ABORT, 'injected'); END",
            [],
        )
        .unwrap();

        assert!(create(&conn, &full_config()).is_err());
        for table in ["providers", "models", "unified_models", "unified_model_members"] {
            assert_eq!(row_count(&conn, table), 0, "a failed create must leave {table} untouched");
        }
    }

    #[test]
    fn failed_update_rolls_back_the_model_diff_and_its_dependents() {
        let conn = memory_db();
        let created = create(&conn, &full_config()).unwrap();
        create_unified(
            &conn,
            &UnifiedModel {
                id: "fast".into(),

                members: vec![UnifiedMember {
                    provider_id: created.id.clone(),
                    model: "gpt-5.2".into(),
                }],
            },
        )
        .unwrap();
        // The failing statement is the provider UPDATE, i.e. after the model diff:
        // every earlier statement of the transaction must roll back with it.
        conn.execute(
            "CREATE TRIGGER fail_provider_update BEFORE UPDATE ON providers
             BEGIN SELECT RAISE(ABORT, 'injected'); END",
            [],
        )
        .unwrap();
        let mut spec = full_config();
        spec.models.clear();
        assert!(update(&conn, &created.id, &spec).is_err());

        assert_eq!(provider_of(&list(&conn).unwrap(), &created.id).config, full_config());
        assert_eq!(unified_of(&list_unified(&conn).unwrap(), "fast").members.len(), 1);
    }
}
