use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::repo::providers::{ProviderListItem, UnifiedModelListItem};
use crate::error::AppError;
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

/// Wire shape of the single default-model reference: a model of a provider.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultModelDto {
    pub provider_id: String,
    pub model_id: String,
}

/// Payload of `list_providers`: every stored provider in creation order plus the
/// default-model reference (`null` while none is set).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidersDto {
    pub providers: Vec<ProviderListItemDto>,
    pub default_model: Option<DefaultModelDto>,
}

/// Wire shape of one unified model: visible name, hide switch, members in
/// attempt order.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedModelDto {
    pub id: String,
    pub hide: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub members: Vec<UnifiedMember>,
}

impl From<UnifiedModel> for UnifiedModelDto {
    fn from(unified: UnifiedModel) -> Self {
        UnifiedModelDto { id: unified.id, hide: unified.hide, members: unified.members }
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
pub struct SetDefaultModelParams {
    pub provider_id: String,
    pub model_id: String,
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

/// Command bodies over a plain connection. The write paths check the stored
/// provider set (name uniqueness, alias conflicts, unified-name collisions,
/// member registration) inside the same connection guard as the write itself, so
/// no other writer can slip between check and write; keeping them out of the
/// `#[tauri::command]` wrappers lets tests exercise a rejected write against a
/// real stored state.
mod operations {
    use std::collections::btree_map::Entry;
    use std::collections::BTreeSet;

    use rusqlite::Connection;

    use crate::db::repo::providers;
    use crate::error::ErrorCode;
    use crate::provider::config::{normalize_base_url, validate_provider, validate_unified_model};
    use crate::provider::vendors;

    use super::*;

    fn invalid(message: impl Into<String>) -> AppError {
        AppError { code: ErrorCode::InvalidInput, message: message.into() }
    }

    pub(super) fn list_providers(conn: &Connection) -> Result<ProvidersDto, AppError> {
        Ok(ProvidersDto {
            providers: providers::list(conn)?.into_iter().map(Into::into).collect(),
            default_model: providers::get_default_model(conn)?
                .map(|(provider_id, model_id)| DefaultModelDto { provider_id, model_id }),
        })
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

    pub(super) fn set_default_model(
        conn: &Connection,
        provider_id: &str,
        model_id: &str,
    ) -> Result<(), AppError> {
        providers::set_default_model(conn, provider_id, model_id)
    }

    pub(super) fn clear_default_model(conn: &Connection) -> Result<(), AppError> {
        providers::clear_default_model(conn)
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
        ensure_unified_name_registered_free(&stored, draft)?;
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
        ensure_unified_name_registered_free(&stored, draft)?;
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

        let (stored, unified) = read_write_state(conn)?;
        ensure_provider_name_free(&stored, &spec.name, replaced_id)?;
        ensure_aliases_unambiguous(&stored, &spec, replaced_id)?;
        ensure_unified_names_free(&unified, &spec)?;
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

    /// Alias keys are downstream reference names: across the enabled providers one
    /// key may point at one upstream model id, so a second target is refused with a
    /// pointer at unified models, the shape made for one-to-many names. Disabled
    /// providers take part in no check, and the row being replaced is not a second
    /// owner of its own aliases. Aliases compare trimmed, the form the draft
    /// validator deduplicates them in.
    fn ensure_aliases_unambiguous(
        stored: &[Provider],
        draft: &ProviderConfig,
        replaced_id: Option<&str>,
    ) -> Result<(), AppError> {
        let mut configs: Vec<&ProviderConfig> = stored
            .iter()
            .filter(|provider| provider.config.enabled && Some(provider.id.as_str()) != replaced_id)
            .map(|provider| &provider.config)
            .collect();
        if draft.enabled {
            configs.push(draft);
        }

        let mut targets: BTreeMap<&str, &str> = BTreeMap::new();
        for config in configs {
            for model in &config.models {
                for alias in &model.aliases {
                    match targets.entry(alias.trim()) {
                        Entry::Vacant(slot) => {
                            slot.insert(model.id.as_str());
                        }
                        Entry::Occupied(slot) if *slot.get() != model.id => {
                            return Err(invalid(format!(
                                "alias `{}` points at both `{}` and `{}`; a name spanning models \
                                 belongs to a unified model",
                                alias.trim(),
                                slot.get(),
                                model.id
                            )));
                        }
                        Entry::Occupied(_) => {}
                    }
                }
            }
        }
        Ok(())
    }

    /// An unhidden unified model owns its name: no model id or alias of the saved
    /// provider may equal it. Hiding the aggregate is the way to take the name
    /// over for provider models.
    fn ensure_unified_names_free(
        unified: &[UnifiedModel],
        spec: &ProviderConfig,
    ) -> Result<(), AppError> {
        let owned: BTreeSet<&str> =
            unified.iter().filter(|model| !model.hide).map(|model| model.id.as_str()).collect();
        for model in &spec.models {
            let names = std::iter::once(model.id.as_str())
                .chain(model.aliases.iter().map(|alias| alias.trim()));
            for name in names {
                if owned.contains(name) {
                    return Err(invalid(format!(
                        "`{name}` names an unhidden unified model; hide that model to use the \
                         name for a provider model"
                    )));
                }
            }
        }
        Ok(())
    }

    /// The mirror of [`ensure_unified_names_free`]: an unhidden aggregate may not
    /// take a name any provider has registered as a model id or alias.
    fn ensure_unified_name_registered_free(
        stored: &[Provider],
        draft: &UnifiedModel,
    ) -> Result<(), AppError> {
        if draft.hide {
            return Ok(());
        }
        for provider in stored {
            for model in &provider.config.models {
                let registered = model.id == draft.id
                    || model.aliases.iter().any(|alias| alias.trim() == draft.id);
                if registered {
                    return Err(invalid(format!(
                        "`{}` is a registered model name; hide the unified model to take it over",
                        draft.id
                    )));
                }
            }
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
    state: State<'_, AppState>,
    params: CreateProviderParams,
) -> Result<ProviderDto, AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "create_provider",
        operations::create_provider(&conn, &params.provider),
    )
}

#[tauri::command]
pub async fn update_provider(
    state: State<'_, AppState>,
    params: UpdateProviderParams,
) -> Result<ProviderDto, AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "update_provider",
        operations::update_provider(&conn, &params.id, &params.provider),
    )
}

#[tauri::command]
pub async fn delete_provider(
    state: State<'_, AppState>,
    params: DeleteProviderParams,
) -> Result<(), AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures("delete_provider", operations::delete_provider(&conn, &params.id))
}

#[tauri::command]
pub async fn set_default_model(
    state: State<'_, AppState>,
    params: SetDefaultModelParams,
) -> Result<(), AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "set_default_model",
        operations::set_default_model(&conn, &params.provider_id, &params.model_id),
    )
}

