import { describe, expect, it } from "vitest";

import type {
  AnthropicFallbackModel,
  AnthropicMessagesCompat,
  AppError,
  ChatTemplateValue,
  ChatTemplateVariable,
  CompatBuckets,
  CompatSource,
  ContentBlock,
  CorruptedProvider,
  CorruptedUnified,
  CreatedSession,
  DefaultModel,
  Entry,
  InputModality,
  MaxTokensField,
  MessageRole,
  ModelCost,
  ModelCostTier,
  ModelEntry,
  OpenaiCompletionsCompat,
  OpenaiResponsesCompat,
  PathPage,
  PeakPricing,
  Protocol,
  Provider,
  ProviderListItem,
  ProviderPreset,
  Providers,
  ReasoningOutputMode,
  ResolvedCompat,
  Session,
  SessionAffinityFormat,
  SessionPage,
  ThinkingFormat,
  ThinkingLevel,
  ThinkingLevelMap,
  ThinkingTokenBudgetField,
  TimeWindow,
  UnifiedMember,
  UnifiedModel,
  UnifiedModelDraft,
  UnifiedModelListItem,
  Weekday,
} from "./ipc";

// The provider fixtures are the exact JSON literals of the Rust round-trip
// tests (src-tauri/src/types.rs) plus the DeepSeek preset from
// src-tauri/src/provider/vendors.rs; the paired TS literals must stay equal to
// that serde output field for field.

const ANTHROPIC_COMPAT_FIXTURE = `{
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
}`;

const COMPLETIONS_COMPAT_FIXTURE = `{
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
}`;

const PRESET_FIXTURE = `{
  "presetId": "deepseek",
  "name": "DeepSeek",
  "api": "openai-completions",
  "baseUrl": "https://api.deepseek.com",
  "headers": {},
  "compat": {
    "openai-completions": {
      "supportsStore": false,
      "supportsDeveloperRole": false,
      "maxTokensField": "max_tokens",
      "requiresReasoningContentOnAssistantMessages": true,
      "thinkingFormat": "deepseek"
    }
  },
  "models": [
    {
      "id": "deepseek-flash",
      "name": "DeepSeek Flash",
      "apis": ["openai-completions"],
      "aliases": ["flash"],
      "reasoning": true,
      "input": ["text"],
      "cost": {
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
            { "days": ["mon", "tue", "wed", "thu", "fri"], "start": "06:00", "end": "10:00" }
          ]
        }
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    }
  ]
}`;

const PROVIDER_FIXTURE = `{
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
      "aliases": ["gpt", "gpt5"],
      "baseUrl": "https://openrouter.ai/api/v1/gpt",
      "reasoning": true,
      "thinkingLevelMap": { "off": null, "minimal": "minimal", "high": "high", "max": "max" },
      "input": ["text", "image"],
      "cost": {
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
      },
      "contextWindow": 400000,
      "maxTokens": 128000,
      "samplingParams": { "temperature": 0.7, "topP": 0.9 },
      "headers": { "x-model-tier": "beta" },
      "compat": { "openai-responses": { "supportsToolSearch": true } }
    }
  ]
}`;

const RESPONSES_COMPAT_FIXTURE = `{
  "supportsDeveloperRole": true,
  "sessionAffinityFormat": "openrouter",
  "supportsLongCacheRetention": true,
  "supportsStrictMode": true,
  "supportsOpenAIGrammarTools": true,
  "supportsAdditionalTools": true,
  "supportsToolSearch": true,
  "supportsExplicitPromptCacheMode": true,
  "supportsMaxOutputTokens": true
}`;

// The fixed JSON below is the design §3.2 protocol sample, the same fixture the
// Rust side decodes in src-tauri/src/types.rs tests; field names here must
// match that serde output exactly (AC-10).

const TEXT_BLOCK_WITH_METADATA =
  '{ "type": "text", "text": "hello", "providerMetadata": { "vendor": { "opaque": "value" } } }';
const TEXT_BLOCK_WITHOUT_METADATA = '{ "type": "text", "text": "hi" }';

const UNIFIED_FIXTURE =
  '{ "id": "fast", "hide": false, "members": [ { "providerId": "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001", "model": "deepseek-flash" }, { "providerId": "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001", "model": "deepseek-v4-pro" } ] }';

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("fixture is not an object");
  }
  return (value as Record<string, unknown>)[key];
}

