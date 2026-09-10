// Mirror of the Rust command DTOs. The JSON contract is owned by
// src-tauri/src/commands/{sessions,entries,providers}.rs, src-tauri/src/types.rs
// and src-tauri/src/provider/config.rs; every change there must update this
// file in the same batch.

/**
 * Mirrors src-tauri/src/types.rs AnthropicFallbackModel: one server-side
 * fallback model; `provider` is the upstream provider string, not a Nostra
 * provider id.
 */
export interface AnthropicFallbackModel {
  cost: ModelCost;
  model: string;
  provider: string;
}

/**
 * Mirrors src-tauri/src/types.rs AnthropicMessagesCompat: overrides for the
 * `anthropic-messages` family. Unset fields keep their lower merge layer, and
 * keys from another family are rejected at save time.
 */
export interface AnthropicMessagesCompat {
  allowedFallbackModels?: AnthropicFallbackModel[];
  allowEmptySignature?: boolean;
  forceAdaptiveThinking?: boolean;
  sendSessionAffinityHeaders?: boolean;
  supportsCacheControlOnTools?: boolean;
  supportsEagerToolInputStreaming?: boolean;
  supportsLongCacheRetention?: boolean;
  supportsMidConvoEffort?: boolean;
  supportsStrictTools?: boolean;
  supportsTemperature?: boolean;
  supportsToolReferences?: boolean;
}

/**
 * Mirrors src-tauri/src/error.rs AppError: the shape every command rejects
 * with. User-facing copy comes from i18n `errors.<code>`; `message` is
 * developer diagnostics only.
 * Legal value: { code: "not_found", message: "session gone" }
 */
export interface AppError {
  code:
    | "config"
    | "db"
    | "internal"
    | "invalid_input"
    | "network"
    | "not_found"
    | "protocol";
  message: string;
}

/**
 * Mirrors src-tauri/src/types.rs ChatTemplateValue: one chatTemplateKwargs or
 * chatTemplateArgs entry — a `$var` reference or any other value kept verbatim.
 * Legal value: { "$var": "thinking.budget", omitWhenOff: true }
 */
export type ChatTemplateValue =
  JsonValue | { $var: ChatTemplateVariable; omitWhenOff?: boolean };

/**
 * Mirrors src-tauri/src/types.rs ChatTemplateVariable: the substitution source
 * of a `$var` reference.
 * Legal values: "thinking.budget" | "thinking.effort" | "thinking.enabled"
 */
export type ChatTemplateVariable =
  "thinking.budget" | "thinking.effort" | "thinking.enabled";

/**
 * Mirrors the stored compat bucket map of src-tauri/src/types.rs ProviderConfig
 * and ModelEntry: one flat override object per protocol family. An absent key
 * means the family has no bucket; a bucket whose key family mismatches its
 * value shape is rejected at save time.
 */
export interface CompatBuckets {
  "anthropic-messages"?: AnthropicMessagesCompat;
  "openai-completions"?: OpenaiCompletionsCompat;
  "openai-responses"?: OpenaiResponsesCompat;
}

/**
 * Mirrors src-tauri/src/provider/config.rs CompatSource: the merge layer that
 * supplied one effective compat field. Unknown strings never reach the
 * frontend.
 * Legal value: "familyDefault"
 */
export type CompatSource = "familyDefault" | "model" | "provider" | "vendor";

/**
 * Mirrors src-tauri/src/types.rs ContentBlock: the ordered storage and render
 * unit. The tag is the kebab-case variant name, variant fields are camelCase;
 * a provider's own JSON keys stay verbatim. Absent metadata serializes with the
 * field omitted.
 * Legal value: { "type": "text", "text": "hi", "providerMetadata": { "vendor": { "k": 1 } } }
 */
export type ContentBlock = {
  providerMetadata?: JsonValue;
  text: string;
  type: "text";
};

/**
 * Mirrors src-tauri/src/types.rs CorruptedProvider: placeholder for a provider
 * row whose stored columns no longer decode — listed and deletable, never
 * editable. `corrupted` is always true, which tells it from `Provider`.
 * Legal value: { "id": "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001", "corrupted": true }
 */
export interface CorruptedProvider {
  corrupted: true;
  id: string;
}

/**
 * Mirrors src-tauri/src/types.rs CorruptedUnified: placeholder for a unified
 * model whose aggregate no longer decodes; same wire shape as
 * `CorruptedProvider`.
 * Legal value: { "id": "fast", "corrupted": true }
 */
export interface CorruptedUnified {
  corrupted: true;
  id: string;
}

