//! Provider configuration validation and effective-value resolution.
//!
//! Validation covers every rule checkable without a database; the rules that
//! need the stored provider set (provider name uniqueness, cross-provider alias
//! conflicts, unified-model name collisions, member registration) run in the
//! command layer inside the write transaction. Resolution merges the compat
//! layers of one selected protocol and reports where each effective field came
//! from, so the GUI and the request encoder share a single source of defaults.

use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;
use serde_json::{Map, Value};

use crate::error::{AppError, ErrorCode};
use crate::provider::compat_defaults;
use crate::provider::vendors::{self, VendorProfile};
use crate::types::{
    AnthropicMessagesCompat, ModelCost, ModelEntry, OpenaiCompletionsCompat, OpenaiResponsesCompat,
    Protocol, Provider, ProviderConfig, UnifiedModel,
};

/// Context window applied to a model that leaves it unset.
pub const DEFAULT_CONTEXT_WINDOW: u32 = 128_000;
/// Output token cap applied to a model that leaves it unset.
pub const DEFAULT_MAX_TOKENS: u32 = 16_384;

const MIN_TIMEOUT_MS: u32 = 1_000;
const MAX_TIMEOUT_MS: u32 = 600_000;
const MAX_RETRIES: u32 = 4;

/// Chat endpoint paths a base URL must not end with: the endpoint is derived
/// from the protocol family at request time, so a stored one would double up.
const ENDPOINT_SUFFIXES: [&str; 4] =
    ["/chat/completions", "/responses", "/messages", "/v1/messages"];

fn invalid(message: impl Into<String>) -> AppError {
    AppError { code: ErrorCode::InvalidInput, message: message.into() }
}

/// Splits an absolute `http`/`https` URL into its host (authority without
/// userinfo, port kept) and path. `None` when the URL is not absolute http(s) or
/// has no host.
fn split_url(url: &str) -> Option<(&str, &str)> {
    let (scheme, rest) = url.split_once("://")?;
    if !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https") {
        return None;
    }
    let (authority, path) = match rest.find(['/', '?', '#']) {
        Some(index) => (&rest[..index], &rest[index..]),
        None => (rest, ""),
    };
    let host = match authority.rsplit_once('@') {
        Some((_, host)) => host,
        None => authority,
    };
    if strip_port(host).is_empty() {
        return None;
    }
    Some((host, path))
}

/// Host of an absolute http(s) URL (authority without userinfo, port kept) for
/// vendor detection; `None` when the URL does not parse.
pub(crate) fn url_host(url: &str) -> Option<&str> {
    split_url(url).map(|(host, _)| host)
}

/// Drops the `:port` part of an authority, leaving IPv6 literals intact.
pub(crate) fn strip_port(authority: &str) -> &str {
    match authority.rfind(':') {
        Some(index) if !authority[index + 1..].contains(']') => &authority[..index],
        _ => authority,
    }
}

/// Validates a base URL and returns its stored form: trimmed, with trailing
/// slashes dropped. It must be an absolute `http`/`https` URL with a host, carry
/// no query or fragment, and not end with a chat endpoint path.
pub fn normalize_base_url(raw: &str) -> Result<String, AppError> {
    let url = raw.trim().trim_end_matches('/');
    if url.is_empty() {
        return Err(invalid("base URL must not be blank"));
    }
    if url.contains(char::is_whitespace) {
        return Err(invalid("base URL must not contain whitespace"));
    }
    if url.contains('?') || url.contains('#') {
        return Err(invalid("base URL must not carry a query or fragment"));
    }
    let Some((_, path)) = split_url(url) else {
        return Err(invalid("base URL must be an absolute http(s) URL with a host"));
    };
    if ENDPOINT_SUFFIXES.iter().any(|suffix| path.ends_with(suffix)) {
        return Err(invalid("base URL must not include a chat endpoint path"));
    }
    Ok(url.to_owned())
}

/// Validates a provider draft: everything checkable without the stored provider
/// set. Model registration, provider name uniqueness and cross-provider alias
/// conflicts are checked by the command layer inside the write transaction.
/// Base URLs are checked but not rewritten, so the caller stores the form
/// `normalize_base_url` returns instead of the raw input.
pub fn validate_provider(config: &ProviderConfig) -> Result<(), AppError> {
    if config.name.trim().is_empty() {
        return Err(invalid("provider name must not be blank"));
    }
    normalize_base_url(&config.base_url)?;
    if !compat_defaults::is_known_family(&config.api) {
        return Err(invalid(format!("unknown default protocol `{}`", config.api)));
    }
    for (label, timeout) in [
        ("requestTimeoutMs", config.request_timeout_ms),
        ("streamIdleTimeoutMs", config.stream_idle_timeout_ms),
    ] {
        if !(MIN_TIMEOUT_MS..=MAX_TIMEOUT_MS).contains(&timeout) {
            return Err(invalid(format!(
                "{label} must be within [{MIN_TIMEOUT_MS}, {MAX_TIMEOUT_MS}]"
            )));
        }
    }
    if config.max_retries > MAX_RETRIES {
        return Err(invalid(format!("maxRetries must be within [0, {MAX_RETRIES}]")));
    }
    validate_compat_buckets(&config.compat)?;

    let mut ids = BTreeSet::new();
    for model in &config.models {
        validate_model(model)?;
        if !ids.insert(model.id.as_str()) {
            return Err(invalid(format!("duplicate model id `{}`", model.id)));
        }
    }

    let mut names = BTreeSet::new();
    for model in &config.models {
        let name = model.name.as_deref().map(str::trim).filter(|name| !name.is_empty());
        if let Some(name) = name {
            if !names.insert(name) {
                return Err(invalid(format!("duplicate model name `{name}`")));
            }
        }
    }

    // Aliases are the downstream reference names: unique inside the provider and
    // never shadowing a model request name.
    let mut aliases = BTreeSet::new();
    for model in &config.models {
        for alias in &model.aliases {
            let alias = alias.trim();
            if alias.is_empty() {
                return Err(invalid(format!("model `{}` has a blank alias", model.id)));
            }
            if ids.contains(alias) {
                return Err(invalid(format!("alias `{alias}` is also a model id")));
            }
            if !aliases.insert(alias) {
                return Err(invalid(format!("duplicate alias `{alias}`")));
            }
        }
    }
    Ok(())
}