function providerFixture(): Provider {
  const weekdays: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
  const windows: TimeWindow[] = [
    { days: weekdays, end: "04:00", start: "01:00" },
    { end: "00:30", start: "23:30" },
  ];
  const peak: PeakPricing = {
    cacheRead: 0.2,
    cacheWrite: 2.4,
    input: 2.0,
    output: 16.0,
    windows,
  };
  const tier: ModelCostTier = {
    cacheRead: 0.25,
    cacheWrite: 3.0,
    input: 2.5,
    inputTokensAbove: 200000,
    output: 20.0,
  };
  const cost: ModelCost = {
    cacheRead: 0.125,
    cacheWrite: 1.5,
    input: 1.25,
    output: 10.0,
    peak,
    tiers: [tier],
  };
  const levelMap: ThinkingLevelMap = {
    high: "high",
    max: "max",
    minimal: "minimal",
    off: null,
  };
  const input: InputModality[] = ["text", "image"];
  const compat: CompatBuckets = {
    "anthropic-messages": { supportsTemperature: false },
    "openai-completions": { maxTokensField: "max_tokens" },
  };
  const model: ModelEntry = {
    aliases: ["gpt", "gpt5"],
    apis: ["openai-responses", "openai-completions"],
    baseUrl: "https://openrouter.ai/api/v1/gpt",
    compat: { "openai-responses": { supportsToolSearch: true } },
    contextWindow: 400000,
    cost,
    headers: { "x-model-tier": "beta" },
    id: "openai/gpt-5.2",
    input,
    maxTokens: 128000,
    name: "GPT-5.2",
    reasoning: true,
    samplingParams: { temperature: 0.7, topP: 0.9 },
    thinkingLevelMap: levelMap,
  };
  return {
    abortOnDisconnect: false,
    api: "openai-completions",
    apiKey: "sk-or-live-secret",
    baseUrl: "https://openrouter.ai/api/v1",
    compat,
    enabled: true,
    headers: { "HTTP-Referer": "https://nostra.example" },
    id: "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
    maxRetries: 4,
    models: [model],
    name: "OpenRouter",
    reasoningOutput: "always",
    requestTimeoutMs: 45000,
    streamIdleTimeoutMs: 90000,
  };
}

describe("ContentBlock JSON contract", () => {
  it("keeps the kebab-case tag and the camelCase metadata field name", () => {
    const block: ContentBlock = {
      providerMetadata: { vendor: { opaque: "value" } },
      text: "hello",
      type: "text",
    };
    const parsed: unknown = JSON.parse(TEXT_BLOCK_WITH_METADATA);
    expect(field(parsed, "type")).toBe("text");
    expect(field(parsed, "text")).toBe("hello");
    expect(field(parsed, "providerMetadata")).toEqual({
      vendor: { opaque: "value" },
    });
    expect(field(parsed, "provider_metadata")).toBeUndefined();
    expect(JSON.parse(JSON.stringify(block))).toEqual(parsed);
  });

  it("omits providerMetadata when absent, never null", () => {
    const parsed: unknown = JSON.parse(TEXT_BLOCK_WITHOUT_METADATA);
    expect(field(parsed, "providerMetadata")).toBeUndefined();
    expect(field(parsed, "provider_metadata")).toBeUndefined();
  });
});

describe("MessageRole values", () => {
  it("accepts exactly the persisted role strings", () => {
    const roles: MessageRole[] = ["assistant", "user"];
    expect(roles).toEqual(["assistant", "user"]);
  });
});

describe("Entry mirror", () => {
  it("fits a fully populated node with non-null parent and metadata", () => {
    const entry: Entry = {
      content: [
        {
          providerMetadata: { vendor: { opaque: "value" } },
          text: "hello",
          type: "text",
        },
      ],
      createdAt: "2026-09-09T00:00:00.000Z",
      id: "e1",
      parentId: "e0",
      role: "user",
      type: "message",
    };
    expect(entry.parentId).toBe("e0");
    expect(entry.role).toBe("user");
    expect(entry.content).toHaveLength(1);
  });

  it("keeps a root's parentId null and ordered multiple blocks", () => {
    const entry: Entry = {
      content: [
        { text: "first", type: "text" },
        { text: "second", type: "text" },
      ],
      createdAt: "2026-09-09T00:00:00.000Z",
      id: "root",
      parentId: null,
      role: "assistant",
      type: "message",
    };
    expect(entry.parentId).toBeNull();
    expect(entry.content.map((block) => block.text)).toEqual([
      "first",
      "second",
    ]);
  });
});

