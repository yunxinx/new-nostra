use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::db::repo::providers::{ProviderListItem, UnifiedModelListItem};
use crate::error::AppError;
use crate::provider::config::ResolvedCompat;
use crate::provider::vendors::VendorProfile;
use crate::state::AppState;
use crate::types::{
    CorruptedProvider, CorruptedUnified, ModelEntry, Protocol, Provider, ProviderConfig,
    ReasoningOutputMode, SecretString, UnifiedMember, UnifiedModel,
};

/// Draft shape of the provider writes: the configuration carries no id of its
/// own — create generates one and update names it by the path parameter — and a
/// submitted draft replaces the stored row wholesale.
pub type ProviderDraft = ProviderConfig;

/// Draft shape of the unified-model writes: `id` is the aggregate's visible name,
/// so a draft whose id differs from the path parameter is a rename.
pub type UnifiedModelDraft = UnifiedModel;

/// Wire shape of one provider: its id plus the whole configuration. A key the
/// domain type omits (unset optional field) is omitted here too, so an absent
/// key means "not set" on both sides.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDto {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api: Protocol,
    pub api_key: SecretString,
    pub enabled: bool,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub headers: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compat: Option<BTreeMap<Protocol, serde_json::Value>>,
    pub request_timeout_ms: u32,
    pub stream_idle_timeout_ms: u32,
    pub max_retries: u32,
    pub abort_on_disconnect: bool,
    pub reasoning_output: ReasoningOutputMode,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub models: Vec<ModelEntry>,
}

impl From<Provider> for ProviderDto {
    fn from(provider: Provider) -> Self {
        // Destructured so a new domain field cannot be dropped silently here.
        let ProviderConfig {
            name,
            base_url,
            api,
            api_key,
            enabled,
            headers,
            compat,
            request_timeout_ms,
            stream_idle_timeout_ms,
            max_retries,
            abort_on_disconnect,
            reasoning_output,
            models,
        } = provider.config;
        ProviderDto {
            id: provider.id,
            name,
            base_url,
            api,
            api_key,
            enabled,
            headers,
            compat,
            request_timeout_ms,
            stream_idle_timeout_ms,
            max_retries,
            abort_on_disconnect,
            reasoning_output,
            models,
        }
    }
}

/// One element of `list_providers`: a decoded provider, or the placeholder
/// standing in for a row whose stored columns no longer decode.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum ProviderListItemDto {
    Provider(ProviderDto),
    Corrupted(CorruptedProvider),
}

impl From<ProviderListItem> for ProviderListItemDto {
    fn from(item: ProviderListItem) -> Self {
        match item {
            ProviderListItem::Provider(provider) => ProviderListItemDto::Provider(provider.into()),
            ProviderListItem::Corrupted(corrupted) => ProviderListItemDto::Corrupted(corrupted),
        }
    }
}

/// Payload of `list_providers`: every stored provider in creation order.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidersDto {
    pub providers: Vec<ProviderListItemDto>,
}

/// Wire shape of one unified model: independent name and ordered members.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedModelDto {
    pub id: String,

    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub members: Vec<UnifiedMember>,
}

impl From<UnifiedModel> for UnifiedModelDto {
    fn from(unified: UnifiedModel) -> Self {
        UnifiedModelDto { id: unified.id, members: unified.members }
    }
}

/// One element of `list_unified_models`, with the same degraded-row handling as
/// [`ProviderListItemDto`].
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum UnifiedModelListItemDto {
    Unified(UnifiedModelDto),
    Corrupted(CorruptedUnified),
}

impl From<UnifiedModelListItem> for UnifiedModelListItemDto {
    fn from(item: UnifiedModelListItem) -> Self {
        match item {
            UnifiedModelListItem::Unified(unified) => {
                UnifiedModelListItemDto::Unified(unified.into())
            }
            UnifiedModelListItem::Corrupted(corrupted) => {
                UnifiedModelListItemDto::Corrupted(corrupted)
            }
        }
    }
}

/// One built-in vendor preset: the full prefill of a new provider except the key,
/// which no preset carries. `compat` holds the vendor's explicit
/// specialisations, so a prefilled form opens on the values the vendor needs.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderPresetDto {
    pub preset_id: String,
    pub name: String,
    pub api: Protocol,
    pub base_url: String,
    pub headers: BTreeMap<String, String>,
    pub compat: BTreeMap<Protocol, serde_json::Value>,
    pub models: Vec<ModelEntry>,
}

impl From<&VendorProfile> for ProviderPresetDto {
    fn from(vendor: &VendorProfile) -> Self {
        ProviderPresetDto {
            preset_id: vendor.preset_id.to_owned(),
            name: vendor.name.to_owned(),
            api: vendor.api.clone(),
            base_url: vendor.base_url.to_owned(),
            headers: vendor.headers.clone(),
            compat: vendor.compat.clone(),
            models: vendor.models.clone(),
        }
    }
}