/**
 * Mirrors src-tauri/src/commands/sessions.rs CreatedSessionDto: the atomic
 * first-send result — the new session and its first entry in one commit.
 */
export interface CreatedSession {
  entry: Entry;
  session: Session;
}

/**
 * Mirrors src-tauri/src/commands/providers.rs DefaultModelDto: the single
 * default-model reference, null while none is set.
 */
export interface DefaultModel {
  modelId: string;
  providerId: string;
}

/**
 * Mirrors src-tauri/src/commands/sessions.rs EntryDto: a message tree node.
 * `parentId` is null for roots and immutable after write; `role` comes from the
 * stored payload; `type` is "message" in M1.
 */
export interface Entry {
  content: ContentBlock[];
  createdAt: string;
  id: string;
  parentId: null | string;
  role: MessageRole;
  type: "message";
}

/**
 * Mirrors src-tauri/src/types.rs InputModality: a model input modality.
 * Legal values: "image" | "text"
 */
export type InputModality = "image" | "text";

/**
 * serde_json::Value equivalent: provider-owned JSON that crosses the boundary
 * verbatim. `providerMetadata` accepts any JSON value; null decodes as absent.
 */
export type JsonValue =
  boolean | JsonValue[] | null | number | string | { [key: string]: JsonValue };

/**
 * Mirrors src-tauri/src/types.rs MaxTokensField: which request field carries
 * the output-token cap.
 * Legal values: "max_completion_tokens" | "max_tokens"
 */
export type MaxTokensField = "max_completion_tokens" | "max_tokens";

/**
 * Mirrors src-tauri/src/types.rs MessageRole: the persisted role, decoded from
 * the stored payload and never inferred from an entry's type or render branch.
 * Legal values: "assistant" | "user"
 */
export type MessageRole = "assistant" | "user";

/**
 * Mirrors src-tauri/src/types.rs ModelCost: per-million-token USD rates for
 * display and estimation only, never a routing gate. The base rates price
 * off-peak usage; `tiers` and `peak` each replace all four rates once their
 * condition holds.
 */
export interface ModelCost {
  cacheRead: number;
  cacheWrite: number;
  input: number;
  output: number;
  peak?: PeakPricing;
  tiers?: ModelCostTier[];
}

/**
 * Mirrors src-tauri/src/types.rs ModelCostTier: one usage tier replacing the
 * base rates for a whole request once total input tokens exceed the threshold.
 */
export interface ModelCostTier {
  cacheRead: number;
  cacheWrite: number;
  input: number;
  inputTokensAbove: number;
  output: number;
}

/**
 * Mirrors src-tauri/src/types.rs ModelEntry: `id` is the upstream request name;
 * `apis` is the checked protocol set (array order is check order) and `aliases`
 * are the downstream reference names rewritten to `id` on the way out.
 */
export interface ModelEntry {
  aliases?: string[];
  apis?: Protocol[];
  baseUrl?: string;
  compat?: CompatBuckets;
  contextWindow?: number;
  cost?: ModelCost;
  headers?: Record<string, string>;
  id: string;
  input?: InputModality[];
  maxTokens?: number;
  name?: string;
  reasoning: boolean;
  samplingParams?: Record<string, JsonValue>;
  thinkingLevelMap?: ThinkingLevelMap;
}

/**
 * Mirrors src-tauri/src/types.rs OpenaiCompletionsCompat: overrides for the
 * `openai-completions` family. Unset fields keep their lower merge layer, and
 * keys from another family are rejected at save time.
 */
export interface OpenaiCompletionsCompat {
  cacheControlFormat?: "anthropic";
  chatTemplateArgs?: Record<string, ChatTemplateValue>;
  chatTemplateKwargs?: Record<string, ChatTemplateValue>;
  deferredToolsMode?: "kimi";
  maxTokensField?: MaxTokensField;
  openRouterRouting?: Record<string, JsonValue>;
  requiresAssistantAfterToolResult?: boolean;
  requiresReasoningContentOnAssistantMessages?: boolean;
  requiresThinkingAsText?: boolean;
  requiresToolResultName?: boolean;
  sendSessionAffinityHeaders?: boolean;
  sessionAffinityFormat?: SessionAffinityFormat;
  supportsDeveloperRole?: boolean;
  supportsFinishReason?: boolean;
  supportsLongCacheRetention?: boolean;
  supportsOpenAIGrammarTools?: boolean;
  supportsReasoningEffort?: boolean;
  supportsStore?: boolean;
  supportsStrictMode?: boolean;
  supportsThinkingTokenBudget?: boolean;
  supportsUsageInStreaming?: boolean;
  thinkingFormat?: ThinkingFormat;
  thinkingTokenBudgetField?: ThinkingTokenBudgetField;
  vercelGatewayRouting?: Record<string, JsonValue>;
  vllmPriority?: number;
  zaiToolStream?: boolean;
}