describe("session and page mirrors", () => {
  it("fits an atomic create result", () => {
    const created: CreatedSession = {
      entry: {
        content: [{ text: "hello", type: "text" }],
        createdAt: "2026-09-09T00:00:00.000Z",
        id: "e1",
        parentId: null,
        role: "user",
        type: "message",
      },
      session: {
        createdAt: "2026-09-09T00:00:00.000Z",
        id: "s1",
        pinned: false,
        title: "hello",
        updatedAt: "2026-09-09T00:00:00.000Z",
      },
    };
    expect(created.session.id).toBe("s1");
    expect(created.entry.id).toBe("e1");
  });

  it("fits session and path pages with explicit null cursors", () => {
    const session: Session = {
      createdAt: "2026-09-09T00:00:00.000Z",
      id: "s1",
      pinned: false,
      title: "hello",
      updatedAt: "2026-09-09T00:00:00.000Z",
    };
    const page: SessionPage = {
      nextCursor: { id: "s0", updatedAt: "2026-09-09T00:00:00.000Z" },
      sessions: [session],
    };
    const path: PathPage = { entries: [], nextCursor: null, prevCursor: null };
    expect(page.nextCursor?.id).toBe("s0");
    expect(path.nextCursor).toBeNull();
    expect(path.prevCursor).toBeNull();
  });
});

describe("AppError mirror", () => {
  it("fits every serialized error code with camelCase fields", () => {
    const codes = [
      "config",
      "db",
      "internal",
      "invalid_input",
      "network",
      "not_found",
      "protocol",
    ] as const;
    for (const code of codes) {
      const error: AppError = { code, message: "diagnostics" };
      expect(error.message).toBe("diagnostics");
    }
  });
});

describe("provider document mirror", () => {
  it("fits the full round-trip fixture field for field", () => {
    const provider = providerFixture();
    const parsed: unknown = JSON.parse(PROVIDER_FIXTURE);
    expect(JSON.parse(JSON.stringify(provider))).toEqual(parsed);
    // Spot-check the camelCase renames the fixture pins down.
    expect(field(parsed, "baseUrl")).toBe("https://openrouter.ai/api/v1");
    expect(field(parsed, "base_url")).toBeUndefined();
    expect(field(parsed, "requestTimeoutMs")).toBe(45000);
    expect(field(parsed, "request_timeout_ms")).toBeUndefined();
    expect(field(field(parsed, "compat"), "openai-completions")).toEqual({
      maxTokensField: "max_tokens",
    });
    expect(provider.models?.[0]?.thinkingLevelMap?.off).toBeNull();
    expect(provider.apiKey).toBe("sk-or-live-secret");
  });

  it("keeps unset optional keys absent instead of null", () => {
    const provider: Provider = {
      abortOnDisconnect: true,
      api: "openai-completions",
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      enabled: true,
      id: "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0002",
      maxRetries: 2,
      name: "Ollama",
      reasoningOutput: "auto",
      requestTimeoutMs: 120000,
      streamIdleTimeoutMs: 120000,
    };
    const wire: unknown = JSON.parse(JSON.stringify(provider));
    expect(field(wire, "headers")).toBeUndefined();
    expect(field(wire, "compat")).toBeUndefined();
    expect(field(wire, "models")).toBeUndefined();
  });
});