/// Validates a unified model draft: non-blank id, non-empty ordered members
/// without duplicates. Whether each member pins a registered model is checked by
/// the command layer inside the write transaction.
pub fn validate_unified_model(unified: &UnifiedModel) -> Result<(), AppError> {
    if unified.id.trim().is_empty() {
        return Err(invalid("unified model id must not be blank"));
    }
    if unified.members.is_empty() {
        return Err(invalid("unified model needs at least one member"));
    }
    let mut members = BTreeSet::new();
    for member in &unified.members {
        if member.provider_id.trim().is_empty() || member.model.trim().is_empty() {
            return Err(invalid("unified model members must pin a provider and a model"));
        }
        if !members.insert((member.provider_id.as_str(), member.model.as_str())) {
            return Err(invalid(format!(
                "duplicate unified model member `{}/{}`",
                member.provider_id, member.model
            )));
        }
    }
    Ok(())
}

fn validate_model(model: &ModelEntry) -> Result<(), AppError> {
    let id = model.id.trim();
    if id.is_empty() {
        return Err(invalid("model id must not be blank"));
    }
    if let Some(base_url) = &model.base_url {
        normalize_base_url(base_url)?;
    }
    let mut apis = BTreeSet::new();
    for api in &model.apis {
        if !compat_defaults::is_known_family(api) {
            return Err(invalid(format!("model `{id}` lists unknown protocol `{api}`")));
        }
        if !apis.insert(api.as_str()) {
            return Err(invalid(format!("model `{id}` lists protocol `{api}` twice")));
        }
    }
    if model.input.is_empty() {
        return Err(invalid(format!("model `{id}` must accept at least one input modality")));
    }
    if model.context_window == Some(0) {
        return Err(invalid(format!("model `{id}` contextWindow must be greater than zero")));
    }
    if model.max_tokens == Some(0) {
        return Err(invalid(format!("model `{id}` maxTokens must be greater than zero")));
    }
    if let Some(cost) = &model.cost {
        validate_cost(id, cost)?;
    }
    validate_compat_buckets(&model.compat)
}

/// Cost rates are display and estimation data, but a negative rate would corrupt
/// every estimate derived from it.
fn validate_cost(model_id: &str, cost: &ModelCost) -> Result<(), AppError> {
    validate_rates(model_id, cost.input, cost.output, cost.cache_read, cost.cache_write)?;
    if let Some(tiers) = &cost.tiers {
        for tier in tiers {
            if tier.input_tokens_above == 0 {
                return Err(invalid(format!(
                    "model `{model_id}` cost tier inputTokensAbove must be greater than zero"
                )));
            }
            validate_rates(model_id, tier.input, tier.output, tier.cache_read, tier.cache_write)?;
        }
    }
    if let Some(peak) = &cost.peak {
        validate_rates(model_id, peak.input, peak.output, peak.cache_read, peak.cache_write)?;
        if peak.windows.is_empty() {
            return Err(invalid(format!(
                "model `{model_id}` peak pricing needs at least one window"
            )));
        }
        for window in &peak.windows {
            if !is_valid_time_of_day(&window.start) || !is_valid_time_of_day(&window.end) {
                return Err(invalid(format!(
                    "model `{model_id}` peak window times must be UTC HH:MM"
                )));
            }
            // `end` before `start` is a window crossing midnight, not an error.
            if window.start == window.end {
                return Err(invalid(format!(
                    "model `{model_id}` peak window start and end must differ"
                )));
            }
        }
    }
    Ok(())
}

fn validate_rates(
    model_id: &str,
    input: f64,
    output: f64,
    cache_read: f64,
    cache_write: f64,
) -> Result<(), AppError> {
    let rates = [input, output, cache_read, cache_write];
    if rates.iter().any(|rate| *rate < 0.0) {
        return Err(invalid(format!("model `{model_id}` cost rates must not be negative")));
    }
    Ok(())
}

/// `HH:MM` on a 24-hour clock: two digits each, hours below 24, minutes below 60.
fn is_valid_time_of_day(value: &str) -> bool {
    match value.split_once(':') {
        Some((hours, minutes)) => {
            hours.len() == 2
                && minutes.len() == 2
                && hours.bytes().all(|byte| byte.is_ascii_digit())
                && minutes.bytes().all(|byte| byte.is_ascii_digit())
                && hours.parse::<u8>().is_ok_and(|hours| hours < 24)
                && minutes.parse::<u8>().is_ok_and(|minutes| minutes < 60)
        }
        None => false,
    }
}

fn validate_compat_buckets(buckets: &Option<BTreeMap<Protocol, Value>>) -> Result<(), AppError> {
    let Some(buckets) = buckets else {
        return Ok(());
    };
    for (protocol, fragment) in buckets {
        validate_compat_bucket(protocol, fragment)?;
    }
    Ok(())
}

