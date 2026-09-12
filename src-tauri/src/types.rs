//! Cross-domain persisted types shared by repositories and command DTOs.

use serde::ser::SerializeMap;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;

/// Persisted message role. JSON values are `user` and `assistant`; role is read
/// from the stored payload, never inferred from an entry's type or render branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
}

/// Ordered storage and render unit. `tag` names the variant kebab-case and
/// variant fields serialize camelCase; a provider's own JSON keys stay verbatim.
/// Example: { "type": "text", "text": "hi", "providerMetadata": { "vendor": { "k": 1 } } }
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum ContentBlock {
    Text {
        text: String,
        /// Absent when there is no provider metadata; a null input is treated as absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        provider_metadata: Option<serde_json::Value>,
    },
}

/// `entries.payload` shape for `message` entries: a role plus ordered content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePayload {
    pub role: MessageRole,
    pub content: Vec<ContentBlock>,
}

/// A session row as returned by the repository.
#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// A message tree node with its decoded payload.
#[derive(Debug, Clone)]
pub struct Entry {
    pub id: String,
    pub parent_id: Option<String>,
    pub role: MessageRole,
    pub content: Vec<ContentBlock>,
    pub created_at: String,
}

/// Result of the atomic first-send: the new session and its first entry.
#[derive(Debug, Clone)]
pub struct CreatedSession {
    pub session: Session,
    pub entry: Entry,
}

/// One keyset page of sessions plus the cursor for the next page, if any.
#[derive(Debug, Clone)]
pub struct SessionPage {
    pub sessions: Vec<Session>,
    pub next_cursor: Option<SessionCursor>,
}

/// Keyset cursor over `(updated_at, id)` for session list pagination.
#[derive(Debug, Clone)]
pub struct SessionCursor {
    pub updated_at: String,
    pub id: String,
}

/// One window of a session's active path. `entries` are always ordered
/// oldest-to-newest; each cursor carries the id of the page's boundary entry
/// and is `Some` only when the path continues past that boundary.
#[derive(Debug, Clone)]
pub struct PathPage {
    pub entries: Vec<Entry>,
    /// Oldest entry in the page; `Some` only when an older parent remains.
    pub prev_cursor: Option<String>,
    /// Newest entry in the page; `Some` only when an active-path successor remains.
    pub next_cursor: Option<String>,
}

/// Plaintext credential wrapper: `Debug`/`Display` print `[REDACTED]` and
/// `expose()` is the only plaintext read. Serialization keeps the plaintext
/// because disk and IPC forms are plaintext; the guard targets logs and errors.
#[derive(Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SecretString(String);

impl SecretString {
    /// Borrows the plaintext for persistence and upstream authentication headers;
    /// never log it.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl From<&str> for SecretString {
    fn from(value: &str) -> Self {
        SecretString(value.to_owned())
    }
}

impl From<String> for SecretString {
    fn from(value: String) -> Self {
        SecretString(value)
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[REDACTED]")
    }
}

impl fmt::Display for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[REDACTED]")
    }
}

/// Protocol family name, an open set: unknown names stay representable and are
/// rejected by domain validation, so adding a family needs no migration.
/// Example: Protocol::from("openai-completions") serializes to "openai-completions".
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Protocol(String);

impl Protocol {
    /// Borrows the family name for validation and error messages.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for Protocol {
    fn from(value: &str) -> Self {
        Protocol(value.to_owned())
    }
}

impl From<String> for Protocol {
    fn from(value: String) -> Self {
        Protocol(value)
    }
}

impl fmt::Display for Protocol {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// Reasoning output mode: `auto` follows vendor detection, `always` replays
/// reasoning content, `off` drops it. A missing key means `auto`.
/// Example: ReasoningOutputMode::Auto serializes to "auto".
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningOutputMode {
    #[default]
    Auto,
    Always,
    Off,
}

/// Provider configuration document shared by persistence, IPC and the request
/// domain: a missing key keeps the documented default, an explicit null is unset.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub name: String,
    pub base_url: String,
    /// Protocol pre-checked when adding a model; resolve never reads it.
    pub api: Protocol,
    #[serde(default)]
    pub api_key: SecretString,
    #[serde(default = "ProviderConfig::default_true")]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub headers: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compat: Option<BTreeMap<Protocol, serde_json::Value>>,
    #[serde(default = "ProviderConfig::default_request_timeout_ms")]
    pub request_timeout_ms: u32,
    #[serde(default = "ProviderConfig::default_stream_idle_timeout_ms")]
    pub stream_idle_timeout_ms: u32,
    #[serde(default = "ProviderConfig::default_max_retries")]
    pub max_retries: u32,
    #[serde(default = "ProviderConfig::default_true")]
    pub abort_on_disconnect: bool,
    #[serde(default)]
    pub reasoning_output: ReasoningOutputMode,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub models: Vec<ModelEntry>,
}

impl ProviderConfig {
    fn default_true() -> bool {
        true
    }

    fn default_request_timeout_ms() -> u32 {
        120_000
    }

    fn default_stream_idle_timeout_ms() -> u32 {
        120_000
    }

    fn default_max_retries() -> u32 {
        2
    }
}

