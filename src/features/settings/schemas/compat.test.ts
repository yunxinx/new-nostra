import { describe, expect, it } from "vitest";

import {
  anthropicMessagesCompatSchema,
  compatBucketsSchema,
  isKnownProtocolFamily,
  openaiCompletionsCompatSchema,
  openaiResponsesCompatSchema,
  protocolFamilySchema,
} from "./compat";

describe("protocolFamilySchema", () => {
  it("covers exactly the three families with a compat struct", () => {
    expect(protocolFamilySchema.options).toEqual([
      "anthropic-messages",
      "openai-completions",
      "openai-responses",
    ]);
    expect(isKnownProtocolFamily("openai-completions")).toBe(true);
    expect(isKnownProtocolFamily("gemini")).toBe(false);
  });
});

describe("openaiCompletionsCompatSchema", () => {
  it("accepts every override field, including nulls read as unset", () => {
    expect(
      openaiCompletionsCompatSchema.safeParse({
        cacheControlFormat: "anthropic",
        chatTemplateArgs: { budget: { $var: "thinking.budget" } },
        chatTemplateKwargs: {
          enable_thinking: true,
          // A malformed `$var` object is kept verbatim: the Rust wire type is an
          // untagged enum whose scalar arm accepts any JSON value.
          malformed: { $var: "thinking.nope", extra: 1 },
          nested: [1, "two", null],
        },
        deferredToolsMode: "kimi",
        maxTokensField: "max_tokens",
        openRouterRouting: { order: ["anthropic"] },
        requiresAssistantAfterToolResult: true,
        requiresReasoningContentOnAssistantMessages: true,
        requiresThinkingAsText: true,
        requiresToolResultName: true,
        sendSessionAffinityHeaders: false,
        sessionAffinityFormat: "openai-nosession",
        supportsDeveloperRole: false,
        supportsFinishReason: true,
        supportsLongCacheRetention: true,
        supportsOpenAIGrammarTools: false,
        supportsReasoningEffort: true,
        supportsStore: false,
        supportsStrictMode: true,
        supportsThinkingTokenBudget: true,
        supportsUsageInStreaming: true,
        thinkingFormat: "deepseek",
        thinkingTokenBudgetField: "thinking_budget_tokens",
        vercelGatewayRouting: { only: ["openai"] },
        vllmPriority: 5,
        zaiToolStream: false,
      }).success,
    ).toBe(true);
  });

  it("accepts null field values as unset", () => {
    expect(
      openaiCompletionsCompatSchema.safeParse({
        supportsStore: null,
        thinkingFormat: null,
      }).success,
    ).toBe(true);
  });

  it.each([
    ["a misspelled field", { supportsStoree: true }],
    ["a field of another family", { supportsToolReferences: true }],
    ["an unknown enum value", { thinkingFormat: "gemini" }],
    ["a non-kebab enum value", { sessionAffinityFormat: "openai_nosession" }],
    ["a wrong field type", { supportsStore: "yes" }],
  ])("rejects %s", (_label, fragment) => {
    expect(openaiCompletionsCompatSchema.safeParse(fragment).success).toBe(
      false,
    );
  });
});

describe("openaiResponsesCompatSchema", () => {
  it("accepts its own fragment and rejects completions-only fields", () => {
    expect(
      openaiResponsesCompatSchema.safeParse({
        sessionAffinityFormat: "openrouter",
        supportsAdditionalTools: true,
        supportsDeveloperRole: true,
        supportsExplicitPromptCacheMode: true,
        supportsLongCacheRetention: false,
        supportsMaxOutputTokens: true,
        supportsOpenAIGrammarTools: false,
        supportsStrictMode: false,
        supportsToolSearch: true,
      }).success,
    ).toBe(true);
    expect(
      openaiResponsesCompatSchema.safeParse({ maxTokensField: "max_tokens" })
        .success,
    ).toBe(false);
  });
});

describe("anthropicMessagesCompatSchema", () => {
  it("accepts server-side fallback models with priced costs", () => {
    expect(
      anthropicMessagesCompatSchema.safeParse({
        allowedFallbackModels: [
          {
            cost: { cacheRead: 0.5, cacheWrite: 6.25, input: 5, output: 25 },
            model: "claude-opus-5",
            provider: "anthropic",
          },
        ],
        allowEmptySignature: true,
        forceAdaptiveThinking: false,
        sendSessionAffinityHeaders: true,
        supportsCacheControlOnTools: true,
        supportsEagerToolInputStreaming: false,
        supportsLongCacheRetention: true,
        supportsMidConvoEffort: true,
        supportsStrictTools: false,
        supportsTemperature: true,
        supportsToolReferences: true,
      }).success,
    ).toBe(true);
  });

  it("rejects a fallback model without a cost", () => {
    expect(
      anthropicMessagesCompatSchema.safeParse({
        allowedFallbackModels: [
          { model: "claude-opus-5", provider: "anthropic" },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("compatBucketsSchema", () => {
  it("accepts per-family fragments and an empty bucket", () => {
    expect(
      compatBucketsSchema.safeParse({
        "anthropic-messages": { supportsTemperature: false },
        "openai-completions": { maxTokensField: "max_tokens" },
        "openai-responses": { supportsToolSearch: true },
      }).success,
    ).toBe(true);
    expect(
      compatBucketsSchema.safeParse({ "openai-responses": {} }).success,
    ).toBe(true);
  });

  it.each([
    ["an unknown family", { gemini: { supportsStore: true } }],
    [
      "a fragment of another family",
      { "openai-completions": { supportsToolReferences: true } },
    ],
    ["a null bucket value", { "openai-completions": null }],
  ])("rejects %s", (_label, buckets) => {
    expect(compatBucketsSchema.safeParse(buckets).success).toBe(false);
  });

  it("reads an explicit undefined bucket value as an absent key", () => {
    // A JS form value can carry `undefined` where a stored document carries no
    // key at all; JSON serialization drops it, so both mean "no bucket".
    const parsed = compatBucketsSchema.safeParse({
      "openai-completions": undefined,
    });
    expect(parsed.success).toBe(true);
    expect(
      parsed.success ? parsed.data["openai-completions"] : null,
    ).toBeUndefined();
  });
});