/// Wire shape of the effective-value view: the merged compat values plus the
/// layer that supplied each field. An alias rather than a mirrored struct
/// because the resolution result already is that shape.
pub type ResolvedCompatDto = ResolvedCompat;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProviderParams {
    pub provider: ProviderDraft,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProviderParams {
    pub id: String,
    pub provider: ProviderDraft,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteProviderParams {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUnifiedModelParams {
    pub unified: UnifiedModelDraft,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUnifiedModelParams {
    pub id: String,
    pub unified: UnifiedModelDraft,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteUnifiedModelParams {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveCompatParams {
    pub provider: ProviderDraft,
    /// Absent asks for the provider-level view, which stops before the model
    /// compat layer.
    pub model: Option<ModelEntry>,
    pub protocol: Protocol,
}

/// Command bodies over a plain connection. The write paths check the stored
/// provider set (name uniqueness, member registration)
/// inside the same connection guard as the write itself, so
/// no other writer can slip between check and write; keeping them out of the
/// `#[tauri::command]` wrappers lets tests exercise a rejected write against a
/// real stored state.
mod operations {
    use rusqlite::Connection;

    use crate::db::repo::providers;
    use crate::error::ErrorCode;
    use crate::provider::config::{
        normalize_base_url, resolve_compat as resolve_effective_compat, validate_provider,
        validate_unified_model,
    };
    use crate::provider::vendors;

    use super::*;

    fn invalid(message: impl Into<String>) -> AppError {
        AppError { code: ErrorCode::InvalidInput, message: message.into() }
    }

    pub(super) fn list_providers(conn: &Connection) -> Result<ProvidersDto, AppError> {
        Ok(ProvidersDto { providers: providers::list(conn)?.into_iter().map(Into::into).collect() })
    }

    pub(super) fn list_provider_presets() -> Vec<ProviderPresetDto> {
        vendors::vendors().iter().map(ProviderPresetDto::from).collect()
    }

    pub(super) fn create_provider(
        conn: &Connection,
        draft: &ProviderDraft,
    ) -> Result<ProviderDto, AppError> {
        let spec = prepared_provider(conn, draft, None)?;
        providers::create(conn, &spec).map(Into::into)
    }

    pub(super) fn update_provider(
        conn: &Connection,
        id: &str,
        draft: &ProviderDraft,
    ) -> Result<ProviderDto, AppError> {
        let spec = prepared_provider(conn, draft, Some(id))?;
        providers::update(conn, id, &spec).map(Into::into)
    }

    pub(super) fn delete_provider(conn: &Connection, id: &str) -> Result<(), AppError> {
        providers::delete(conn, id)
    }

    /// The GUI's effective-value view: a pure merge over the submitted draft, so
    /// no stored state is read and no draft field is rejected — the panel shows
    /// values for whatever the form currently holds.
    pub(super) fn resolve_compat(
        provider: &ProviderDraft,
        model: Option<&ModelEntry>,
        protocol: &Protocol,
    ) -> ResolvedCompatDto {
        let mut provider = provider.clone();
        // The drafts arrive mid-edit: strip padding and trailing slashes from both
        // URLs so host detection sees the hosts a save would store. An unparseable
        // URL stays as submitted, leaving detection the request-name path instead
        // of failing.
        if let Ok(normalized) = normalize_base_url(&provider.base_url) {
            provider.base_url = normalized;
        }
        let mut model = model.cloned();
        if let Some(entry) = &mut model {
            if let Some(url) = entry.base_url.as_deref() {
                if let Ok(normalized) = normalize_base_url(url) {
                    entry.base_url = Some(normalized);
                }
            }
        }
        resolve_effective_compat(&provider, model.as_ref(), protocol)
    }

    pub(super) fn list_unified_models(
        conn: &Connection,
    ) -> Result<Vec<UnifiedModelListItemDto>, AppError> {
        Ok(providers::list_unified(conn)?.into_iter().map(Into::into).collect())
    }

    pub(super) fn create_unified_model(
        conn: &Connection,
        draft: &UnifiedModelDraft,
    ) -> Result<UnifiedModelDto, AppError> {
        validate_unified_model(draft)?;
        let (stored, unified) = read_write_state(conn)?;
        ensure_members_registered(&stored, draft)?;
        ensure_unified_id_free(&unified, &draft.id, None)?;
        providers::create_unified(conn, draft).map(Into::into)
    }

    pub(super) fn update_unified_model(
        conn: &Connection,
        id: &str,
        draft: &UnifiedModelDraft,
    ) -> Result<UnifiedModelDto, AppError> {
        validate_unified_model(draft)?;
        let (stored, unified) = read_write_state(conn)?;
        ensure_members_registered(&stored, draft)?;
        ensure_unified_id_free(&unified, &draft.id, Some(id))?;
        providers::update_unified(conn, id, draft).map(Into::into)
    }

    pub(super) fn delete_unified_model(conn: &Connection, id: &str) -> Result<(), AppError> {
        providers::delete_unified(conn, id)
    }

    /// Validates a provider draft against the stored state and returns the row
    /// form to write: `replaced_id` names the row an update overwrites (`None` on
    /// create), so the row being rewritten never conflicts with itself.
    fn prepared_provider(
        conn: &Connection,
        draft: &ProviderDraft,
        replaced_id: Option<&str>,
    ) -> Result<ProviderConfig, AppError> {
        let mut spec = draft.clone();
        // Stored base URLs are normalized: validation accepts the raw form but a
        // stored trailing slash would double up when the endpoint path is appended.
        spec.base_url = normalize_base_url(&spec.base_url)?;
        for model in &mut spec.models {
            if let Some(base_url) = model.base_url.take() {
                model.base_url = Some(normalize_base_url(&base_url)?);
            }
        }
        validate_provider(&spec)?;

        let (stored, _) = read_write_state(conn)?;
        ensure_provider_name_free(&stored, &spec.name, replaced_id)?;
        Ok(spec)
    }

    /// The decoded stored state the write checks read. A corrupted row carries no
    /// readable names, so it stays out of the checks: the schema constraints
    /// (unique names, foreign keys) remain its only guard.
    fn read_write_state(conn: &Connection) -> Result<(Vec<Provider>, Vec<UnifiedModel>), AppError> {
        let providers = providers::list(conn)?
            .into_iter()
            .filter_map(|item| match item {
                ProviderListItem::Provider(provider) => Some(provider),
                ProviderListItem::Corrupted(_) => None,
            })
            .collect();
        let unified = providers::list_unified(conn)?
            .into_iter()
            .filter_map(|item| match item {
                UnifiedModelListItem::Unified(unified) => Some(unified),
                UnifiedModelListItem::Corrupted(_) => None,
            })
            .collect();
        Ok((providers, unified))
    }

    /// Provider names are unique across rows. Comparison is exact, the same
    /// semantics the unique index gives stored rows, so a name differing only in
    /// surrounding whitespace stays a second provider.
    fn ensure_provider_name_free(
        stored: &[Provider],
        name: &str,
        replaced_id: Option<&str>,
    ) -> Result<(), AppError> {
        let taken = stored.iter().any(|provider| {
            provider.config.name == name && Some(provider.id.as_str()) != replaced_id
        });
        if taken {
            return Err(invalid(format!("provider name `{name}` is already taken")));
        }
        Ok(())
    }

    /// The visible name is the row id, so create and rename must both leave the
    /// stored names unique.
    fn ensure_unified_id_free(
        unified: &[UnifiedModel],
        id: &str,
        replaced_id: Option<&str>,
    ) -> Result<(), AppError> {
        let taken =
            unified.iter().any(|model| model.id == id && Some(model.id.as_str()) != replaced_id);
        if taken {
            return Err(invalid(format!("unified model `{id}` already exists")));
        }
        Ok(())
    }

    /// Members pin `(provider, model)` pairs of registered models. The composite
    /// foreign key would reject a dangling pair too; this check turns that into a
    /// readable `InvalidInput` before the write. Registration is the gate, not
    /// availability: a disabled provider's model may be pinned.
    fn ensure_members_registered(
        stored: &[Provider],
        draft: &UnifiedModel,
    ) -> Result<(), AppError> {
        for member in &draft.members {
            let registered =
                stored.iter().find(|provider| provider.id == member.provider_id).is_some_and(
                    |provider| provider.config.models.iter().any(|model| model.id == member.model),
                );
            if !registered {
                return Err(invalid(format!(
                    "unified model member `{}/{}` is not a registered model",
                    member.provider_id, member.model
                )));
            }
        }
        Ok(())
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCatalogChanged {
    scope: &'static str,
}

fn notify_catalog_change(app: &AppHandle) {
    if let Err(error) = app.emit("providers://changed", ProviderCatalogChanged { scope: "catalog" })
    {
        log::error!("catalog change notification failed: {error}");
    }
}

#[tauri::command]
pub async fn list_providers(state: State<'_, AppState>) -> Result<ProvidersDto, AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures("list_providers", operations::list_providers(&conn))
}

#[tauri::command]
pub fn list_provider_presets() -> Result<Vec<ProviderPresetDto>, AppError> {
    Ok(operations::list_provider_presets())
}

#[tauri::command]
pub async fn create_provider(
    app: AppHandle,
    state: State<'_, AppState>,
    params: CreateProviderParams,
) -> Result<ProviderDto, AppError> {
    let conn = state.db.lock().await;
    let result = super::log_command_failures(
        "create_provider",
        operations::create_provider(&conn, &params.provider),
    );
    drop(conn);
    if result.is_ok() {
        notify_catalog_change(&app);
    }
    result
}

#[tauri::command]
pub async fn update_provider(
    app: AppHandle,
    state: State<'_, AppState>,
    params: UpdateProviderParams,
) -> Result<ProviderDto, AppError> {
    let conn = state.db.lock().await;
    let result = super::log_command_failures(
        "update_provider",
        operations::update_provider(&conn, &params.id, &params.provider),
    );
    drop(conn);
    if result.is_ok() {
        notify_catalog_change(&app);
    }
    result
}

#[tauri::command]
pub async fn delete_provider(
    app: AppHandle,
    state: State<'_, AppState>,
    params: DeleteProviderParams,
) -> Result<(), AppError> {
    let conn = state.db.lock().await;
    let result = super::log_command_failures(
        "delete_provider",
        operations::delete_provider(&conn, &params.id),
    );
    drop(conn);
    if result.is_ok() {
        notify_catalog_change(&app);
    }
    result
}

// Reason: Tauri deserializes command arguments into owned values, so a borrowed
// parameter cannot satisfy the command contract. Revoke if command arguments
// ever gain a borrowed form.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn resolve_compat(params: ResolveCompatParams) -> Result<ResolvedCompatDto, AppError> {
    Ok(operations::resolve_compat(&params.provider, params.model.as_ref(), &params.protocol))
}

#[tauri::command]
pub async fn list_unified_models(
    state: State<'_, AppState>,
) -> Result<Vec<UnifiedModelListItemDto>, AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures("list_unified_models", operations::list_unified_models(&conn))
}

#[tauri::command]
pub async fn create_unified_model(
    app: AppHandle,
    state: State<'_, AppState>,
    params: CreateUnifiedModelParams,
) -> Result<UnifiedModelDto, AppError> {
    let conn = state.db.lock().await;
    let result = super::log_command_failures(
        "create_unified_model",
        operations::create_unified_model(&conn, &params.unified),
    );
    drop(conn);
    if result.is_ok() {
        notify_catalog_change(&app);
    }
    result
}

#[tauri::command]
pub async fn update_unified_model(
    app: AppHandle,
    state: State<'_, AppState>,
    params: UpdateUnifiedModelParams,
) -> Result<UnifiedModelDto, AppError> {
    let conn = state.db.lock().await;
    let result = super::log_command_failures(
        "update_unified_model",
        operations::update_unified_model(&conn, &params.id, &params.unified),
    );
    drop(conn);
    if result.is_ok() {
        notify_catalog_change(&app);
    }
    result
}

#[tauri::command]
pub async fn delete_unified_model(
    app: AppHandle,
    state: State<'_, AppState>,
    params: DeleteUnifiedModelParams,
) -> Result<(), AppError> {
    let conn = state.db.lock().await;
    let result = super::log_command_failures(
        "delete_unified_model",
        operations::delete_unified_model(&conn, &params.id),
    );
    drop(conn);
    if result.is_ok() {
        notify_catalog_change(&app);
    }
    result
}

#[cfg(test)]
mod tests {
    use std::sync::{Mutex, Once};

    use rusqlite::Connection;
    use serde_json::json;

    use crate::db::run_migrations;
    use crate::error::ErrorCode;
    use crate::types::{InputModality, Protocol, ReasoningOutputMode};

    use super::*;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    /// A model with one checked protocol and nothing else set.
    fn model(id: &str) -> ModelEntry {
        ModelEntry {
            id: id.into(),
            name: None,
            apis: vec![Protocol::from("openai-completions")],
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

    fn provider(name: &str, enabled: bool, models: Vec<ModelEntry>) -> ProviderConfig {
        ProviderConfig {
            name: name.into(),
            base_url: "https://api.example.com/v1".into(),
            api: Protocol::from("openai-completions"),
            api_key: SecretString::from("sk-key"),
            enabled,
            headers: BTreeMap::new(),
            compat: None,
            request_timeout_ms: 120_000,
            stream_idle_timeout_ms: 120_000,
            max_retries: 2,
            abort_on_disconnect: true,
            reasoning_output: ReasoningOutputMode::Auto,
            models,
        }
    }

    fn listed(conn: &Connection) -> serde_json::Value {
        serde_json::to_value(operations::list_providers(conn).unwrap()).unwrap()
    }

    fn row_of(listed: &serde_json::Value, id: &str) -> serde_json::Value {
        listed["providers"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["id"] == json!(id))
            .cloned()
            .unwrap()
    }

    #[test]
    fn provider_dto_pins_the_domain_wire_shape() {
        let stored =
            Provider { id: "p1".into(), config: provider("Primary", true, vec![model("gpt-5")]) };
        let dto = serde_json::to_value(ProviderDto::from(stored.clone())).unwrap();
        assert_eq!(dto, serde_json::to_value(&stored).unwrap());

        assert_eq!(dto["id"], "p1");
        assert_eq!(dto["baseUrl"], "https://api.example.com/v1");
        assert_eq!(dto["apiKey"], "sk-key", "the key travels with the provider document");
        assert_eq!(dto["requestTimeoutMs"], 120_000);
        assert_eq!(dto["streamIdleTimeoutMs"], 120_000);
        assert_eq!(dto["maxRetries"], 2);
        assert_eq!(dto["abortOnDisconnect"], true);
        assert_eq!(dto["reasoningOutput"], "auto");
        assert_eq!(dto["models"][0]["apis"], json!(["openai-completions"]));
        // An unset optional field stays absent rather than becoming null.
        assert!(dto.get("compat").is_none());
        assert!(dto["models"][0].get("cost").is_none());

        let unified = UnifiedModel {
            id: "fast".into(),

            members: vec![UnifiedMember { provider_id: "p1".into(), model: "gpt-5".into() }],
        };
        assert_eq!(
            serde_json::to_value(UnifiedModelDto::from(unified.clone())).unwrap(),
            serde_json::to_value(&unified).unwrap()
        );
    }

    #[test]
    fn list_items_serialize_corrupted_placeholders_with_the_tag() {
        let corrupted = ProviderListItem::Corrupted(CorruptedProvider { id: "p1".into() });
        assert_eq!(
            serde_json::to_value(ProviderListItemDto::from(corrupted)).unwrap(),
            json!({ "id": "p1", "corrupted": true })
        );
        let corrupted = UnifiedModelListItem::Corrupted(CorruptedUnified { id: "fast".into() });
        assert_eq!(
            serde_json::to_value(UnifiedModelListItemDto::from(corrupted)).unwrap(),
            json!({ "id": "fast", "corrupted": true })
        );

        let healthy = Provider { id: "p2".into(), config: provider("Healthy", true, Vec::new()) };
        let value =
            serde_json::to_value(ProviderListItemDto::from(ProviderListItem::Provider(healthy)))
                .unwrap();
        assert_eq!(value["id"], "p2");
        assert!(value.get("corrupted").is_none());
    }

    #[test]
    fn params_deserialize_camel_case_payloads() {
        let create: CreateProviderParams = serde_json::from_value(json!({
            "provider": {
                "name": "Local",
                "baseUrl": "https://api.example.com/v1",
                "api": "openai-completions",
                "apiKey": "sk-1",
                "models": [{ "id": "m1", "apis": ["openai-completions"], "contextWindow": 4096 }]
            }
        }))
        .unwrap();
        assert_eq!(create.provider.base_url, "https://api.example.com/v1");
        assert_eq!(create.provider.api_key.expose(), "sk-1");
        assert_eq!(create.provider.models[0].context_window, Some(4096));
        // Keys the contract leaves out fall back to their documented default.
        assert_eq!(create.provider.request_timeout_ms, 120_000);
        assert!(create.provider.enabled);

        let update: UpdateProviderParams = serde_json::from_value(json!({
            "id": "p1",
            "provider": {
                "name": "Local",
                "baseUrl": "https://api.example.com/v1",
                "api": "openai-completions"
            }
        }))
        .unwrap();
        assert_eq!(update.id, "p1");
        assert!(update.provider.models.is_empty());
        assert_eq!(update.provider.api_key.expose(), "");

        let create: CreateUnifiedModelParams = serde_json::from_value(json!({
            "unified": { "id": "fast", "members": [{ "providerId": "p1", "model": "m1" }] }
        }))
        .unwrap();
        assert_eq!(create.unified.id, "fast");

        let update: UpdateUnifiedModelParams = serde_json::from_value(json!({
            "id": "fast",
            "unified": {
                "id": "faster",

                "members": [{ "providerId": "p1", "model": "m1" }]
            }
        }))
        .unwrap();
        assert_eq!(update.id, "fast");
        assert_eq!(update.unified.id, "faster");

        assert_eq!(update.unified.members[0].provider_id, "p1");

        let resolve: ResolveCompatParams = serde_json::from_value(json!({
            "provider": {
                "name": "Local",
                "baseUrl": "https://api.example.com/v1",
                "api": "openai-completions"
            },
            "protocol": "anthropic-messages"
        }))
        .unwrap();
        assert_eq!(resolve.provider.name, "Local");
        assert_eq!(resolve.protocol.as_str(), "anthropic-messages");
        assert!(resolve.model.is_none(), "the model layer is optional");

        let resolve: ResolveCompatParams = serde_json::from_value(json!({
            "provider": {
                "name": "Local",
                "baseUrl": "https://api.example.com/v1",
                "api": "openai-completions"
            },
            "model": { "id": "m1", "apis": ["openai-completions"] },
            "protocol": "openai-completions"
        }))
        .unwrap();
        assert_eq!(resolve.model.unwrap().id, "m1");

        let delete: DeleteProviderParams = serde_json::from_value(json!({ "id": "p1" })).unwrap();
        assert_eq!(delete.id, "p1");
        let delete: DeleteUnifiedModelParams =
            serde_json::from_value(json!({ "id": "fast" })).unwrap();
        assert_eq!(delete.id, "fast");
    }

    #[test]
    fn a_sparse_draft_is_accepted_and_stored_normalized() {
        let conn = memory_db();
        let mut draft = provider("Local", true, Vec::new());
        draft.base_url = "  https://api.example.com/v1///  ".into();
        draft.api_key = SecretString::default();

        let created = operations::create_provider(&conn, &draft).unwrap();
        assert_eq!(created.base_url, "https://api.example.com/v1");
        assert_eq!(created.api_key.expose(), "", "an empty key is a local endpoint, not an error");
        assert!(created.models.is_empty());

        let mut entry = model("m1");
        entry.base_url = Some("https://proxy.example.com/v1/".into());
        let updated =
            operations::update_provider(&conn, &created.id, &provider("Local", true, vec![entry]))
                .unwrap();
        let stored = serde_json::to_value(&updated).unwrap();
        assert_eq!(stored["baseUrl"], "https://api.example.com/v1");
        assert_eq!(stored["models"][0]["baseUrl"], "https://proxy.example.com/v1");

        // The read path returns the rows the write stored.
        let listed = listed(&conn);
        assert_eq!(listed["providers"][0]["baseUrl"], "https://api.example.com/v1");
        assert_eq!(listed["providers"][0]["models"][0]["baseUrl"], "https://proxy.example.com/v1");
        assert_eq!(listed.as_object().unwrap().len(), 1);
    }

    #[test]
    fn provider_names_are_unique_across_rows() {
        let conn = memory_db();
        operations::create_provider(&conn, &provider("Taken", true, Vec::new())).unwrap();
        assert_eq!(
            operations::create_provider(&conn, &provider("Taken", true, Vec::new()))
                .unwrap_err()
                .code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            operations::create_provider(&conn, &provider("   ", true, Vec::new()))
                .unwrap_err()
                .code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            operations::list_providers(&conn).unwrap().providers.len(),
            1,
            "a rejected create writes nothing"
        );

        let second =
            operations::create_provider(&conn, &provider("Second", true, Vec::new())).unwrap();
        // An update may keep its own name: the row it replaces is not a clash.
        operations::update_provider(&conn, &second.id, &provider("Second", true, Vec::new()))
            .unwrap();
        assert_eq!(
            operations::update_provider(&conn, &second.id, &provider("Taken", true, Vec::new()))
                .unwrap_err()
                .code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            row_of(&listed(&conn), &second.id)["name"],
            "Second",
            "a rejected update keeps the stored row"
        );
    }

    #[test]
    fn provider_and_unified_names_are_independent() {
        let conn = memory_db();
        let first = operations::create_provider(&conn, &provider("A", true, vec![model("shared")]))
            .unwrap();
        let aggregate = UnifiedModel {
            id: "shared".into(),

            members: vec![UnifiedMember { provider_id: first.id.clone(), model: "shared".into() }],
        };
        operations::create_unified_model(&conn, &aggregate).unwrap();
        operations::update_unified_model(&conn, "shared", &aggregate).unwrap();
        let second =
            operations::create_provider(&conn, &provider("B", true, vec![model("shared")]))
                .unwrap();
        operations::update_provider(&conn, &second.id, &provider("B", true, vec![model("shared")]))
            .unwrap();
        assert_eq!(operations::list_providers(&conn).unwrap().providers.len(), 2);
        assert_eq!(operations::list_unified_models(&conn).unwrap().len(), 1);
    }

    #[test]
    fn unified_members_must_pin_registered_models() {
        let conn = memory_db();
        let stored =
            operations::create_provider(&conn, &provider("A", true, vec![model("m1")])).unwrap();

        let unknown_model = UnifiedModel {
            id: "agg".into(),

            members: vec![UnifiedMember { provider_id: stored.id.clone(), model: "ghost".into() }],
        };
        assert_eq!(
            operations::create_unified_model(&conn, &unknown_model).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        let unknown_provider = UnifiedModel {
            id: "agg".into(),

            members: vec![UnifiedMember { provider_id: "ghost".into(), model: "m1".into() }],
        };
        assert_eq!(
            operations::create_unified_model(&conn, &unknown_provider).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        assert!(operations::list_unified_models(&conn).unwrap().is_empty());

        // Registration is the gate, not availability: a disabled provider's model
        // may be pinned.
        let disabled =
            operations::create_provider(&conn, &provider("B", false, vec![model("m2")])).unwrap();
        let aggregate = UnifiedModel {
            id: "agg".into(),

            members: vec![UnifiedMember { provider_id: disabled.id, model: "m2".into() }],
        };
        assert_eq!(operations::create_unified_model(&conn, &aggregate).unwrap().id, "agg");
    }

    #[test]
    fn unified_model_ids_stay_unique() {
        let conn = memory_db();
        let stored =
            operations::create_provider(&conn, &provider("A", true, vec![model("m1")])).unwrap();
        let member = || UnifiedMember { provider_id: stored.id.clone(), model: "m1".into() };
        let agg = UnifiedModel { id: "agg".into(), members: vec![member()] };
        operations::create_unified_model(&conn, &agg).unwrap();
        assert_eq!(
            operations::create_unified_model(&conn, &agg).unwrap_err().code,
            ErrorCode::InvalidInput
        );

        let other = UnifiedModel { id: "other".into(), members: vec![member()] };
        operations::create_unified_model(&conn, &other).unwrap();
        // Renaming onto a taken name is refused; onto a free one it renames.
        assert_eq!(
            operations::update_unified_model(&conn, "other", &agg).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        let renamed = UnifiedModel { id: "renamed".into(), members: vec![member()] };
        assert_eq!(
            operations::update_unified_model(&conn, "other", &renamed).unwrap().id,
            "renamed"
        );
        assert_eq!(operations::list_unified_models(&conn).unwrap().len(), 2);
    }

    #[test]
    fn missing_targets_report_not_found() {
        let conn = memory_db();
        let stored =
            operations::create_provider(&conn, &provider("A", true, vec![model("m1")])).unwrap();
        let draft = UnifiedModel {
            id: "agg".into(),

            members: vec![UnifiedMember { provider_id: stored.id.clone(), model: "m1".into() }],
        };

        assert_eq!(
            operations::delete_provider(&conn, "ghost").unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(
            operations::update_provider(&conn, "ghost", &provider("P", true, Vec::new()))
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        assert_eq!(
            operations::delete_unified_model(&conn, "ghost").unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(
            operations::update_unified_model(&conn, "ghost", &draft).unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[test]
    fn presets_project_the_vendor_catalog_without_keys() {
        let presets = serde_json::to_value(operations::list_provider_presets()).unwrap();
        let presets = presets.as_array().unwrap();
        assert_eq!(presets.len(), 6);

        let deepseek = presets.iter().find(|preset| preset["presetId"] == "deepseek").unwrap();
        assert_eq!(deepseek["name"], "DeepSeek");
        assert_eq!(deepseek["baseUrl"], "https://api.deepseek.com");
        assert_eq!(deepseek["api"], "openai-completions");
        assert_eq!(deepseek["compat"]["openai-completions"]["maxTokensField"], "max_tokens");
        let models = deepseek["models"].as_array().unwrap();
        assert!(!models.is_empty());
        assert!(models[0]["apis"].as_array().is_some_and(|apis| !apis.is_empty()));

        let openrouter = presets.iter().find(|preset| preset["presetId"] == "openrouter").unwrap();
        assert!(openrouter["headers"].as_object().is_some_and(|headers| !headers.is_empty()));

        // No preset carries credentials: the form collects the key from the user.
        assert!(presets.iter().all(|preset| preset.get("apiKey").is_none()));
    }

    #[test]
    fn resolve_compat_of_a_model_less_view_never_names_a_model_layer() {
        let mut draft = provider("Panel", true, Vec::new());
        draft.compat = Some(BTreeMap::from([(
            Protocol::from("openai-completions"),
            json!({ "supportsStore": false, "maxTokensField": null }),
        )]));

        let resolved =
            operations::resolve_compat(&draft, None, &Protocol::from("openai-completions"));
        let view = serde_json::to_value(&resolved).unwrap();
        let values = view["values"].as_object().unwrap();
        let sources = view["sources"].as_object().unwrap();

        // `sources` covers exactly the keys `values` carries, each naming the
        // layer that supplied it; a model-less view stops at the provider layer.
        assert_eq!(sources.len(), values.len());
        assert!(values.keys().all(|field| sources.contains_key(field)));
        assert!(sources.values().all(|source| source != "model"));
        assert_eq!(values["supportsStore"], json!(false));
        assert_eq!(sources["supportsStore"], "provider");
        // An explicit null never clears a lower layer: the family default stays.
        assert_eq!(values["maxTokensField"], json!("max_completion_tokens"));
        assert_eq!(sources["maxTokensField"], "familyDefault");
    }

    #[test]
    fn provider_preview_identifies_presets_by_host_without_storing_an_origin() {
        for (url, expected) in [
            ("https://api.openai.com/v1", Some("openai")),
            ("https://api.moonshot.ai/v1", Some("moonshot")),
            ("https://api.openai.com.other.example/v1", None),
            ("https://api.openai.com@proxy.example/v1", None),
        ] {
            let mut draft = provider("OpenAI", true, vec![model("gpt-5")]);
            draft.base_url = url.into();
            let resolved =
                operations::resolve_compat(&draft, None, &Protocol::from("openai-completions"));
            assert_eq!(resolved.preset_id, expected);
            let wire = serde_json::to_value(resolved).unwrap();
            match expected {
                Some(id) => assert_eq!(wire["presetId"], id),
                None => assert!(wire.get("presetId").is_none()),
            }
        }
    }

    #[test]
    fn resolve_compat_normalizes_a_draft_base_url_before_detection() {
        let mut draft = provider("Panel", true, Vec::new());
        // The field arrives mid-typing, padded and with stray trailing slashes. A
        // model-less view leaves detection the host path alone, so only the
        // normalized URL can select the vendor.
        draft.base_url = "  https://api.deepseek.com///  ".into();

        let resolved =
            operations::resolve_compat(&draft, None, &Protocol::from("openai-completions"));
        let view = serde_json::to_value(&resolved).unwrap();
        assert_eq!(view["values"]["supportsStore"], json!(false));
        assert_eq!(view["sources"]["supportsStore"], "vendor");
        assert_eq!(view["values"]["maxTokensField"], json!("max_tokens"));
        assert_eq!(view["sources"]["maxTokensField"], "vendor");

        // A model URL override replaces the provider URL, so detection must read
        // the normalized override. The provider URL matches no vendor and the
        // request name matches no model prefix, leaving the override the only
        // reachable host.
        let mut draft = provider("Panel", true, Vec::new());
        draft.base_url = "https://gateway.example/v1".into();
        let mut entry = model("m1");
        entry.base_url = Some("  https://api.deepseek.com///  ".into());

        let resolved =
            operations::resolve_compat(&draft, Some(&entry), &Protocol::from("openai-completions"));
        let view = serde_json::to_value(&resolved).unwrap();
        assert_eq!(view["values"]["supportsStore"], json!(false));
        assert_eq!(view["sources"]["supportsStore"], "vendor");
        assert_eq!(view["sources"]["thinkingFormat"], "vendor");
    }

    #[test]
    fn resolve_compat_stacks_the_model_bucket_over_the_provider_bucket() {
        let mut draft = provider("Local", true, Vec::new());
        draft.compat = Some(BTreeMap::from([(
            Protocol::from("openai-completions"),
            json!({ "supportsStore": false, "requiresToolResultName": true }),
        )]));
        let mut entry = model("m1");
        entry.compat = Some(BTreeMap::from([(
            Protocol::from("openai-completions"),
            json!({ "maxTokensField": "max_tokens" }),
        )]));

        let resolved =
            operations::resolve_compat(&draft, Some(&entry), &Protocol::from("openai-completions"));
        let view = serde_json::to_value(&resolved).unwrap();
        let values = view["values"].as_object().unwrap();
        let sources = view["sources"].as_object().unwrap();

        assert_eq!(sources.len(), values.len());
        assert_eq!(values["maxTokensField"], json!("max_tokens"));
        assert_eq!(sources["maxTokensField"], "model");
        // Fields the model bucket leaves alone keep the provider layer.
        assert_eq!(values["supportsStore"], json!(false));
        assert_eq!(sources["supportsStore"], "provider");
        assert_eq!(values["requiresToolResultName"], json!(true));
        assert_eq!(sources["requiresToolResultName"], "provider");
    }

    /// Captures whatever the `log` facade emits, so a test can pin both what the
    /// command gate logs and what the write paths stay silent about.
    struct CaptureLogger;

    static CAPTURED: Mutex<Vec<(log::Level, String)>> = Mutex::new(Vec::new());
    static INSTALL: Once = Once::new();

    impl log::Log for CaptureLogger {
        fn enabled(&self, _: &log::Metadata<'_>) -> bool {
            true
        }

        fn log(&self, record: &log::Record<'_>) {
            if let Ok(mut captured) = CAPTURED.lock() {
                captured.push((record.level(), format!("{}: {}", record.target(), record.args())));
            }
        }

        fn flush(&self) {}
    }

    fn capture_from_here() -> usize {
        INSTALL.call_once(|| {
            let _ = log::set_logger(&CaptureLogger);
            log::set_max_level(log::LevelFilter::Trace);
        });
        CAPTURED.lock().unwrap().len()
    }

    fn records_since(start: usize) -> Vec<(log::Level, String)> {
        CAPTURED.lock().unwrap().iter().skip(start).cloned().collect()
    }

    #[test]
    fn write_paths_log_nothing_and_never_print_the_key() {
        let conn = memory_db();
        let start = capture_from_here();

        let api_key = "sk-live-0123456789abcdef";
        let mut draft = provider("Logged", true, vec![model("m1")]);
        draft.api_key = SecretString::from(api_key);
        let stored = operations::create_provider(&conn, &draft).unwrap();
        operations::update_provider(&conn, &stored.id, &draft).unwrap();
        // A rejected write is a business flow, not an infrastructure failure.
        assert_eq!(
            operations::create_provider(&conn, &draft).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        operations::delete_provider(&conn, &stored.id).unwrap();

        // The crate logs on its own startup path, so only the command layer is
        // examined for silence — the one place a configuration write could log
        // from; concurrent tests may emit records from other modules meanwhile.
        let command_layer = {
            let mut segments = module_path!().split("::");
            format!("{}::{}", segments.next().unwrap(), segments.next().unwrap())
        };
        for (level, record) in records_since(start) {
            assert!(!record.contains(api_key), "the api key must never reach the log: {record}");
            assert!(
                !record.starts_with(&command_layer),
                "a configuration write logs nothing ({level}): {record}"
            );
        }

        // The gate itself does log an infrastructure failure, so the silence above
        // is the write paths' choice rather than a capture that never fires.
        let failure = AppError { code: ErrorCode::Db, message: "disk gone".into() };
        let _: Result<(), AppError> =
            super::super::log_command_failures("update_provider", Err(failure));
        assert!(records_since(start).iter().any(
            |(level, record)| *level == log::Level::Error && record.contains("update_provider")
        ));
    }
}