/// Provider identity plus its configuration, flattened into a single object so
/// the wire shape is the config fields plus `id`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    #[serde(flatten)]
    pub config: ProviderConfig,
}

/// One provider model: `id` is the upstream request name, `apis` the checked
/// protocol set (array order is check order).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub apis: Vec<Protocol>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default)]
    pub reasoning: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking_level_map: Option<ThinkingLevelMap>,
    #[serde(
        default = "ModelEntry::default_input_modalities",
        skip_serializing_if = "Vec::is_empty"
    )]
    pub input: Vec<InputModality>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost: Option<ModelCost>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sampling_params: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headers: Option<BTreeMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compat: Option<BTreeMap<Protocol, serde_json::Value>>,
}

impl ModelEntry {
    fn default_input_modalities() -> Vec<InputModality> {
        vec![InputModality::Text]
    }
}

/// Thinking level selector; the seven keys of `thinkingLevelMap`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThinkingLevel {
    Off,
    Minimal,
    Low,
    Medium,
    High,
    Xhigh,
    Max,
}

/// Per-level thinking overrides: a string is the value sent upstream, an explicit
/// null disables the level, an absent key falls back to the family default
/// (`xhigh`/`max` are opt-in). Example: { "off": null, "high": "high" }.
pub type ThinkingLevelMap = BTreeMap<ThinkingLevel, Option<String>>;

/// Model input modality: `text` or `image`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InputModality {
    Text,
    Image,
}

/// Per-million-token rates in USD, display and estimation only — never a routing
/// gate. The base rates price off-peak usage; a `tiers` entry replaces the base
/// rates for a whole request once input tokens (input plus cache reads and
/// writes) exceed its threshold, and `peak` replaces them inside its windows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCost {
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
    pub cache_write: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tiers: Option<Vec<ModelCostTier>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub peak: Option<PeakPricing>,
}

/// One cost tier; `inputTokensAbove` counts total input tokens.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCostTier {
    pub input_tokens_above: u64,
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
    pub cache_write: f64,
}

/// Peak-time rates replacing the enclosing cost's base rates inside `windows`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeakPricing {
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
    pub cache_write: f64,
    #[serde(default)]
    pub windows: Vec<TimeWindow>,
}

/// One daily pricing window in UTC; `end < start` crosses midnight and an empty
/// `days` list means every day.
/// Example: { "days": ["mon", "tue"], "start": "01:00", "end": "04:00" }.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeWindow {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub days: Vec<Weekday>,
    pub start: String,
    pub end: String,
}

/// Day of week of a pricing window; wire values are lowercase short names.
/// Example: Weekday::Mon serializes to "mon".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Weekday {
    Mon,
    Tue,
    Wed,
    Thu,
    Fri,
    Sat,
    Sun,
}

/// Cross-provider aggregate name: members are pinned `(provider, model)` pairs in
/// attempt order; its name is independent of provider model names.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedModel {
    pub id: String,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub members: Vec<UnifiedMember>,
}

/// One aggregate member: a model entry pinned by provider id and model id.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedMember {
    pub provider_id: String,
    pub model: String,
}

/// Placeholder for a provider row whose stored columns no longer decode: the row
/// stays listed and deletable instead of failing the whole list. `corrupted` is
/// always serialized as `true`, which is how clients tell it from `Provider`.
/// Example: { "id": "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001", "corrupted": true }.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CorruptedProvider {
    pub id: String,
}

impl Serialize for CorruptedProvider {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serialize_corrupted_row(&self.id, serializer)
    }
}

/// Placeholder for a unified model whose aggregate no longer decodes; same wire
/// shape as `CorruptedProvider`.
/// Example: { "id": "fast", "corrupted": true }.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CorruptedUnified {
    pub id: String,
}

impl Serialize for CorruptedUnified {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serialize_corrupted_row(&self.id, serializer)
    }
}

/// Wire shape shared by both degraded-row placeholders: the id plus the
/// `corrupted: true` discriminator.
fn serialize_corrupted_row<S: serde::Serializer>(
    id: &str,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    let mut row = serializer.serialize_map(Some(2))?;
    row.serialize_entry("id", id)?;
    row.serialize_entry("corrupted", &true)?;
    row.end()
}

/// `maxTokensField` domain: which request field carries the output-token cap.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaxTokensField {
    MaxCompletionTokens,
    MaxTokens,
}

/// `thinkingFormat` domain: the thinking/reasoning wire shape a provider uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ThinkingFormat {
    Openai,
    Openrouter,
    Together,
    Baseten,
    Deepseek,
    Zai,
    Qwen,
    ChatTemplate,
    QwenChatTemplate,
    StringThinking,
    AntLing,
}

/// `thinkingTokenBudgetField` domain: which request field carries a token budget.
/// Variant names drop the prefix shared by every wire literal (`thinking_`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThinkingTokenBudgetField {
    #[serde(rename = "thinking_token_budget")]
    TokenBudget,
    #[serde(rename = "thinking_budget")]
    Budget,
    #[serde(rename = "thinking_budget_tokens")]
    BudgetTokens,
}

/// `cacheControlFormat` domain; `anthropic` is the only mode today.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CacheControlFormat {
    Anthropic,
}

/// `deferredToolsMode` domain; `kimi` is the only mode today.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeferredToolsMode {
    Kimi,
}