/// A compat bucket must name a family and decode into that family's struct: a
/// fragment of another family, an unknown family name or a misspelled key is
/// rejected instead of being silently dropped at request time.
pub(crate) fn validate_compat_bucket(
    protocol: &Protocol,
    fragment: &Value,
) -> Result<(), AppError> {
    let decoded = match protocol.as_str() {
        compat_defaults::OPENAI_COMPLETIONS => {
            serde_json::from_value::<OpenaiCompletionsCompat>(fragment.clone()).map(|_| ())
        }
        compat_defaults::OPENAI_RESPONSES => {
            serde_json::from_value::<OpenaiResponsesCompat>(fragment.clone()).map(|_| ())
        }
        compat_defaults::ANTHROPIC_MESSAGES => {
            serde_json::from_value::<AnthropicMessagesCompat>(fragment.clone()).map(|_| ())
        }
        _ => return Err(invalid(format!("unknown protocol family `{protocol}`"))),
    };
    decoded
        .map_err(|err| invalid(format!("compat for `{protocol}` does not match its family: {err}")))
}

/// Layer that supplied a compat field's effective value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CompatSource {
    /// Family default of the protocol.
    FamilyDefault,
    /// Vendor specialisation selected by host or request-name detection.
    Vendor,
    /// The provider's own compat bucket.
    Provider,
    /// The model's own compat bucket.
    Model,
}

/// Effective compat of one protocol: the merged fields plus the layer that
/// supplied each field. `sources` covers exactly the keys of `values`.
#[derive(Debug, Clone, Serialize)]
pub struct ResolvedCompat {
    /// Merged fields with family defaults applied; empty nested objects are
    /// dropped because an empty object means unset downstream.
    pub values: Map<String, Value>,
    /// Winning layer per field.
    pub sources: BTreeMap<String, CompatSource>,
}

/// Effective values of one model under a selected protocol.
// Reason: the request domain reads these fields for request encoding; revoke
// with its first production reader.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct ResolvedModel {
    /// Model base URL override, else the provider base URL.
    pub base_url: String,
    /// Display name: the model name, else its request name.
    pub name: String,
    /// Context window, `DEFAULT_CONTEXT_WINDOW` when unset.
    pub context_window: u32,
    /// Output token cap, `DEFAULT_MAX_TOKENS` when unset.
    pub max_tokens: u32,
    /// Price, zero rates when unset.
    pub cost: ModelCost,
    /// Provider headers overlaid with model headers (the model wins).
    pub headers: BTreeMap<String, String>,
    /// Merged compat with per-field provenance.
    pub compat: ResolvedCompat,
    /// Vendor detected from the effective base URL host or the model request
    /// name; drives the vendor compat layer and `reasoningOutput: auto`.
    pub vendor: Option<&'static VendorProfile>,
}

/// Resolves one model under a selected protocol. Vendor detection runs on the
/// effective base URL, so a model that overrides the URL is matched against the
/// host it actually talks to.
// Reason: effective-value resolution is consumed by the request domain; revoke
// with its first production caller.
#[allow(dead_code)]
pub fn resolve_model(
    provider: &ProviderConfig,
    model: &ModelEntry,
    protocol: &Protocol,
) -> ResolvedModel {
    let base_url = effective_base_url(provider, model);
    let vendor = target_vendor(provider, Some(model));
    let mut headers = provider.headers.clone();
    if let Some(model_headers) = &model.headers {
        for (name, value) in model_headers {
            headers.insert(name.clone(), value.clone());
        }
    }
    ResolvedModel {
        compat: resolve_compat(provider, Some(model), protocol),
        base_url,
        name: match model.name.as_deref() {
            Some(name) if !name.trim().is_empty() => name.to_owned(),
            _ => model.id.clone(),
        },
        context_window: model.context_window.unwrap_or(DEFAULT_CONTEXT_WINDOW),
        max_tokens: model.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS),
        cost: model.cost.clone().unwrap_or(ModelCost {
            input: 0.0,
            output: 0.0,
            cache_read: 0.0,
            cache_write: 0.0,
            tiers: None,
            peak: None,
        }),
        headers,
        vendor,
    }
}

/// Effective base URL of a request target: a non-blank model override wins over
/// the provider URL. A blank override counts as unset, matching validation.
fn effective_base_url(provider: &ProviderConfig, model: &ModelEntry) -> String {
    match model.base_url.as_deref() {
        Some(url) if !url.trim().is_empty() => url.to_owned(),
        _ => provider.base_url.clone(),
    }
}

/// Vendor of a request target: the host of the effective base URL wins, the
/// request name decides only when the host matches nothing. A model-less target
/// has no request name, so only a host can select a vendor.
fn target_vendor(
    provider: &ProviderConfig,
    model: Option<&ModelEntry>,
) -> Option<&'static VendorProfile> {
    match model {
        Some(model) => vendors::detect_vendor(&effective_base_url(provider, model), &model.id),
        None => vendors::detect_vendor(&provider.base_url, ""),
    }
}

/// Merges the compat layers of one protocol: family defaults, the detected
/// vendor's specialisation, the provider bucket, then the model bucket when a
/// model is given (a model-less target is the provider-level view). Scalars
/// overwrite, nested objects merge key by key.
pub fn resolve_compat(
    provider: &ProviderConfig,
    model: Option<&ModelEntry>,
    protocol: &Protocol,
) -> ResolvedCompat {
    let vendor = target_vendor(provider, model);
    // An unknown family resolves from the stored layers alone; validation keeps
    // such names out of stored configurations.
    let mut values = match compat_defaults::family_defaults(protocol) {
        Some(Value::Object(values)) => values,
        _ => Map::new(),
    };
    let mut sources: BTreeMap<String, CompatSource> =
        values.keys().map(|field| (field.clone(), CompatSource::FamilyDefault)).collect();
    let model_bucket =
        model.and_then(|model| model.compat.as_ref()).and_then(|buckets| buckets.get(protocol));
    let layers = [
        (CompatSource::Vendor, vendor.and_then(|profile| profile.compat.get(protocol))),
        (
            CompatSource::Provider,
            provider.compat.as_ref().and_then(|buckets| buckets.get(protocol)),
        ),
        (CompatSource::Model, model_bucket),
    ];
    for (source, fragment) in layers {
        if let Some(fragment) = fragment {
            merge_compat_fragment(&mut values, &mut sources, fragment, source);
        }
    }
    values.retain(|_, value| !value.as_object().is_some_and(Map::is_empty));
    sources.retain(|field, _| values.contains_key(field));
    ResolvedCompat { values, sources }
}

