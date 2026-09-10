import { z } from "zod";

import { jsonValueSchema } from "./json";
import { modelCostSchema } from "./model-cost";

// Compat overrides per protocol family, mirroring the Rust structs
// (src-tauri/src/types.rs): every field is optional, an explicit null means
// unset, and unknown keys are rejected so a misspelled field is never silently
// dropped. Buckets are decoded with the same per-family contract in
// src-tauri/src/provider/config.rs validate_compat_bucket.

/** Protocol family names with a compat struct; the wire type stays open. */
export const protocolFamilySchema = z.enum([
  "anthropic-messages",
  "openai-completions",
  "openai-responses",
]);

const KNOWN_FAMILIES = new Set<string>(protocolFamilySchema.options);

/** True when `protocol` names one of the three compat families. */
export function isKnownProtocolFamily(protocol: string): boolean {
  return KNOWN_FAMILIES.has(protocol);
}

const maxTokensFieldSchema = z.enum(["max_completion_tokens", "max_tokens"]);

const sessionAffinityFormatSchema = z.enum([
  "openai",
  "openai-nosession",
  "openrouter",
]);

const thinkingFormatSchema = z.enum([
  "ant-ling",
  "baseten",
  "chat-template",
  "deepseek",
  "openai",
  "openrouter",
  "qwen",
  "qwen-chat-template",
  "string-thinking",
  "together",
  "zai",
]);

const thinkingTokenBudgetFieldSchema = z.enum([
  "thinking_budget",
  "thinking_budget_tokens",
  "thinking_token_budget",
]);

// `chatTemplateKwargs`/`chatTemplateArgs` values pass through verbatim: the
// Rust type is an untagged enum whose scalar arm accepts any JSON value, so a
// malformed `$var` object is stored as-is rather than rejected.
const chatTemplateValueSchema = jsonValueSchema;

const anthropicFallbackModelSchema = z.object({
  cost: modelCostSchema,
  model: z.string(),
  provider: z.string(),
});

/**
 * OpenAI chat-completions overrides; an unset field keeps the lower merge
 * layer. `thinkingFormat` covers every wire shape a provider family uses,
 * including the `chat-template` variants.
 */
export const openaiCompletionsCompatSchema = z.strictObject({
  cacheControlFormat: z.literal("anthropic").nullish(),
  chatTemplateArgs: z.record(z.string(), chatTemplateValueSchema).nullish(),
  chatTemplateKwargs: z.record(z.string(), chatTemplateValueSchema).nullish(),
  deferredToolsMode: z.literal("kimi").nullish(),
  maxTokensField: maxTokensFieldSchema.nullish(),
  openRouterRouting: z.record(z.string(), jsonValueSchema).nullish(),
  requiresAssistantAfterToolResult: z.boolean().nullish(),
  requiresReasoningContentOnAssistantMessages: z.boolean().nullish(),
  requiresThinkingAsText: z.boolean().nullish(),
  requiresToolResultName: z.boolean().nullish(),
  sendSessionAffinityHeaders: z.boolean().nullish(),
  sessionAffinityFormat: sessionAffinityFormatSchema.nullish(),
  supportsDeveloperRole: z.boolean().nullish(),
  supportsFinishReason: z.boolean().nullish(),
  supportsLongCacheRetention: z.boolean().nullish(),
  supportsOpenAIGrammarTools: z.boolean().nullish(),
  supportsReasoningEffort: z.boolean().nullish(),
  supportsStore: z.boolean().nullish(),
  supportsStrictMode: z.boolean().nullish(),
  supportsThinkingTokenBudget: z.boolean().nullish(),
  supportsUsageInStreaming: z.boolean().nullish(),
  thinkingFormat: thinkingFormatSchema.nullish(),
  thinkingTokenBudgetField: thinkingTokenBudgetFieldSchema.nullish(),
  vercelGatewayRouting: z.record(z.string(), jsonValueSchema).nullish(),
  vllmPriority: z.number().nullish(),
  zaiToolStream: z.boolean().nullish(),
});

/** OpenAI responses overrides; an unset field keeps the lower merge layer. */
export const openaiResponsesCompatSchema = z.strictObject({
  sessionAffinityFormat: sessionAffinityFormatSchema.nullish(),
  supportsAdditionalTools: z.boolean().nullish(),
  supportsDeveloperRole: z.boolean().nullish(),
  supportsExplicitPromptCacheMode: z.boolean().nullish(),
  supportsLongCacheRetention: z.boolean().nullish(),
  supportsMaxOutputTokens: z.boolean().nullish(),
  supportsOpenAIGrammarTools: z.boolean().nullish(),
  supportsStrictMode: z.boolean().nullish(),
  supportsToolSearch: z.boolean().nullish(),
});

/** Anthropic messages overrides; an unset field keeps the lower merge layer. */
export const anthropicMessagesCompatSchema = z.strictObject({
  allowedFallbackModels: z.array(anthropicFallbackModelSchema).nullish(),
  allowEmptySignature: z.boolean().nullish(),
  forceAdaptiveThinking: z.boolean().nullish(),
  sendSessionAffinityHeaders: z.boolean().nullish(),
  supportsCacheControlOnTools: z.boolean().nullish(),
  supportsEagerToolInputStreaming: z.boolean().nullish(),
  supportsLongCacheRetention: z.boolean().nullish(),
  supportsMidConvoEffort: z.boolean().nullish(),
  supportsStrictTools: z.boolean().nullish(),
  supportsTemperature: z.boolean().nullish(),
  supportsToolReferences: z.boolean().nullish(),
});

/**
 * Keyed compat overrides: one flat object per protocol family. An unknown
 * family name or a fragment carrying another family's fields is rejected, like
 * the Rust bucket decode; an absent key means the family has no bucket, and a
 * null bucket value is rejected on both sides.
 */
export const compatBucketsSchema = z.strictObject({
  "anthropic-messages": anthropicMessagesCompatSchema.optional(),
  "openai-completions": openaiCompletionsCompatSchema.optional(),
  "openai-responses": openaiResponsesCompatSchema.optional(),
});