/// `sessionAffinityFormat` domain: which affinity headers identify a session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SessionAffinityFormat {
    Openai,
    OpenaiNosession,
    Openrouter,
}

/// One `chatTemplateKwargs`/`chatTemplateArgs` entry: a `$var` reference, or any
/// other value kept verbatim (extra keys fall back to verbatim, never dropped).
/// Example: { "$var": "thinking.budget", "omitWhenOff": true }.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChatTemplateValue {
    Var(ChatTemplateVar),
    Scalar(serde_json::Value),
}

/// `$var` reference: which runtime value to substitute, and whether to drop the
/// argument when thinking is off.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatTemplateVar {
    #[serde(rename = "$var")]
    pub var: ChatTemplateVariable,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub omit_when_off: Option<bool>,
}

/// Substitution source for `$var`: `thinking.enabled`, `thinking.effort` or
/// `thinking.budget`; variant names drop the shared `thinking.` prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChatTemplateVariable {
    #[serde(rename = "thinking.enabled")]
    Enabled,
    #[serde(rename = "thinking.effort")]
    Effort,
    #[serde(rename = "thinking.budget")]
    Budget,
}

/// OpenAI chat-completions quirks. Every field is an optional override: an unset
/// key leaves the lower merge layer (family default, then vendor specialisation)
/// in place. Foreign-family and misspelled keys are rejected, never dropped.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct OpenaiCompletionsCompat {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_store: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_developer_role: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_reasoning_effort: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_usage_in_streaming: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_finish_reason: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens_field: Option<MaxTokensField>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_tool_result_name: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_assistant_after_tool_result: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_thinking_as_text: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_reasoning_content_on_assistant_messages: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_format: Option<ThinkingFormat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_template_kwargs: Option<BTreeMap<String, ChatTemplateValue>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_template_args: Option<BTreeMap<String, ChatTemplateValue>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_token_budget_field: Option<ThinkingTokenBudgetField>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_thinking_token_budget: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zai_tool_stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_control_format: Option<CacheControlFormat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open_router_routing: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vercel_gateway_routing: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(rename = "supportsOpenAIGrammarTools", skip_serializing_if = "Option::is_none")]
    pub supports_open_ai_grammar_tools: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_strict_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_session_affinity_headers: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deferred_tools_mode: Option<DeferredToolsMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_affinity_format: Option<SessionAffinityFormat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_long_cache_retention: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vllm_priority: Option<f64>,
}

/// OpenAI responses quirks. Every field is an optional override: an unset key
/// leaves the lower merge layer in place. Foreign-family keys are rejected.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct OpenaiResponsesCompat {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_developer_role: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_affinity_format: Option<SessionAffinityFormat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_long_cache_retention: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_strict_mode: Option<bool>,
    #[serde(rename = "supportsOpenAIGrammarTools", skip_serializing_if = "Option::is_none")]
    pub supports_open_ai_grammar_tools: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_additional_tools: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_tool_search: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_explicit_prompt_cache_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_max_output_tokens: Option<bool>,
}

/// One server-side fallback model: `provider` is the upstream provider string
/// (not a Nostra provider id) and `cost` prices the fallback like a model entry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnthropicFallbackModel {
    pub provider: String,
    pub model: String,
    pub cost: ModelCost,
}