fn merge_compat_fragment(
    values: &mut Map<String, Value>,
    sources: &mut BTreeMap<String, CompatSource>,
    fragment: &Value,
    source: CompatSource,
) {
    let Some(fragment) = fragment.as_object() else {
        return;
    };
    for (field, value) in fragment {
        // An explicit null means unset, so it never clears a lower layer.
        if value.is_null() {
            continue;
        }
        match values.get_mut(field) {
            Some(current) if current.is_object() && value.is_object() => {
                merge_object(current, value)
            }
            _ => {
                values.insert(field.clone(), value.clone());
            }
        }
        sources.insert(field.clone(), source);
    }
}

/// Recursive half of the merge: later keys win, earlier-only keys stay.
fn merge_object(current: &mut Value, overlay: &Value) {
    let (Some(current), Some(overlay)) = (current.as_object_mut(), overlay.as_object()) else {
        return;
    };
    for (field, value) in overlay {
        if value.is_null() {
            continue;
        }
        match current.get_mut(field) {
            Some(existing) if existing.is_object() && value.is_object() => {
                merge_object(existing, value);
            }
            _ => {
                current.insert(field.clone(), value.clone());
            }
        }
    }
}

/// Expands a downstream reference name into upstream candidates in attempt
/// order: a unified model name expands to its members (position order); any
/// other name collects every enabled provider whose model request name or alias
/// matches (provider creation order). Members pinned to a disabled or unknown
/// provider are skipped, so a unified model whose members are all unavailable
/// resolves to nothing.
// Reason: reference resolution is the request domain's addressing entry; revoke
// with its first production caller.
#[allow(dead_code)]
pub fn resolve_model_reference(
    providers: &[Provider],
    unified_models: &[UnifiedModel],
    name: &str,
) -> Vec<(String, String)> {
    // A hidden unified model owns its name outright; validation keeps the name
    // unique against model names and aliases otherwise.
    if let Some(unified) = unified_models.iter().find(|unified| unified.id == name) {
        return unified
            .members
            .iter()
            .filter(|member| has_enabled_model(providers, &member.provider_id, &member.model))
            .map(|member| (member.provider_id.clone(), member.model.clone()))
            .collect();
    }
    let mut candidates = Vec::new();
    for provider in providers.iter().filter(|provider| provider.config.enabled) {
        for model in &provider.config.models {
            if model.id == name || model.aliases.iter().any(|alias| alias == name) {
                candidates.push((provider.id.clone(), model.id.clone()));
            }
        }
    }
    candidates
}