describe("compat family mirrors", () => {
  it("fits the openai-completions fixture including $var references", () => {
    const budget: ChatTemplateValue = {
      $var: "thinking.budget",
      omitWhenOff: true,
    };
    const effort: ChatTemplateValue = { $var: "thinking.effort" };
    const completions: OpenaiCompletionsCompat = {
      cacheControlFormat: "anthropic",
      chatTemplateArgs: { reasoning_effort: effort },
      chatTemplateKwargs: { enable_thinking: true, thinking_budget: budget },
      deferredToolsMode: "kimi",
      maxTokensField: "max_completion_tokens",
      openRouterRouting: { allow_fallbacks: false, only: ["anthropic"] },
      requiresAssistantAfterToolResult: true,
      requiresReasoningContentOnAssistantMessages: true,
      requiresThinkingAsText: true,
      requiresToolResultName: true,
      sendSessionAffinityHeaders: true,
      sessionAffinityFormat: "openai-nosession",
      supportsDeveloperRole: true,
      supportsFinishReason: true,
      supportsLongCacheRetention: true,
      supportsOpenAIGrammarTools: true,
      supportsReasoningEffort: true,
      supportsStore: true,
      supportsStrictMode: true,
      supportsThinkingTokenBudget: true,
      supportsUsageInStreaming: true,
      thinkingFormat: "ant-ling",
      thinkingTokenBudgetField: "thinking_budget_tokens",
      vercelGatewayRouting: { order: ["anthropic", "openai"] },
      vllmPriority: 10.0,
      zaiToolStream: true,
    };
    const parsed: unknown = JSON.parse(COMPLETIONS_COMPAT_FIXTURE);
    expect(JSON.parse(JSON.stringify(completions))).toEqual(parsed);
  });

  it("fits the openai-responses and anthropic-messages fixtures", () => {
    const fallback: AnthropicFallbackModel = {
      cost: { cacheRead: 1.5, cacheWrite: 18.75, input: 15.0, output: 75.0 },
      model: "claude-opus-4-1",
      provider: "anthropic",
    };
    const messages: AnthropicMessagesCompat = {
      allowedFallbackModels: [fallback],
      allowEmptySignature: true,
      forceAdaptiveThinking: true,
      sendSessionAffinityHeaders: true,
      supportsCacheControlOnTools: true,
      supportsEagerToolInputStreaming: true,
      supportsLongCacheRetention: true,
      supportsMidConvoEffort: true,
      supportsStrictTools: true,
      supportsTemperature: true,
      supportsToolReferences: true,
    };
    const responses: OpenaiResponsesCompat = {
      sessionAffinityFormat: "openrouter",
      supportsAdditionalTools: true,
      supportsDeveloperRole: true,
      supportsExplicitPromptCacheMode: true,
      supportsLongCacheRetention: true,
      supportsMaxOutputTokens: true,
      supportsOpenAIGrammarTools: true,
      supportsStrictMode: true,
      supportsToolSearch: true,
    };
    const parsedResponses: unknown = JSON.parse(RESPONSES_COMPAT_FIXTURE);
    const parsedMessages: unknown = JSON.parse(ANTHROPIC_COMPAT_FIXTURE);
    expect(JSON.parse(JSON.stringify(responses))).toEqual(parsedResponses);
    expect(JSON.parse(JSON.stringify(messages))).toEqual(parsedMessages);
  });

  it("accepts exactly the serde literals of every value domain", () => {
    const affinityFormats: SessionAffinityFormat[] = [
      "openai",
      "openai-nosession",
      "openrouter",
    ];
    const budgetFields: ThinkingTokenBudgetField[] = [
      "thinking_budget",
      "thinking_budget_tokens",
      "thinking_token_budget",
    ];
    const maxTokensFields: MaxTokensField[] = [
      "max_completion_tokens",
      "max_tokens",
    ];
    const modalities: InputModality[] = ["image", "text"];
    const outputModes: ReasoningOutputMode[] = ["always", "auto", "off"];
    const protocolFamilies: Protocol[] = [
      "anthropic-messages",
      "openai-completions",
      "openai-responses",
    ];
    const sources: CompatSource[] = [
      "familyDefault",
      "model",
      "provider",
      "vendor",
    ];
    const templateVariables: ChatTemplateVariable[] = [
      "thinking.budget",
      "thinking.effort",
      "thinking.enabled",
    ];
    const thinkingFormats: ThinkingFormat[] = [
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
    ];
    const thinkingLevels: ThinkingLevel[] = [
      "high",
      "low",
      "max",
      "medium",
      "minimal",
      "off",
      "xhigh",
    ];
    const weekdays: Weekday[] = [
      "fri",
      "mon",
      "sat",
      "sun",
      "thu",
      "tue",
      "wed",
    ];
    const domains = [
      affinityFormats,
      budgetFields,
      maxTokensFields,
      modalities,
      outputModes,
      protocolFamilies,
      sources,
      templateVariables,
      thinkingFormats,
      thinkingLevels,
      weekdays,
    ];
    for (const domain of domains) {
      expect(new Set(domain).size).toBe(domain.length);
    }
  });
});