/// Anthropic messages quirks. Every field is an optional override: an unset key
/// leaves the lower merge layer in place. Foreign-family keys are rejected.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct AnthropicMessagesCompat {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_eager_tool_input_streaming: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_long_cache_retention: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_session_affinity_headers: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_cache_control_on_tools: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_temperature: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub force_adaptive_thinking: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_empty_signature: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_strict_tools: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_mid_convo_effort: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_tool_references: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_fallback_models: Option<Vec<AnthropicFallbackModel>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn corrupted_row_placeholders_serialize_the_discriminator() {
        assert_eq!(
            serde_json::to_value(CorruptedProvider { id: "p1".into() }).unwrap(),
            json!({ "id": "p1", "corrupted": true })
        );
        assert_eq!(
            serde_json::to_value(CorruptedUnified { id: "fast".into() }).unwrap(),
            json!({ "id": "fast", "corrupted": true })
        );
    }

    #[test]
    fn message_role_serializes_to_lowercase_contract_values() {
        assert_eq!(serde_json::to_value(MessageRole::User).unwrap(), json!("user"));
        assert_eq!(serde_json::to_value(MessageRole::Assistant).unwrap(), json!("assistant"));
        assert_eq!(
            serde_json::from_value::<MessageRole>(json!("user")).unwrap(),
            MessageRole::User
        );
    }

    #[test]
    fn text_block_encodes_type_tag_and_camel_case_metadata_field() {
        let block = ContentBlock::Text {
            text: "hello".into(),
            provider_metadata: Some(json!({ "vendor": { "opaque": "value" } })),
        };
        let value = serde_json::to_value(&block).unwrap();
        assert_eq!(value["type"], json!("text"));
        assert_eq!(value["text"], json!("hello"));
        // Field-name contract: the frontend mirror relies on `providerMetadata`,
        // not the Rust snake_case identifier.
        assert_eq!(value["providerMetadata"], json!({ "vendor": { "opaque": "value" } }));
        assert!(value.get("provider_metadata").is_none());
    }

    #[test]
    fn text_block_omits_metadata_when_absent() {
        let block = ContentBlock::Text { text: "hi".into(), provider_metadata: None };
        let value = serde_json::to_value(&block).unwrap();
        assert!(value.get("providerMetadata").is_none());
        assert_eq!(value, json!({ "type": "text", "text": "hi" }));
    }

    #[test]
    fn text_block_decodes_fixed_json_with_camel_case_metadata() {
        let input = json!({
            "type": "text",
            "text": "hello",
            "providerMetadata": { "vendor": { "opaque": "value" } }
        });
        let block: ContentBlock = serde_json::from_value(input).unwrap();
        let ContentBlock::Text { text, provider_metadata } = block;
        assert_eq!(text, "hello");
        assert_eq!(provider_metadata, Some(json!({ "vendor": { "opaque": "value" } })));
    }

    #[test]
    fn null_metadata_input_decodes_as_absent() {
        let input = json!({ "type": "text", "text": "hi", "providerMetadata": null });
        let block: ContentBlock = serde_json::from_value(input).unwrap();
        let ContentBlock::Text { provider_metadata, .. } = block;
        assert_eq!(provider_metadata, None);
    }

    #[test]
    fn payload_preserves_content_order() {
        let payload = MessagePayload {
            role: MessageRole::User,
            content: vec![
                ContentBlock::Text { text: "first".into(), provider_metadata: None },
                ContentBlock::Text { text: "second".into(), provider_metadata: None },
            ],
        };
        let value = serde_json::to_value(&payload).unwrap();
        let content = value["content"].as_array().unwrap();
        assert_eq!(content[0]["text"], json!("first"));
        assert_eq!(content[1]["text"], json!("second"));

        let decoded: MessagePayload = serde_json::from_value(value).unwrap();
        assert_eq!(decoded.content.len(), 2);
        let ContentBlock::Text { text, .. } = &decoded.content[0];
        assert_eq!(text, "first");
    }

    use std::collections::BTreeMap;

    // Split out of the provider fixture: nesting cost, tiers and peak in one
    // `json!` call exceeds the default macro recursion limit.
    fn model_cost_fixture() -> serde_json::Value {
        json!({
            "input": 1.25,
            "output": 10.0,
            "cacheRead": 0.125,
            "cacheWrite": 1.5,
            "tiers": [
                {
                    "inputTokensAbove": 200000,
                    "input": 2.5,
                    "output": 20.0,
                    "cacheRead": 0.25,
                    "cacheWrite": 3.0
                }
            ],
            "peak": {
                "input": 2.0,
                "output": 16.0,
                "cacheRead": 0.2,
                "cacheWrite": 2.4,
                "windows": [
                    { "days": ["mon", "tue", "wed", "thu", "fri"], "start": "01:00", "end": "04:00" },
                    { "start": "23:30", "end": "00:30" }
                ]
            }
        })
    }

    fn full_provider_fixture() -> serde_json::Value {
        json!({
            "id": "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
            "name": "OpenRouter",
            "api": "openai-completions",
            "baseUrl": "https://openrouter.ai/api/v1",
            "apiKey": "sk-or-live-secret",
            "enabled": true,
            "headers": { "HTTP-Referer": "https://nostra.example" },
            "compat": {
                "openai-completions": { "maxTokensField": "max_tokens" },
                "anthropic-messages": { "supportsTemperature": false }
            },
            "requestTimeoutMs": 45000,
            "streamIdleTimeoutMs": 90000,
            "maxRetries": 4,
            "abortOnDisconnect": false,
            "reasoningOutput": "always",
            "models": [
                {
                    "id": "openai/gpt-5.2",
                    "name": "GPT-5.2",
                    "apis": ["openai-responses", "openai-completions"],
                    "baseUrl": "https://openrouter.ai/api/v1/gpt",
                    "reasoning": true,
                    "thinkingLevelMap": { "off": null, "minimal": "minimal", "high": "high", "max": "max" },
                    "input": ["text", "image"],
                    "cost": model_cost_fixture(),
                    "contextWindow": 400000,
                    "maxTokens": 128000,
                    "samplingParams": { "temperature": 0.7, "topP": 0.9 },
                    "headers": { "x-model-tier": "beta" },
                    "compat": { "openai-responses": { "supportsToolSearch": true } }
                }
            ]
        })
    }

    fn openai_completions_compat_fixture() -> serde_json::Value {
        json!({
            "supportsStore": true,
            "supportsDeveloperRole": true,
            "supportsReasoningEffort": true,
            "supportsUsageInStreaming": true,
            "supportsFinishReason": true,
            "maxTokensField": "max_completion_tokens",
            "requiresToolResultName": true,
            "requiresAssistantAfterToolResult": true,
            "requiresThinkingAsText": true,
            "requiresReasoningContentOnAssistantMessages": true,
            "thinkingFormat": "ant-ling",
            "chatTemplateKwargs": {
                "enable_thinking": true,
                "thinking_budget": { "$var": "thinking.budget", "omitWhenOff": true }
            },
            "chatTemplateArgs": { "reasoning_effort": { "$var": "thinking.effort" } },
            "thinkingTokenBudgetField": "thinking_budget_tokens",
            "supportsThinkingTokenBudget": true,
            "zaiToolStream": true,
            "cacheControlFormat": "anthropic",
            "openRouterRouting": { "only": ["anthropic"], "allow_fallbacks": false },
            "vercelGatewayRouting": { "order": ["anthropic", "openai"] },
            "supportsOpenAIGrammarTools": true,
            "supportsStrictMode": true,
            "sendSessionAffinityHeaders": true,
            "deferredToolsMode": "kimi",
            "sessionAffinityFormat": "openai-nosession",
            "supportsLongCacheRetention": true,
            "vllmPriority": 10.0
        })
    }

    fn openai_responses_compat_fixture() -> serde_json::Value {
        json!({
            "supportsDeveloperRole": true,
            "sessionAffinityFormat": "openrouter",
            "supportsLongCacheRetention": true,
            "supportsStrictMode": true,
            "supportsOpenAIGrammarTools": true,
            "supportsAdditionalTools": true,
            "supportsToolSearch": true,
            "supportsExplicitPromptCacheMode": true,
            "supportsMaxOutputTokens": true
        })
    }

    fn anthropic_messages_compat_fixture() -> serde_json::Value {
        json!({
            "supportsEagerToolInputStreaming": true,
            "supportsLongCacheRetention": true,
            "sendSessionAffinityHeaders": true,
            "supportsCacheControlOnTools": true,
            "supportsTemperature": true,
            "forceAdaptiveThinking": true,
            "allowEmptySignature": true,
            "supportsStrictTools": true,
            "supportsMidConvoEffort": true,
            "supportsToolReferences": true,
            "allowedFallbackModels": [
                {
                    "provider": "anthropic",
                    "model": "claude-opus-4-1",
                    "cost": { "input": 15.0, "output": 75.0, "cacheRead": 1.5, "cacheWrite": 18.75 }
                }
            ]
        })
    }

    #[test]
    fn provider_round_trips_every_field_at_non_default_values() {
        let fixture = full_provider_fixture();
        let provider: Provider = serde_json::from_value(fixture.clone()).unwrap();
        assert_eq!(provider.id, "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001");
        assert_eq!(provider.config.api, Protocol::from("openai-completions"));
        assert_eq!(provider.config.api_key.expose(), "sk-or-live-secret");
        assert_eq!(provider.config.request_timeout_ms, 45_000);
        assert_eq!(provider.config.stream_idle_timeout_ms, 90_000);
        assert_eq!(provider.config.max_retries, 4);
        assert!(!provider.config.abort_on_disconnect);
        assert_eq!(provider.config.reasoning_output, ReasoningOutputMode::Always);
        let model = &provider.config.models[0];
        assert_eq!(
            model.apis,
            vec![Protocol::from("openai-responses"), Protocol::from("openai-completions")]
        );
        assert_eq!(model.input, vec![InputModality::Text, InputModality::Image]);
        let level_map = model.thinking_level_map.as_ref().unwrap();
        assert_eq!(level_map.get(&ThinkingLevel::Off), Some(&None));
        assert_eq!(level_map.get(&ThinkingLevel::High), Some(&Some("high".to_owned())));
        assert_eq!(
            model.cost.as_ref().unwrap().tiers.as_ref().unwrap()[0].input_tokens_above,
            200_000
        );
        let peak = model.cost.as_ref().unwrap().peak.as_ref().unwrap();
        assert_eq!(peak.output, 16.0);
        assert_eq!(
            peak.windows[0].days,
            vec![Weekday::Mon, Weekday::Tue, Weekday::Wed, Weekday::Thu, Weekday::Fri]
        );
        // A window without `days` prices every day and stays absent on the way out.
        assert!(peak.windows[1].days.is_empty());
        assert_eq!(peak.windows[1].start, "23:30");
        // Serialized output must match the fixture field for field: any field
        // silently dropped by serde attribute drift breaks this assertion.
        assert_eq!(serde_json::to_value(&provider).unwrap(), fixture);
    }

    #[test]
    fn provider_config_applies_documented_defaults_for_missing_keys() {
        let config: ProviderConfig = serde_json::from_value(json!({
            "name": "Ollama",
            "baseUrl": "http://localhost:11434/v1",
            "api": "openai-completions"
        }))
        .unwrap();
        assert_eq!(config.api_key.expose(), "");
        assert!(config.enabled);
        assert_eq!(config.headers, BTreeMap::new());
        assert_eq!(config.compat, None);
        assert_eq!(config.request_timeout_ms, 120_000);
        assert_eq!(config.stream_idle_timeout_ms, 120_000);
        assert_eq!(config.max_retries, 2);
        assert!(config.abort_on_disconnect);
        assert_eq!(config.reasoning_output, ReasoningOutputMode::Auto);
        assert!(config.models.is_empty());
    }

    #[test]
    fn model_cost_round_trips_peak_windows() {
        let fixture = json!({
            "input": 0.15,
            "output": 0.6,
            "cacheRead": 0.003,
            "cacheWrite": 0.0,
            "peak": {
                "input": 0.3,
                "output": 1.2,
                "cacheRead": 0.006,
                "cacheWrite": 0.0,
                "windows": [
                    { "days": ["mon", "tue", "wed", "thu", "fri"], "start": "01:00", "end": "04:00" },
                    { "days": ["sat", "sun"], "start": "22:30", "end": "02:00" }
                ]
            }
        });
        let cost: ModelCost = serde_json::from_value(fixture.clone()).unwrap();
        let peak = cost.peak.as_ref().unwrap();
        assert_eq!(peak.input, 0.3);
        assert_eq!(peak.cache_read, 0.006);
        assert_eq!(peak.windows[1].days, vec![Weekday::Sat, Weekday::Sun]);
        // `end` before `start` is a window crossing midnight, not an error.
        assert_eq!(peak.windows[1].end, "02:00");
        assert_eq!(serde_json::to_value(&cost).unwrap(), fixture);
    }

    #[test]
    fn time_window_days_are_optional_and_typed() {
        let window: TimeWindow =
            serde_json::from_value(json!({ "start": "00:00", "end": "01:00" })).unwrap();
        assert!(window.days.is_empty());
        // An empty day list stays absent on the way out: both forms mean every day.
        assert_eq!(
            serde_json::to_value(&window).unwrap(),
            json!({ "start": "00:00", "end": "01:00" })
        );
        let unknown_day = serde_json::from_value::<TimeWindow>(
            json!({ "start": "00:00", "end": "01:00", "days": ["funday"] }),
        );
        assert!(unknown_day.is_err());
    }

    #[test]
    fn model_entry_defaults_to_text_input_and_no_protocols() {
        let model: ModelEntry = serde_json::from_value(json!({ "id": "qwen3:8b" })).unwrap();
        assert_eq!(model.input, vec![InputModality::Text]);
        assert!(model.apis.is_empty());
        assert!(!model.reasoning);
        assert_eq!(model.name, None);
        assert_eq!(model.cost, None);
    }

    #[test]
    fn provider_document_treats_explicit_null_as_unset() {
        let provider: Provider = serde_json::from_value(json!({
            "id": "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0002",
            "name": "Local",
            "api": "openai-completions",
            "baseUrl": "http://localhost:8080/v1",
            "compat": null,
            "models": [
                {
                    "id": "llama-4",
                    "name": null,
                    "baseUrl": null,
                    "thinkingLevelMap": null,
                    "cost": null,
                    "contextWindow": null,
                    "maxTokens": null,
                    "samplingParams": null,
                    "headers": null,
                    "compat": null
                }
            ]
        }))
        .unwrap();
        assert_eq!(provider.config.compat, None);
        let model = &provider.config.models[0];
        assert_eq!(model.name, None);
        assert_eq!(model.base_url, None);
        assert_eq!(model.thinking_level_map, None);
        assert_eq!(model.cost, None);
        assert_eq!(model.context_window, None);
        assert_eq!(model.max_tokens, None);
        assert_eq!(model.sampling_params, None);
        assert_eq!(model.headers, None);
        assert_eq!(model.compat, None);

        let cost: ModelCost = serde_json::from_value(json!({
            "input": 0.0,
            "output": 0.0,
            "cacheRead": 0.0,
            "cacheWrite": 0.0,
            "tiers": null,
            "peak": null
        }))
        .unwrap();
        assert_eq!(cost.tiers, None);
        assert_eq!(cost.peak, None);

        // Unset optional keys stay absent on the way out instead of becoming null.
        let value = serde_json::to_value(&provider).unwrap();
        assert!(value.get("compat").is_none());
        assert!(value["models"][0].get("name").is_none());
        assert!(value["models"][0].get("cost").is_none());
    }

    #[test]
    fn provider_document_ignores_unknown_keys() {
        let provider: Provider = serde_json::from_value(json!({
            "id": "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0003",
            "name": "Future",
            "api": "openai-completions",
            "baseUrl": "https://future.example/v1",
            "futureProviderSwitch": true,
            "models": [ { "id": "m1", "futureModelField": { "nested": 1 } } ]
        }))
        .unwrap();
        assert_eq!(provider.config.name, "Future");
        let value = serde_json::to_value(&provider).unwrap();
        assert!(value.get("futureProviderSwitch").is_none());
        assert!(value["models"][0].get("futureModelField").is_none());
    }

    #[test]
    fn secret_string_redacts_debug_output_and_keeps_plaintext_on_the_wire() {
        let secret = SecretString::from("sk-or-live-secret");
        assert_eq!(format!("{secret:?}"), "[REDACTED]");
        assert_eq!(secret.to_string(), "[REDACTED]");
        assert_eq!(secret.expose(), "sk-or-live-secret");
        assert_eq!(SecretString::default().expose(), "");
        // Disk and IPC forms are plaintext by contract; masking is the frontend's job.
        assert_eq!(serde_json::to_value(&secret).unwrap(), json!("sk-or-live-secret"));

        let provider: Provider = serde_json::from_value(json!({
            "id": "p1",
            "name": "OpenRouter",
            "api": "openai-completions",
            "baseUrl": "https://openrouter.ai/api/v1",
            "apiKey": "sk-or-live-secret"
        }))
        .unwrap();
        let debug = format!("{provider:?}");
        assert!(!debug.contains("sk-or-live-secret"));
        assert!(debug.contains("[REDACTED]"));
    }

    #[test]
    fn thinking_level_map_distinguishes_absent_keys_from_explicit_null() {
        let input = json!({ "off": null, "high": "high", "max": "max" });
        let map: ThinkingLevelMap = serde_json::from_value(input.clone()).unwrap();
        assert_eq!(map.get(&ThinkingLevel::Off), Some(&None));
        assert_eq!(map.get(&ThinkingLevel::High), Some(&Some("high".to_owned())));
        // An absent key falls back to the family default; only null disables a level.
        assert_eq!(map.get(&ThinkingLevel::Medium), None);
        assert_eq!(serde_json::to_value(&map).unwrap(), input);
        assert!(serde_json::from_value::<ThinkingLevelMap>(json!({ "bogus": "high" })).is_err());
    }

    #[test]
    fn chat_template_arguments_decode_var_references_and_scalars() {
        let input = json!({
            "enable_thinking": true,
            "thinking_budget": { "$var": "thinking.budget", "omitWhenOff": true },
            "reasoning_effort": { "$var": "thinking.effort" }
        });
        let args: BTreeMap<String, ChatTemplateValue> =
            serde_json::from_value(input.clone()).unwrap();
        assert_eq!(
            args["thinking_budget"],
            ChatTemplateValue::Var(ChatTemplateVar {
                var: ChatTemplateVariable::Budget,
                omit_when_off: Some(true),
            })
        );
        assert_eq!(
            args["reasoning_effort"],
            ChatTemplateValue::Var(ChatTemplateVar {
                var: ChatTemplateVariable::Effort,
                omit_when_off: None,
            })
        );
        assert_eq!(args["enable_thinking"], ChatTemplateValue::Scalar(json!(true)));
        assert_eq!(serde_json::to_value(&args).unwrap(), input);

        // Values that do not match the `$var` shape stay verbatim: an unknown var
        // name or a stray key degrades to the scalar form, never a silent drop.
        let unknown_var = json!({ "$var": "thinking.unknown" });
        assert_eq!(
            serde_json::from_value::<ChatTemplateValue>(unknown_var.clone()).unwrap(),
            ChatTemplateValue::Scalar(unknown_var)
        );
        let extra_key = json!({ "$var": "thinking.budget", "extra": true });
        assert_eq!(
            serde_json::from_value::<ChatTemplateValue>(extra_key.clone()).unwrap(),
            ChatTemplateValue::Scalar(extra_key)
        );
    }

    #[test]
    fn openai_completions_compat_round_trips_every_field() {
        let fixture = openai_completions_compat_fixture();
        let compat: OpenaiCompletionsCompat = serde_json::from_value(fixture.clone()).unwrap();
        assert_eq!(compat.max_tokens_field, Some(MaxTokensField::MaxCompletionTokens));
        assert_eq!(compat.thinking_format, Some(ThinkingFormat::AntLing));
        assert_eq!(compat.supports_open_ai_grammar_tools, Some(true));
        assert_eq!(compat.vllm_priority, Some(10.0));
        assert_eq!(
            compat.chat_template_kwargs.as_ref().unwrap()["thinking_budget"],
            ChatTemplateValue::Var(ChatTemplateVar {
                var: ChatTemplateVariable::Budget,
                omit_when_off: Some(true),
            })
        );
        assert_eq!(serde_json::to_value(&compat).unwrap(), fixture);
    }

    #[test]
    fn openai_responses_compat_round_trips_every_field() {
        let fixture = openai_responses_compat_fixture();
        let compat: OpenaiResponsesCompat = serde_json::from_value(fixture.clone()).unwrap();
        assert_eq!(compat.supports_explicit_prompt_cache_mode, Some(true));
        assert_eq!(compat.session_affinity_format, Some(SessionAffinityFormat::Openrouter));
        assert_eq!(serde_json::to_value(&compat).unwrap(), fixture);
    }

    #[test]
    fn anthropic_messages_compat_round_trips_every_field() {
        let fixture = anthropic_messages_compat_fixture();
        let compat: AnthropicMessagesCompat = serde_json::from_value(fixture.clone()).unwrap();
        let fallback = &compat.allowed_fallback_models.as_ref().unwrap()[0];
        assert_eq!(fallback.provider, "anthropic");
        assert_eq!(fallback.model, "claude-opus-4-1");
        assert_eq!(fallback.cost.input, 15.0);
        assert_eq!(serde_json::to_value(&compat).unwrap(), fixture);
    }

    #[test]
    fn compat_fragments_omit_unset_fields() {
        // Fragments carry only explicit overrides; a null would override the layers
        // below them once the four-layer merge runs.
        assert_eq!(serde_json::to_value(OpenaiCompletionsCompat::default()).unwrap(), json!({}));
        assert_eq!(serde_json::to_value(OpenaiResponsesCompat::default()).unwrap(), json!({}));
        assert_eq!(serde_json::to_value(AnthropicMessagesCompat::default()).unwrap(), json!({}));
    }

    #[test]
    fn compat_structs_reject_fields_of_another_family() {
        let anthropic_shaped =
            json!({ "supportsToolReferences": true, "supportsTemperature": true });
        assert!(serde_json::from_value::<OpenaiCompletionsCompat>(anthropic_shaped).is_err());

        let openai_shaped = json!({ "supportsStore": true, "vllmPriority": 1.0 });
        assert!(serde_json::from_value::<AnthropicMessagesCompat>(openai_shaped).is_err());

        let misspelled = json!({ "supportsDeveloperRoles": true });
        assert!(serde_json::from_value::<OpenaiResponsesCompat>(misspelled).is_err());
    }

    #[test]
    fn compat_map_keys_serialize_as_protocol_names() {
        let mut compat = BTreeMap::new();
        compat.insert(
            Protocol::from("openai-completions"),
            json!({ "maxTokensField": "max_tokens" }),
        );
        compat
            .insert(Protocol::from("anthropic-messages"), json!({ "supportsTemperature": false }));
        let value = serde_json::to_value(&compat).unwrap();
        assert_eq!(value["openai-completions"], json!({ "maxTokensField": "max_tokens" }));
        assert_eq!(value["anthropic-messages"], json!({ "supportsTemperature": false }));
        assert_eq!(value.as_object().unwrap().len(), 2);
        let decoded: BTreeMap<Protocol, serde_json::Value> = serde_json::from_value(value).unwrap();
        assert_eq!(decoded, compat);
    }

    #[test]
    fn compat_literal_domains_serialize_to_contract_values() {
        for (field, wire) in [
            (MaxTokensField::MaxCompletionTokens, "max_completion_tokens"),
            (MaxTokensField::MaxTokens, "max_tokens"),
        ] {
            assert_eq!(serde_json::to_value(field).unwrap(), json!(wire));
            assert_eq!(serde_json::from_value::<MaxTokensField>(json!(wire)).unwrap(), field);
        }

        for (format, wire) in [
            (ThinkingFormat::Openai, "openai"),
            (ThinkingFormat::Openrouter, "openrouter"),
            (ThinkingFormat::Together, "together"),
            (ThinkingFormat::Baseten, "baseten"),
            (ThinkingFormat::Deepseek, "deepseek"),
            (ThinkingFormat::Zai, "zai"),
            (ThinkingFormat::Qwen, "qwen"),
            (ThinkingFormat::ChatTemplate, "chat-template"),
            (ThinkingFormat::QwenChatTemplate, "qwen-chat-template"),
            (ThinkingFormat::StringThinking, "string-thinking"),
            (ThinkingFormat::AntLing, "ant-ling"),
        ] {
            assert_eq!(serde_json::to_value(format).unwrap(), json!(wire));
            assert_eq!(serde_json::from_value::<ThinkingFormat>(json!(wire)).unwrap(), format);
        }

        for (field, wire) in [
            (ThinkingTokenBudgetField::TokenBudget, "thinking_token_budget"),
            (ThinkingTokenBudgetField::Budget, "thinking_budget"),
            (ThinkingTokenBudgetField::BudgetTokens, "thinking_budget_tokens"),
        ] {
            assert_eq!(serde_json::to_value(field).unwrap(), json!(wire));
            assert_eq!(
                serde_json::from_value::<ThinkingTokenBudgetField>(json!(wire)).unwrap(),
                field
            );
        }

        for (format, wire) in [
            (SessionAffinityFormat::Openai, "openai"),
            (SessionAffinityFormat::OpenaiNosession, "openai-nosession"),
            (SessionAffinityFormat::Openrouter, "openrouter"),
        ] {
            assert_eq!(serde_json::to_value(format).unwrap(), json!(wire));
            assert_eq!(
                serde_json::from_value::<SessionAffinityFormat>(json!(wire)).unwrap(),
                format
            );
        }

        for (day, wire) in [
            (Weekday::Mon, "mon"),
            (Weekday::Tue, "tue"),
            (Weekday::Wed, "wed"),
            (Weekday::Thu, "thu"),
            (Weekday::Fri, "fri"),
            (Weekday::Sat, "sat"),
            (Weekday::Sun, "sun"),
        ] {
            assert_eq!(serde_json::to_value(day).unwrap(), json!(wire));
            assert_eq!(serde_json::from_value::<Weekday>(json!(wire)).unwrap(), day);
        }

        assert_eq!(
            serde_json::to_value(CacheControlFormat::Anthropic).unwrap(),
            json!("anthropic")
        );
        assert_eq!(serde_json::to_value(DeferredToolsMode::Kimi).unwrap(), json!("kimi"));
        assert_eq!(serde_json::to_value(ReasoningOutputMode::Off).unwrap(), json!("off"));
        assert_eq!(serde_json::to_value(InputModality::Image).unwrap(), json!("image"));
    }

    #[test]
    fn unified_model_round_trips_members_in_order() {
        let fixture = json!({
            "id": "claude-sonnet-5",

            "members": [
                {
                    "providerId": "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
                    "model": "anthropic/claude-sonnet-5"
                },
                {
                    "providerId": "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0002",
                    "model": "claude-sonnet-5"
                }
            ]
        });
        let unified: UnifiedModel = serde_json::from_value(fixture.clone()).unwrap();
        assert_eq!(unified.members[0].provider_id, "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001");
        assert_eq!(unified.members[1].model, "claude-sonnet-5");

        assert_eq!(serde_json::to_value(&unified).unwrap(), fixture);
    }
}