fn has_enabled_model(providers: &[Provider], provider_id: &str, model_id: &str) -> bool {
    providers.iter().any(|provider| {
        provider.id == provider_id
            && provider.config.enabled
            && provider.config.models.iter().any(|model| model.id == model_id)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const COMPLETIONS: &str = compat_defaults::OPENAI_COMPLETIONS;
    const RESPONSES: &str = compat_defaults::OPENAI_RESPONSES;
    const MESSAGES: &str = compat_defaults::ANTHROPIC_MESSAGES;

    fn completions() -> Protocol {
        Protocol::from(COMPLETIONS)
    }

    fn config(base_url: &str) -> ProviderConfig {
        serde_json::from_value(json!({
            "name": "Test Provider",
            "api": COMPLETIONS,
            "baseUrl": base_url
        }))
        .unwrap()
    }

    fn model(id: &str) -> ModelEntry {
        serde_json::from_value(json!({ "id": id })).unwrap()
    }

    fn cost(value: Value) -> ModelCost {
        serde_json::from_value(value).unwrap()
    }

    fn buckets(fragment: Value) -> Option<BTreeMap<Protocol, Value>> {
        Some(BTreeMap::from([(completions(), fragment)]))
    }

    fn provider_entry(id: &str, enabled: bool, models: Vec<ModelEntry>) -> Provider {
        let mut provider: Provider = serde_json::from_value(json!({
            "id": id,
            "name": id,
            "api": COMPLETIONS,
            "baseUrl": "https://gateway.example/v1"
        }))
        .unwrap();
        provider.config.enabled = enabled;
        provider.config.models = models;
        provider
    }

    fn unified(id: &str, members: &[(&str, &str)]) -> UnifiedModel {
        serde_json::from_value(json!({
            "id": id,
            "members": members
                .iter()
                .map(|(provider_id, model)| json!({ "providerId": provider_id, "model": model }))
                .collect::<Vec<_>>()
        }))
        .unwrap()
    }

    fn assert_invalid<T: std::fmt::Debug>(result: Result<T, AppError>) {
        let err = result.unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidInput, "{}", err.message);
    }

    #[test]
    fn base_urls_are_trimmed_and_lose_their_trailing_slashes() {
        assert_eq!(
            normalize_base_url("  https://api.example.com/v1/  ").unwrap(),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_base_url("https://api.example.com").unwrap(),
            "https://api.example.com"
        );
        assert_eq!(
            normalize_base_url("http://localhost:11434/v1").unwrap(),
            "http://localhost:11434/v1"
        );
        assert_eq!(
            normalize_base_url("HTTPS://API.example.com/V1").unwrap(),
            "HTTPS://API.example.com/V1"
        );
    }

    #[test]
    fn base_urls_reject_relative_forms_queries_fragments_and_endpoint_paths() {
        for rejected in [
            "",
            "   ",
            "/",
            "api.example.com/v1",
            "ftp://api.example.com",
            "https://",
            "https://:8080/v1",
            "https://api example.com/v1",
            "https://api.example.com/v1?key=1",
            "https://api.example.com/v1#top",
            "https://api.example.com/v1/chat/completions",
            "https://api.example.com/chat/completions/",
            "https://api.example.com/responses",
            "https://api.example.com/messages",
            "https://api.example.com/v1/messages",
        ] {
            assert_invalid(normalize_base_url(rejected));
        }
    }

    #[test]
    fn drafts_pass_validation_without_keys_models_or_full_fields() {
        let mut draft = config("http://localhost:11434/v1");
        assert!(draft.api_key.expose().is_empty());
        assert!(validate_provider(&draft).is_ok());

        // A model that is still being filled in: no protocols, no metadata.
        draft.models.push(model("draft-model"));
        assert!(validate_provider(&draft).is_ok());
    }

    #[test]
    fn provider_validation_rejects_blank_names_unknown_protocols_and_ranges() {
        let mut blank = config("https://api.example.com");
        blank.name = "   ".into();
        assert_invalid(validate_provider(&blank));

        let mut unknown = config("https://api.example.com");
        unknown.api = Protocol::from("gemini");
        assert_invalid(validate_provider(&unknown));

        for timeout in [999, 600_001] {
            let mut timed = config("https://api.example.com");
            timed.request_timeout_ms = timeout;
            assert_invalid(validate_provider(&timed));
            timed.request_timeout_ms = 120_000;
            timed.stream_idle_timeout_ms = timeout;
            assert_invalid(validate_provider(&timed));
        }
        for timeout in [1_000, 600_000] {
            let mut timed = config("https://api.example.com");
            timed.request_timeout_ms = timeout;
            timed.stream_idle_timeout_ms = timeout;
            assert!(validate_provider(&timed).is_ok());
        }

        let mut retries = config("https://api.example.com");
        retries.max_retries = 5;
        assert_invalid(validate_provider(&retries));
        retries.max_retries = 4;
        assert!(validate_provider(&retries).is_ok());
    }

    #[test]
    fn provider_validation_rejects_blank_or_duplicated_model_identities() {
        let mut blank = config("https://api.example.com");
        blank.models.push(model("  "));
        assert_invalid(validate_provider(&blank));

        let mut duplicate_ids = config("https://api.example.com");
        duplicate_ids.models.push(model("m1"));
        duplicate_ids.models.push(model("m1"));
        assert_invalid(validate_provider(&duplicate_ids));

        let mut duplicate_names = config("https://api.example.com");
        for id in ["m1", "m2"] {
            let mut entry = model(id);
            entry.name = Some("Same Name".into());
            duplicate_names.models.push(entry);
        }
        assert_invalid(validate_provider(&duplicate_names));

        // A blank display name counts as unset, so it never collides.
        let mut blank_names = config("https://api.example.com");
        for id in ["m1", "m2"] {
            let mut entry = model(id);
            entry.name = Some("  ".into());
            blank_names.models.push(entry);
        }
        assert!(validate_provider(&blank_names).is_ok());
    }

    #[test]
    fn provider_validation_rejects_unknown_or_repeated_model_protocols() {
        let mut unknown = config("https://api.example.com");
        let mut entry = model("m1");
        entry.apis = vec![Protocol::from("gemini")];
        unknown.models.push(entry);
        assert_invalid(validate_provider(&unknown));

        let mut repeated = config("https://api.example.com");
        let mut entry = model("m1");
        entry.apis = vec![completions(), completions()];
        repeated.models.push(entry);
        assert_invalid(validate_provider(&repeated));

        let mut known = config("https://api.example.com");
        let mut entry = model("m1");
        entry.apis = vec![Protocol::from(MESSAGES), completions()];
        known.models.push(entry);
        assert!(validate_provider(&known).is_ok());
    }

    #[test]
    fn aliases_stay_unique_and_never_shadow_a_model_id() {
        // A model id and its consumer-facing alias are different kinds of name.
        let mut identity = config("https://api.example.com");
        let mut entry = model("m1");
        entry.aliases = vec!["m1".into()];
        identity.models.push(entry);
        assert_invalid(validate_provider(&identity));

        let mut shadowing = config("https://api.example.com");
        shadowing.models.push(model("m1"));
        let mut aliased = model("m2");
        aliased.aliases = vec!["m1".into()];
        shadowing.models.push(aliased);
        assert_invalid(validate_provider(&shadowing));

        let mut duplicated = config("https://api.example.com");
        for id in ["m1", "m2"] {
            let mut entry = model(id);
            entry.aliases = vec!["shared".into()];
            duplicated.models.push(entry);
        }
        assert_invalid(validate_provider(&duplicated));

        let mut blank = config("https://api.example.com");
        let mut entry = model("m1");
        entry.aliases = vec!["  ".into()];
        blank.models.push(entry);
        assert_invalid(validate_provider(&blank));

        // Aliases of one provider are independent names: distinct values pass,
        // and an alias may repeat another model's display name.
        let mut valid = config("https://api.example.com");
        let mut first = model("m1");
        first.name = Some("Shared Display".into());
        first.aliases = vec!["short".into(), "shorter".into()];
        let mut second = model("m2");
        second.name = Some("Shared Display Two".into());
        second.aliases = vec!["Shared Display".into()];
        valid.models.extend([first, second]);
        assert!(validate_provider(&valid).is_ok());
    }

    #[test]
    fn model_validation_rejects_unknown_shapes_and_zero_limits() {
        let mut no_input = config("https://api.example.com");
        let mut entry = model("m1");
        entry.input = Vec::new();
        no_input.models.push(entry);
        assert_invalid(validate_provider(&no_input));

        let mut zero_context = config("https://api.example.com");
        let mut entry = model("m1");
        entry.context_window = Some(0);
        zero_context.models.push(entry);
        assert_invalid(validate_provider(&zero_context));

        let mut zero_max_tokens = config("https://api.example.com");
        let mut entry = model("m1");
        entry.max_tokens = Some(0);
        zero_max_tokens.models.push(entry);
        assert_invalid(validate_provider(&zero_max_tokens));

        let mut bad_base_url = config("https://api.example.com");
        let mut entry = model("m1");
        entry.base_url = Some("not-a-url".into());
        bad_base_url.models.push(entry);
        assert_invalid(validate_provider(&bad_base_url));
    }

    #[test]
    fn cost_validation_rejects_negative_rates_and_unbounded_numbers() {
        for rejected in [
            json!({ "input": -0.1, "output": 1.0, "cacheRead": 0.0, "cacheWrite": 0.0 }),
            json!({ "input": 0.0, "output": 1.0, "cacheRead": -1.0, "cacheWrite": 0.0 }),
            json!({
                "input": 0.0,
                "output": 1.0,
                "cacheRead": 0.0,
                "cacheWrite": 0.0,
                "tiers": [
                    { "inputTokensAbove": 0, "input": 1.0, "output": 1.0, "cacheRead": 0.0, "cacheWrite": 0.0 }
                ]
            }),
            json!({
                "input": 0.0,
                "output": 1.0,
                "cacheRead": 0.0,
                "cacheWrite": 0.0,
                "tiers": [
                    { "inputTokensAbove": 1000, "input": 1.0, "output": -1.0, "cacheRead": 0.0, "cacheWrite": 0.0 }
                ]
            }),
            json!({
                "input": 0.0,
                "output": 1.0,
                "cacheRead": 0.0,
                "cacheWrite": 0.0,
                "peak": { "input": -1.0, "output": 1.0, "cacheRead": 0.0, "cacheWrite": 0.0, "windows": [ { "start": "01:00", "end": "02:00" } ] }
            }),
            json!({
                "input": 0.0,
                "output": 1.0,
                "cacheRead": 0.0,
                "cacheWrite": 0.0,
                "peak": { "input": 1.0, "output": 1.0, "cacheRead": 0.0, "cacheWrite": 0.0, "windows": [] }
            }),
            json!({
                "input": 0.0,
                "output": 1.0,
                "cacheRead": 0.0,
                "cacheWrite": 0.0,
                "peak": { "input": 1.0, "output": 1.0, "cacheRead": 0.0, "cacheWrite": 0.0, "windows": [ { "start": "1:00", "end": "02:00" } ] }
            }),
            json!({
                "input": 0.0,
                "output": 1.0,
                "cacheRead": 0.0,
                "cacheWrite": 0.0,
                "peak": { "input": 1.0, "output": 1.0, "cacheRead": 0.0, "cacheWrite": 0.0, "windows": [ { "start": "25:00", "end": "02:00" } ] }
            }),
            json!({
                "input": 0.0,
                "output": 1.0,
                "cacheRead": 0.0,
                "cacheWrite": 0.0,
                "peak": { "input": 1.0, "output": 1.0, "cacheRead": 0.0, "cacheWrite": 0.0, "windows": [ { "start": "01:60", "end": "02:00" } ] }
            }),
            json!({
                "input": 0.0,
                "output": 1.0,
                "cacheRead": 0.0,
                "cacheWrite": 0.0,
                "peak": { "input": 1.0, "output": 1.0, "cacheRead": 0.0, "cacheWrite": 0.0, "windows": [ { "start": "01:00", "end": "01:00" } ] }
            }),
        ] {
            let mut provider = config("https://api.example.com");
            let mut entry = model("m1");
            entry.cost = Some(cost(rejected.clone()));
            provider.models.push(entry);
            assert_invalid(validate_provider(&provider));
        }
    }

    #[test]
    fn cost_validation_accepts_zero_rates_tiers_and_peak_windows() {
        let mut provider = config("https://api.example.com");
        let mut entry = model("m1");
        entry.cost = Some(cost(json!({
            "input": 0.0,
            "output": 0.0,
            "cacheRead": 0.0,
            "cacheWrite": 0.0,
            "tiers": [
                { "inputTokensAbove": 272000, "input": 2.5, "output": 20.0, "cacheRead": 0.25, "cacheWrite": 3.0 }
            ],
            "peak": {
                "input": 0.3,
                "output": 1.2,
                "cacheRead": 0.006,
                "cacheWrite": 0.0,
                "windows": [
                    { "days": ["mon", "tue", "wed", "thu", "fri"], "start": "01:00", "end": "04:00" },
                    // `end` before `start` crosses midnight and stays valid.
                    { "start": "23:30", "end": "00:30" }
                ]
            }
        })));
        provider.models.push(entry);
        assert!(validate_provider(&provider).is_ok());
    }

    #[test]
    fn compat_buckets_must_match_the_family_of_their_key() {
        let mut valid = config("https://api.example.com");
        valid.compat = Some(BTreeMap::from([
            (completions(), json!({ "maxTokensField": "max_tokens" })),
            (Protocol::from(MESSAGES), json!({ "supportsTemperature": false })),
        ]));
        assert!(validate_provider(&valid).is_ok());

        let mut responses_family = config("https://api.example.com");
        responses_family.compat = Some(BTreeMap::from([(
            Protocol::from(RESPONSES),
            json!({ "supportsToolSearch": true }),
        )]));
        assert!(validate_provider(&responses_family).is_ok());

        let mut foreign_fields = config("https://api.example.com");
        foreign_fields.compat = buckets(json!({ "supportsToolReferences": true }));
        assert_invalid(validate_provider(&foreign_fields));

        let mut misspelled = config("https://api.example.com");
        misspelled.compat = buckets(json!({ "supportsStoree": true }));
        assert_invalid(validate_provider(&misspelled));

        let mut unknown_family = config("https://api.example.com");
        unknown_family.compat =
            Some(BTreeMap::from([(Protocol::from("gemini"), json!({ "supportsStore": true }))]));
        assert_invalid(validate_provider(&unknown_family));

        // The same rule guards model-level buckets.
        let mut model_level = config("https://api.example.com");
        let mut entry = model("m1");
        entry.compat = buckets(json!({ "supportsTemperature": false }));
        model_level.models.push(entry);
        assert_invalid(validate_provider(&model_level));
    }

    #[test]
    fn unified_validation_requires_a_name_and_distinct_registered_members() {
        assert_invalid(validate_unified_model(&unified("  ", &[("p1", "m1")])));
        assert_invalid(validate_unified_model(&unified("claude", &[])));
        assert_invalid(validate_unified_model(&unified("claude", &[("p1", " ")])));
        assert_invalid(validate_unified_model(&unified("claude", &[("", "m1")])));
        assert_invalid(validate_unified_model(&unified("claude", &[("p1", "m1"), ("p1", "m1")])));
        // Member order is the attempt order and stays as submitted.
        let ordered = unified("claude", &[("p2", "m2"), ("p1", "m1")]);
        assert!(validate_unified_model(&ordered).is_ok());
        assert_eq!(ordered.members[0].provider_id, "p2");
    }

    #[test]
    fn resolve_falls_back_to_family_defaults_and_drops_empty_objects() {
        let provider = config("https://gateway.example/v1");
        let resolved = resolve_model(&provider, &model("mystery"), &completions());

        assert!(resolved.vendor.is_none());
        assert_eq!(resolved.compat.values["supportsStore"], json!(true));
        assert_eq!(resolved.compat.sources["supportsStore"], CompatSource::FamilyDefault);
        assert_eq!(resolved.compat.values["maxTokensField"], json!("max_completion_tokens"));
        // Family defaults for the free-form objects are empty, so they count as
        // unset and never reach the request encoder.
        for empty in ["chatTemplateKwargs", "chatTemplateArgs", "openRouterRouting"] {
            assert!(!resolved.compat.values.contains_key(empty), "{empty} should be dropped");
            assert!(!resolved.compat.sources.contains_key(empty));
        }
        // Fields the family leaves unset stay unset.
        assert!(!resolved.compat.values.contains_key("thinkingTokenBudgetField"));
        assert!(!resolved.compat.values.contains_key("vllmPriority"));
        assert_eq!(resolved.compat.values.len(), resolved.compat.sources.len());
    }

    #[test]
    fn resolve_applies_vendor_provider_and_model_layers_in_order() {
        let mut provider = config("https://api.deepseek.com");
        let entry = model("deepseek-flash");

        let resolved = resolve_model(&provider, &entry, &completions());
        assert_eq!(resolved.vendor.map(|profile| profile.preset_id), Some("deepseek"));
        assert_eq!(resolved.compat.values["supportsStore"], json!(false));
        assert_eq!(resolved.compat.sources["supportsStore"], CompatSource::Vendor);
        assert_eq!(resolved.compat.values["maxTokensField"], json!("max_tokens"));
        assert_eq!(resolved.compat.sources["maxTokensField"], CompatSource::Vendor);
        assert_eq!(resolved.compat.values["thinkingFormat"], json!("deepseek"));

        provider.compat = buckets(json!({ "supportsStore": true, "requiresToolResultName": true }));
        let resolved = resolve_model(&provider, &entry, &completions());
        assert_eq!(resolved.compat.values["supportsStore"], json!(true));
        assert_eq!(resolved.compat.sources["supportsStore"], CompatSource::Provider);
        assert_eq!(resolved.compat.values["requiresToolResultName"], json!(true));
        assert_eq!(resolved.compat.sources["requiresToolResultName"], CompatSource::Provider);
        // Untouched fields keep the vendor layer as their source.
        assert_eq!(resolved.compat.sources["thinkingFormat"], CompatSource::Vendor);

        let mut entry = entry;
        entry.compat = buckets(json!({ "maxTokensField": "max_completion_tokens" }));
        let resolved = resolve_model(&provider, &entry, &completions());
        assert_eq!(resolved.compat.values["maxTokensField"], json!("max_completion_tokens"));
        assert_eq!(resolved.compat.sources["maxTokensField"], CompatSource::Model);
        assert_eq!(resolved.compat.sources["supportsStore"], CompatSource::Provider);
    }

    #[test]
    fn resolve_deep_merges_nested_objects_key_by_key() {
        let mut provider = config("https://gateway.example/v1");
        provider.compat = buckets(json!({
            "chatTemplateKwargs": { "enable_thinking": true, "budget": 1024 }
        }));
        let mut entry = model("m1");
        entry.compat = buckets(json!({
            "chatTemplateKwargs": { "budget": { "$var": "thinking.budget" }, "extra": "kept" }
        }));

        let resolved = resolve_model(&provider, &entry, &completions());
        assert_eq!(
            resolved.compat.values["chatTemplateKwargs"],
            json!({
                "enable_thinking": true,
                "budget": { "$var": "thinking.budget" },
                "extra": "kept"
            })
        );
        // The deepest layer that touched the field owns it.
        assert_eq!(resolved.compat.sources["chatTemplateKwargs"], CompatSource::Model);
    }

    #[test]
    fn resolve_treats_null_and_empty_objects_as_unset() {
        let mut provider = config("https://gateway.example/v1");
        provider.compat = buckets(json!({ "supportsStore": null, "openRouterRouting": {} }));

        let resolved = resolve_model(&provider, &model("m1"), &completions());
        // An explicit null never clears a lower layer.
        assert_eq!(resolved.compat.values["supportsStore"], json!(true));
        assert_eq!(resolved.compat.sources["supportsStore"], CompatSource::FamilyDefault);
        assert!(!resolved.compat.values.contains_key("openRouterRouting"));
        assert!(!resolved.compat.sources.contains_key("openRouterRouting"));
    }

    #[test]
    fn resolve_applies_model_field_defaults_and_header_merging() {
        let mut provider = config("https://gateway.example/v1");
        provider.headers = BTreeMap::from([
            ("X-Shared".to_owned(), "provider".to_owned()),
            ("X-Provider".to_owned(), "1".to_owned()),
        ]);
        let mut entry = model("m1");
        entry.name = Some("  ".into());
        entry.headers = Some(BTreeMap::from([("X-Shared".to_owned(), "model".to_owned())]));

        let resolved = resolve_model(&provider, &entry, &completions());
        assert_eq!(resolved.name, "m1", "a blank display name falls back to the request name");
        assert_eq!(resolved.base_url, "https://gateway.example/v1");
        assert_eq!(resolved.context_window, DEFAULT_CONTEXT_WINDOW);
        assert_eq!(resolved.max_tokens, DEFAULT_MAX_TOKENS);
        assert_eq!(
            resolved.cost,
            cost(json!({ "input": 0.0, "output": 0.0, "cacheRead": 0.0, "cacheWrite": 0.0 }))
        );
        assert_eq!(resolved.headers["X-Shared"], "model");
        assert_eq!(resolved.headers["X-Provider"], "1");
    }

    #[test]
    fn resolve_uses_the_effective_base_url_for_vendor_detection() {
        let mut provider = config("https://gateway.example/v1");
        let mut entry = model("claude-opus-5");
        entry.name = Some("Claude Opus 5".into());
        entry.base_url = Some("https://api.anthropic.com".into());
        entry.context_window = Some(999_999);
        entry.max_tokens = Some(1_024);
        entry.cost = Some(cost(json!({
            "input": 5.0, "output": 25.0, "cacheRead": 0.5, "cacheWrite": 6.25
        })));

        let resolved = resolve_model(&provider, &entry, &Protocol::from(MESSAGES));
        assert_eq!(resolved.base_url, "https://api.anthropic.com");
        assert_eq!(resolved.vendor.map(|profile| profile.preset_id), Some("anthropic"));
        assert_eq!(resolved.name, "Claude Opus 5");
        assert_eq!(resolved.context_window, 999_999);
        assert_eq!(resolved.max_tokens, 1_024);
        assert_eq!(resolved.cost.output, 25.0);

        // Detection also works without a host match, via the request-name prefix.
        provider.base_url = "https://gateway.example/v1".into();
        entry.base_url = None;
        let resolved = resolve_model(&provider, &entry, &Protocol::from(MESSAGES));
        assert_eq!(resolved.vendor.map(|profile| profile.preset_id), Some("anthropic"));
    }

    #[test]
    fn resolve_merges_the_anthropic_vendor_specialisation() {
        let provider = config("https://api.anthropic.com");
        let resolved = resolve_model(&provider, &model("claude-opus-5"), &Protocol::from(MESSAGES));

        assert_eq!(resolved.compat.values["supportsToolReferences"], json!(true));
        assert_eq!(resolved.compat.sources["supportsToolReferences"], CompatSource::Vendor);
        assert_eq!(resolved.compat.values["supportsStrictTools"], json!(false));
        assert_eq!(resolved.compat.sources["supportsStrictTools"], CompatSource::FamilyDefault);
        assert!(!resolved.compat.values.contains_key("allowedFallbackModels"));
    }

    #[test]
    fn references_expand_model_ids_and_aliases_in_provider_order() {
        let mut alpha = model("claude-opus-5");
        alpha.aliases = vec!["opus".into()];
        let mut beta = model("opus");
        beta.aliases = vec!["opus-pro".into()];
        let providers = vec![
            provider_entry("p1", true, vec![alpha]),
            provider_entry("p2", true, vec![beta]),
            provider_entry("p3", false, vec![model("opus")]),
        ];

        // One alias key and one request name can point at the same candidate set.
        assert_eq!(
            resolve_model_reference(&providers, &[], "opus"),
            vec![
                ("p1".to_owned(), "claude-opus-5".to_owned()),
                ("p2".to_owned(), "opus".to_owned())
            ]
        );
        assert_eq!(
            resolve_model_reference(&providers, &[], "opus-pro"),
            vec![("p2".to_owned(), "opus".to_owned())]
        );
        // A disabled provider contributes no candidates.
        assert!(resolve_model_reference(&providers, &[], "disabled-only").is_empty());
        assert!(resolve_model_reference(&providers[2..], &[], "opus").is_empty());
        assert!(resolve_model_reference(&providers, &[], "unknown").is_empty());
    }

    #[test]
    fn references_expand_unified_members_and_skip_unavailable_ones() {
        let providers = vec![
            provider_entry("p1", true, vec![model("m1")]),
            provider_entry("p2", false, vec![model("m2")]),
        ];
        let unified_models = vec![unified("claude", &[("p2", "m2"), ("p1", "m1")])];

        // Disabled member dropped, order preserved.
        assert_eq!(
            resolve_model_reference(&providers, &unified_models, "claude"),
            vec![("p1".to_owned(), "m1".to_owned())]
        );

        let all_disabled = vec![unified("kimi", &[("p2", "m2")])];
        assert!(resolve_model_reference(&providers, &all_disabled, "kimi").is_empty());

        let missing = vec![unified("ghost", &[("gone", "m9")])];
        assert!(resolve_model_reference(&providers, &missing, "ghost").is_empty());

        // A unified name owns its name; a model aliased to it does not shadow it.
        let mut named = model("claude-alias-owner");
        named.aliases = vec!["claude".into()];
        let shadowed = vec![provider_entry("p1", true, vec![model("m1"), named])];
        assert_eq!(
            resolve_model_reference(&shadowed, &unified_models, "claude"),
            vec![("p1".to_owned(), "m1".to_owned())]
        );
    }
}