#[tauri::command]
pub async fn clear_default_model(state: State<'_, AppState>) -> Result<(), AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures("clear_default_model", operations::clear_default_model(&conn))
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
    state: State<'_, AppState>,
    params: CreateUnifiedModelParams,
) -> Result<UnifiedModelDto, AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "create_unified_model",
        operations::create_unified_model(&conn, &params.unified),
    )
}

#[tauri::command]
pub async fn update_unified_model(
    state: State<'_, AppState>,
    params: UpdateUnifiedModelParams,
) -> Result<UnifiedModelDto, AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "update_unified_model",
        operations::update_unified_model(&conn, &params.id, &params.unified),
    )
}

#[tauri::command]
pub async fn delete_unified_model(
    state: State<'_, AppState>,
    params: DeleteUnifiedModelParams,
) -> Result<(), AppError> {
    let conn = state.db.lock().await;
    super::log_command_failures(
        "delete_unified_model",
        operations::delete_unified_model(&conn, &params.id),
    )
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
            aliases: Vec::new(),
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

    fn aliased(entry: ModelEntry, aliases: &[&str]) -> ModelEntry {
        ModelEntry { aliases: aliases.iter().map(|alias| (*alias).to_owned()).collect(), ..entry }
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
        let stored = Provider {
            id: "p1".into(),
            config: provider("Primary", true, vec![aliased(model("gpt-5"), &["gpt"])]),
        };
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
        assert_eq!(dto["models"][0]["aliases"], json!(["gpt"]));
        // An unset optional field stays absent rather than becoming null.
        assert!(dto.get("compat").is_none());
        assert!(dto["models"][0].get("cost").is_none());

        let unified = UnifiedModel {
            id: "fast".into(),
            hide: true,
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

        let default: SetDefaultModelParams =
            serde_json::from_value(json!({ "providerId": "p1", "modelId": "m1" })).unwrap();
        assert_eq!(default.provider_id, "p1");
        assert_eq!(default.model_id, "m1");

        let create: CreateUnifiedModelParams = serde_json::from_value(json!({
            "unified": { "id": "fast", "members": [{ "providerId": "p1", "model": "m1" }] }
        }))
        .unwrap();
        assert!(!create.unified.hide);

        let update: UpdateUnifiedModelParams = serde_json::from_value(json!({
            "id": "fast",
            "unified": {
                "id": "faster",
                "hide": true,
                "members": [{ "providerId": "p1", "model": "m1" }]
            }
        }))
        .unwrap();
        assert_eq!(update.id, "fast");
        assert_eq!(update.unified.id, "faster");
        assert!(update.unified.hide);
        assert_eq!(update.unified.members[0].provider_id, "p1");

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
        assert_eq!(listed["defaultModel"], json!(null));
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
    fn aliases_span_providers_only_with_one_shared_target() {
        let conn = memory_db();
        let models = || vec![aliased(model("gpt-5"), &["gpt"])];
        operations::create_provider(&conn, &provider("A", true, models())).unwrap();
        // The same key pointing at the same upstream model is a second candidate,
        // not a conflict.
        operations::create_provider(&conn, &provider("B", true, models())).unwrap();
        assert_eq!(
            operations::create_provider(
                &conn,
                &provider("C", true, vec![aliased(model("gpt-4"), &["gpt"])])
            )
            .unwrap_err()
            .code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            operations::list_providers(&conn).unwrap().providers.len(),
            2,
            "a rejected create writes nothing"
        );

        // A disabled provider stays outside the check until it is enabled.
        let disabled = provider("D", false, vec![aliased(model("gpt-4"), &["gpt"])]);
        let stored = operations::create_provider(&conn, &disabled).unwrap();
        let mut shown = disabled;
        shown.enabled = true;
        assert_eq!(
            operations::update_provider(&conn, &stored.id, &shown).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            row_of(&listed(&conn), &stored.id)["enabled"],
            json!(false),
            "a rejected update keeps the stored row"
        );
    }

    #[test]
    fn an_unhidden_unified_model_owns_its_name() {
        let conn = memory_db();
        let stored = operations::create_provider(
            &conn,
            &provider("A", true, vec![aliased(model("gpt-5"), &["gpt-alias"])]),
        )
        .unwrap();
        let member = || UnifiedMember { provider_id: stored.id.clone(), model: "gpt-5".into() };

        // A hidden aggregate may share a registered name; an unhidden one may not.
        let hidden = UnifiedModel { id: "gpt-5".into(), hide: true, members: vec![member()] };
        operations::create_unified_model(&conn, &hidden).unwrap();
        let visible = UnifiedModel { id: "gpt-alias".into(), hide: false, members: vec![member()] };
        assert_eq!(
            operations::create_unified_model(&conn, &visible).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            operations::list_unified_models(&conn).unwrap().len(),
            1,
            "a rejected create writes nothing"
        );

        // Un-hiding an aggregate under a registered name is refused too.
        let mut shown = hidden.clone();
        shown.hide = false;
        assert_eq!(
            operations::update_unified_model(&conn, "gpt-5", &shown).unwrap_err().code,
            ErrorCode::InvalidInput
        );

        // A free name is granted, and then a provider model may not take it back.
        let free = UnifiedModel { id: "brand".into(), hide: false, members: vec![member()] };
        operations::create_unified_model(&conn, &free).unwrap();
        assert_eq!(
            operations::create_provider(&conn, &provider("B", true, vec![model("brand")]))
                .unwrap_err()
                .code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            operations::create_provider(
                &conn,
                &provider("B", true, vec![aliased(model("m"), &["brand"])])
            )
            .unwrap_err()
            .code,
            ErrorCode::InvalidInput
        );
        assert_eq!(operations::list_providers(&conn).unwrap().providers.len(), 1);
    }

    #[test]
    fn unified_members_must_pin_registered_models() {
        let conn = memory_db();
        let stored =
            operations::create_provider(&conn, &provider("A", true, vec![model("m1")])).unwrap();

        let unknown_model = UnifiedModel {
            id: "agg".into(),
            hide: false,
            members: vec![UnifiedMember { provider_id: stored.id.clone(), model: "ghost".into() }],
        };
        assert_eq!(
            operations::create_unified_model(&conn, &unknown_model).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        let unknown_provider = UnifiedModel {
            id: "agg".into(),
            hide: false,
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
            hide: false,
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
        let agg = UnifiedModel { id: "agg".into(), hide: false, members: vec![member()] };
        operations::create_unified_model(&conn, &agg).unwrap();
        assert_eq!(
            operations::create_unified_model(&conn, &agg).unwrap_err().code,
            ErrorCode::InvalidInput
        );

        let other = UnifiedModel { id: "other".into(), hide: false, members: vec![member()] };
        operations::create_unified_model(&conn, &other).unwrap();
        // Renaming onto a taken name is refused; onto a free one it renames.
        assert_eq!(
            operations::update_unified_model(&conn, "other", &agg).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        let renamed = UnifiedModel { id: "renamed".into(), hide: false, members: vec![member()] };
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
            hide: false,
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
    fn default_model_rejects_draft_models_and_round_trips() {
        let conn = memory_db();
        let ready = operations::create_provider(&conn, &provider("Ready", true, vec![model("m1")]))
            .unwrap();
        let mut draft_entry = model("draft-model");
        draft_entry.apis.clear();
        let draft = operations::create_provider(&conn, &provider("Draft", true, vec![draft_entry]))
            .unwrap();

        assert_eq!(
            operations::set_default_model(&conn, "ghost", "m1").unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(
            operations::set_default_model(&conn, &ready.id, "ghost").unwrap_err().code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            operations::set_default_model(&conn, &draft.id, "draft-model").unwrap_err().code,
            ErrorCode::InvalidInput
        );
        assert!(operations::list_providers(&conn).unwrap().default_model.is_none());

        operations::set_default_model(&conn, &ready.id, "m1").unwrap();
        assert_eq!(
            listed(&conn)["defaultModel"],
            json!({ "providerId": ready.id, "modelId": "m1" })
        );
        operations::clear_default_model(&conn).unwrap();
        assert!(operations::list_providers(&conn).unwrap().default_model.is_none());
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
        let mut draft = provider("Logged", true, vec![aliased(model("m1"), &["alias"])]);
        draft.api_key = SecretString::from(api_key);
        let stored = operations::create_provider(&conn, &draft).unwrap();
        operations::update_provider(&conn, &stored.id, &draft).unwrap();
        // A rejected write is a business flow, not an infrastructure failure.
        assert_eq!(
            operations::create_provider(&conn, &draft).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        operations::set_default_model(&conn, &stored.id, "m1").unwrap();
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