describe("degraded rows and list payloads", () => {
  it("tags both placeholder kinds with corrupted true", () => {
    const corrupted: CorruptedProvider = {
      corrupted: true,
      id: "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0009",
    };
    const corruptedUnified: CorruptedUnified = { corrupted: true, id: "fast" };
    const parsed: unknown = JSON.parse(
      '{ "id": "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0009", "corrupted": true }',
    );
    expect(corrupted).toEqual(parsed);
    expect(field(parsed, "corrupted")).toBe(true);
    expect(JSON.parse(JSON.stringify(corruptedUnified))).toEqual({
      corrupted: true,
      id: "fast",
    });

    const items: ProviderListItem[] = [corrupted, providerFixture()];
    const unifiedItems: UnifiedModelListItem[] = [corruptedUnified];
    expect(items).toHaveLength(2);
    expect(unifiedItems).toHaveLength(1);
  });

  it("pairs the provider list with an explicit null default model", () => {
    const defaultModel: DefaultModel = {
      modelId: "deepseek-flash",
      providerId: "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
    };
    const payload: Providers = { defaultModel, providers: [providerFixture()] };
    const cleared: Providers = { defaultModel: null, providers: [] };
    expect(payload.defaultModel?.modelId).toBe("deepseek-flash");
    expect(cleared.defaultModel).toBeNull();
    const parsed: unknown = JSON.parse(
      '{ "providers": [], "defaultModel": null }',
    );
    expect(JSON.parse(JSON.stringify(cleared))).toEqual(parsed);
  });
});

describe("resolved compat mirror", () => {
  it("carries merged values with one source per field", () => {
    const resolved: ResolvedCompat = {
      sources: {
        maxTokensField: "model",
        requiresToolResultName: "provider",
        supportsReasoningEffort: "familyDefault",
        supportsStore: "provider",
        thinkingFormat: "vendor",
      },
      values: {
        maxTokensField: "max_completion_tokens",
        requiresToolResultName: true,
        supportsReasoningEffort: true,
        supportsStore: true,
        thinkingFormat: "deepseek",
      },
    };
    expect(Object.keys(resolved.sources).sort()).toEqual(
      Object.keys(resolved.values).sort(),
    );
    expect(resolved.sources.thinkingFormat).toBe("vendor");
    expect(resolved.values.thinkingFormat).toBe("deepseek");
  });
});

describe("preset and unified model mirrors", () => {
  it("fits the deepseek preset prefill from the vendor catalog", () => {
    const preset: ProviderPreset = {
      api: "openai-completions",
      baseUrl: "https://api.deepseek.com",
      compat: {
        "openai-completions": {
          maxTokensField: "max_tokens",
          requiresReasoningContentOnAssistantMessages: true,
          supportsDeveloperRole: false,
          supportsStore: false,
          thinkingFormat: "deepseek",
        },
      },
      headers: {},
      models: [
        {
          aliases: ["flash"],
          apis: ["openai-completions"],
          contextWindow: 1000000,
          cost: {
            cacheRead: 0.003,
            cacheWrite: 0.0,
            input: 0.15,
            output: 0.6,
            peak: {
              cacheRead: 0.006,
              cacheWrite: 0.0,
              input: 0.3,
              output: 1.2,
              windows: [
                {
                  days: ["mon", "tue", "wed", "thu", "fri"],
                  end: "04:00",
                  start: "01:00",
                },
                {
                  days: ["mon", "tue", "wed", "thu", "fri"],
                  end: "10:00",
                  start: "06:00",
                },
              ],
            },
          },
          id: "deepseek-flash",
          input: ["text"],
          maxTokens: 384000,
          name: "DeepSeek Flash",
          reasoning: true,
        },
      ],
      name: "DeepSeek",
      presetId: "deepseek",
    };
    const parsed: unknown = JSON.parse(PRESET_FIXTURE);
    expect(JSON.parse(JSON.stringify(preset))).toEqual(parsed);
    expect(field(parsed, "presetId")).toBe("deepseek");
  });

  it("keeps member order in the unified model and its draft alias", () => {
    const members: UnifiedMember[] = [
      {
        model: "deepseek-flash",
        providerId: "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
      },
      {
        model: "deepseek-v4-pro",
        providerId: "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
      },
    ];
    const unified: UnifiedModel = { hide: false, id: "fast", members };
    const draft: UnifiedModelDraft = unified;
    const parsed: unknown = JSON.parse(UNIFIED_FIXTURE);
    expect(JSON.parse(JSON.stringify(draft))).toEqual(parsed);
    expect(draft.members?.map((member) => member.model)).toEqual([
      "deepseek-flash",
      "deepseek-v4-pro",
    ]);
  });
});