/**
 * Mirrors src-tauri/src/types.rs OpenaiResponsesCompat: overrides for the
 * `openai-responses` family. Unset fields keep their lower merge layer, and
 * keys from another family are rejected at save time.
 */
export interface OpenaiResponsesCompat {
  sessionAffinityFormat?: SessionAffinityFormat;
  supportsAdditionalTools?: boolean;
  supportsDeveloperRole?: boolean;
  supportsExplicitPromptCacheMode?: boolean;
  supportsLongCacheRetention?: boolean;
  supportsMaxOutputTokens?: boolean;
  supportsOpenAIGrammarTools?: boolean;
  supportsStrictMode?: boolean;
  supportsToolSearch?: boolean;
}

/**
 * Mirrors src-tauri/src/commands/entries.rs PathPageDto: one window of the
 * active path. `entries` are always ordered oldest-to-newest; each cursor
 * carries the page's boundary entry id and is non-null only when the path
 * continues past that boundary (an empty path returns both null).
 */
export interface PathPage {
  entries: Entry[];
  nextCursor: null | string;
  prevCursor: null | string;
}

/**
 * Mirrors src-tauri/src/types.rs PeakPricing: rates replacing the enclosing
 * cost's base rates inside `windows`.
 */
export interface PeakPricing {
  cacheRead: number;
  cacheWrite: number;
  input: number;
  output: number;
  windows: TimeWindow[];
}

/**
 * Mirrors src-tauri/src/types.rs Protocol: a protocol family name, an open set
 * — unknown names stay representable and are rejected by domain validation at
 * save time. Known families: "anthropic-messages", "openai-completions",
 * "openai-responses".
 */
export type Protocol = string;

/**
 * Mirrors src-tauri/src/commands/providers.rs ProviderDto: the flat provider
 * configuration plus `id`. `api` is the protocol pre-checked for new models;
 * `apiKey` is plaintext on the wire by contract, so masking is the frontend's
 * job; optional keys are omitted when unset, meaning absent = not set.
 */
export interface Provider {
  abortOnDisconnect: boolean;
  api: Protocol;
  apiKey: string;
  baseUrl: string;
  compat?: CompatBuckets;
  enabled: boolean;
  headers?: Record<string, string>;
  id: string;
  maxRetries: number;
  models?: ModelEntry[];
  name: string;
  reasoningOutput: ReasoningOutputMode;
  requestTimeoutMs: number;
  streamIdleTimeoutMs: number;
}

/**
 * Mirrors src-tauri/src/commands/providers.rs ProviderDraft: the create/update
 * submission shape, the provider configuration with no `id` of its own. A
 * submitted draft replaces the stored row wholesale.
 */
export type ProviderDraft = Omit<Provider, "id">;

/**
 * Mirrors src-tauri/src/commands/providers.rs ProviderListItemDto: one element
 * of the provider list, a decoded provider or its corrupted-row placeholder.
 * Legal value: { "id": "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001", "corrupted": true }
 */
export type ProviderListItem = CorruptedProvider | Provider;

/**
 * Mirrors src-tauri/src/commands/providers.rs ProviderPresetDto: the full
 * prefill of a new provider except the key, which no preset carries. `compat`
 * holds the vendor's explicit specialisations, not merged defaults.
 */
export interface ProviderPreset {
  api: Protocol;
  baseUrl: string;
  compat: CompatBuckets;
  headers: Record<string, string>;
  models: ModelEntry[];
  name: string;
  presetId: string;
}

/**
 * Mirrors src-tauri/src/commands/providers.rs ProvidersDto: every stored
 * provider in creation order plus the default-model reference, null while none
 * is set.
 */
export interface Providers {
  defaultModel: DefaultModel | null;
  providers: ProviderListItem[];
}

/**
 * Mirrors src-tauri/src/types.rs ReasoningOutputMode: `auto` follows vendor
 * detection, `always` replays reasoning content, `off` drops it.
 * Legal values: "always" | "auto" | "off"
 */
export type ReasoningOutputMode = "always" | "auto" | "off";

/**
 * Mirrors src-tauri/src/provider/config.rs ResolvedCompat: the merged effective
 * compat of one protocol with the layer that supplied each field. `sources`
 * covers exactly the keys of `values`; an empty nested object counts as unset
 * and is dropped.
 */
export interface ResolvedCompat {
  sources: Record<string, CompatSource>;
  values: Record<string, JsonValue>;
}

/**
 * Mirrors src-tauri/src/commands/sessions.rs SessionDto. RFC 3339 UTC
 * timestamps with fixed millisecond precision.
 */
export interface Session {
  createdAt: string;
  id: string;
  pinned: boolean;
  title: string;
  updatedAt: string;
}

/**
 * Mirrors src-tauri/src/types.rs SessionAffinityFormat: which affinity headers
 * identify a session.
 * Legal values: "openai" | "openai-nosession" | "openrouter"
 */
export type SessionAffinityFormat =
  "openai" | "openai-nosession" | "openrouter";

/**
 * Mirrors src-tauri/src/commands/sessions.rs SessionCursorDto: keyset cursor
 * over (updatedAt, id). Opaque to the frontend except that it is echoed back
 * to list_sessions unchanged.
 */
export interface SessionCursor {
  id: string;
  updatedAt: string;
}

/**
 * Mirrors src-tauri/src/commands/sessions.rs SessionPageDto: one keyset page
 * ordered newest-to-oldest; `nextCursor` is null on the last page.
 */
export interface SessionPage {
  nextCursor: null | SessionCursor;
  sessions: Session[];
}

/**
 * Mirrors src-tauri/src/types.rs ThinkingFormat: the thinking/reasoning wire
 * shape a provider uses.
 * Legal value: "deepseek"
 */
export type ThinkingFormat =
  | "ant-ling"
  | "baseten"
  | "chat-template"
  | "deepseek"
  | "openai"
  | "openrouter"
  | "qwen"
  | "qwen-chat-template"
  | "string-thinking"
  | "together"
  | "zai";

/**
 * Mirrors src-tauri/src/types.rs ThinkingLevel: one key of `thinkingLevelMap`.
 * Legal values: "high" | "low" | "max" | "medium" | "minimal" | "off" | "xhigh"
 */
export type ThinkingLevel =
  "high" | "low" | "max" | "medium" | "minimal" | "off" | "xhigh";

/**
 * Mirrors src-tauri/src/types.rs ThinkingLevelMap: a string is the value sent
 * upstream, an explicit null disables the level, and an absent key falls back
 * to the family default (`xhigh`/`max` are opt-in).
 * Legal value: { "off": null, "high": "high" }
 */
export type ThinkingLevelMap = Partial<Record<ThinkingLevel, null | string>>;

/**
 * Mirrors src-tauri/src/types.rs ThinkingTokenBudgetField: which request field
 * carries a token budget.
 * Legal values: "thinking_budget" | "thinking_budget_tokens" | "thinking_token_budget"
 */
export type ThinkingTokenBudgetField =
  "thinking_budget" | "thinking_budget_tokens" | "thinking_token_budget";

/**
 * Mirrors src-tauri/src/types.rs TimeWindow: one daily pricing window in UTC;
 * `end` before `start` crosses midnight, and an empty `days` list means every
 * day.
 * Legal value: { "days": ["mon", "tue"], "start": "01:00", "end": "04:00" }
 */
export interface TimeWindow {
  days?: Weekday[];
  end: string;
  start: string;
}

/**
 * Mirrors src-tauri/src/types.rs UnifiedMember: one aggregate member, a model
 * entry pinned by provider id and model id.
 */
export interface UnifiedMember {
  model: string;
  providerId: string;
}

/**
 * Mirrors src-tauri/src/types.rs UnifiedModel: a cross-provider aggregate name;
 * members are in attempt order and `hide` suppresses the member models as
 * standalone entries.
 */
export interface UnifiedModel {
  hide: boolean;
  id: string;
  members?: UnifiedMember[];
}

/**
 * Mirrors src-tauri/src/commands/providers.rs UnifiedModelDraft: the write
 * shape of a unified model; `id` is the visible name, so a draft whose id
 * differs from the update path parameter is a rename.
 */
export type UnifiedModelDraft = UnifiedModel;

/**
 * Mirrors src-tauri/src/commands/providers.rs UnifiedModelListItemDto: one
 * element of the unified-model list, a decoded aggregate or its corrupted-row
 * placeholder.
 * Legal value: { "id": "fast", "corrupted": true }
 */
export type UnifiedModelListItem = CorruptedUnified | UnifiedModel;

/**
 * Mirrors src-tauri/src/types.rs Weekday: a pricing-window day.
 * Legal values: "fri" | "mon" | "sat" | "sun" | "thu" | "tue" | "wed"
 */
export type Weekday = "fri" | "mon" | "sat" | "sun" | "thu" | "tue" | "wed";
