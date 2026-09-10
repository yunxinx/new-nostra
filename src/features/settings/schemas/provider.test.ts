import { describe, expect, it } from "vitest";

import { modelEntrySchema, providerDraftSchema } from "./provider";

// The accept/reject set mirrors the DB-free half of the Rust validation
// (src-tauri/src/provider/config.rs); the rules that need the stored provider
// set are checked inside the write transaction and have no schema counterpart.

const BASE_DRAFT = {
  api: "openai-completions",
  baseUrl: "https://api.example.com",
  name: "Test Provider",
};

function draftWith(patch: Record<string, unknown>): unknown {
  return { ...BASE_DRAFT, ...patch };
}

function draftWithModel(patch: Record<string, unknown>): unknown {
  return draftWith({ models: [{ id: "m1", ...patch }] });
}

describe("providerDraftSchema", () => {
  it("accepts drafts without keys, models or complete fields", () => {
    expect(providerDraftSchema.safeParse(BASE_DRAFT).success).toBe(true);
    expect(
      providerDraftSchema.safeParse(draftWith({ apiKey: "", models: [] }))
        .success,
    ).toBe(true);
    // A model still being filled in: no protocols, no metadata.
    expect(
      providerDraftSchema.safeParse({
        ...BASE_DRAFT,
        models: [{ id: "draft-model" }],
      }).success,
    ).toBe(true);
    expect(
      providerDraftSchema.safeParse(draftWithModel({ apis: [] })).success,
    ).toBe(true);
  });

  it("ignores unknown keys, like the stored-document contract", () => {
    const parsed = providerDraftSchema.safeParse(draftWith({ extra: 1 }));
    expect(parsed.success).toBe(true);
    expect(parsed.success && "extra" in parsed.data).toBe(false);
  });

  it.each([
    "  https://api.example.com/v1/  ",
    "https://api.example.com",
    "http://localhost:11434/v1",
    "HTTPS://API.example.com/V1",
  ])("accepts the base URL %j", (baseUrl) => {
    expect(providerDraftSchema.safeParse(draftWith({ baseUrl })).success).toBe(
      true,
    );
    expect(modelEntrySchema.safeParse({ baseUrl, id: "m1" }).success).toBe(
      true,
    );
  });

  it.each([
    ["", "blank"],
    ["   ", "blank"],
    ["/", "blank"],
    ["api.example.com/v1", "relative"],
    ["ftp://api.example.com", "non-http scheme"],
    ["https://", "no host"],
    ["https://:8080/v1", "host-less authority"],
    ["https://api example.com/v1", "embedded whitespace"],
    ["https://api.example.com/v1?key=1", "query"],
    ["https://api.example.com/v1#top", "fragment"],
    ["https://api.example.com/v1/chat/completions", "endpoint path"],
    [
      "https://api.example.com/chat/completions/",
      "trailing-slash endpoint path",
    ],
    ["https://api.example.com/responses", "endpoint path"],
    ["https://api.example.com/messages", "endpoint path"],
    ["https://api.example.com/v1/messages", "endpoint path"],
  ])("rejects the base URL %j (%s)", (baseUrl) => {
    expect(providerDraftSchema.safeParse(draftWith({ baseUrl })).success).toBe(
      false,
    );
    expect(modelEntrySchema.safeParse({ baseUrl, id: "m1" }).success).toBe(
      false,
    );
  });

  it("rejects a blank name and an unknown default protocol", () => {
    expect(
      providerDraftSchema.safeParse(draftWith({ name: "   " })).success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(draftWith({ api: "gemini" })).success,
    ).toBe(false);
  });

  it.each([
    ["requestTimeoutMs", 999],
    ["requestTimeoutMs", 600_001],
    ["streamIdleTimeoutMs", 999],
    ["streamIdleTimeoutMs", 600_001],
    ["maxRetries", -1],
    ["maxRetries", 5],
    ["maxRetries", 2.5],
  ])("rejects %s = %d", (field, value) => {
    expect(
      providerDraftSchema.safeParse(draftWith({ [field]: value })).success,
    ).toBe(false);
  });

  it.each([
    ["requestTimeoutMs", 1_000],
    ["requestTimeoutMs", 600_000],
    ["streamIdleTimeoutMs", 1_000],
    ["streamIdleTimeoutMs", 600_000],
    ["maxRetries", 0],
    ["maxRetries", 4],
  ])("accepts the boundary %s = %d", (field, value) => {
    expect(
      providerDraftSchema.safeParse(draftWith({ [field]: value })).success,
    ).toBe(true);
  });

  it("rejects blank or duplicated model identities", () => {
    expect(
      providerDraftSchema.safeParse(draftWithModel({ id: "  " })).success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(
        draftWith({ models: [{ id: "m1" }, { id: "m1" }] }),
      ).success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(
        draftWith({
          models: [
            { id: "m1", name: "Same Name" },
            { id: "m2", name: " Same Name " },
          ],
        }),
      ).success,
    ).toBe(false);
    // A blank display name counts as unset, so it never collides.
    expect(
      providerDraftSchema.safeParse(
        draftWith({
          models: [
            { id: "m1", name: "  " },
            { id: "m2", name: "  " },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects unknown or repeated model protocols", () => {
    expect(
      providerDraftSchema.safeParse(draftWithModel({ apis: ["gemini"] }))
        .success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(
        draftWithModel({ apis: ["openai-completions", "openai-completions"] }),
      ).success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(
        draftWithModel({ apis: ["anthropic-messages", "openai-completions"] }),
      ).success,
    ).toBe(true);
  });

  it("keeps aliases unique and never shadowing a model id", () => {
    // A model id and its consumer-facing alias are different kinds of name.
    expect(
      providerDraftSchema.safeParse(draftWithModel({ aliases: ["m1"] }))
        .success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(
        draftWith({ models: [{ id: "m1" }, { aliases: ["m1"], id: "m2" }] }),
      ).success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(
        draftWith({ models: [{ id: "m1" }, { aliases: [" m1 "], id: "m2" }] }),
      ).success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(
        draftWith({
          models: [
            { aliases: ["shared"], id: "m1" },
            { aliases: [" shared "], id: "m2" },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(
        draftWith({ models: [{ aliases: ["  "], id: "m1" }] }),
      ).success,
    ).toBe(false);
    // Aliases of one provider are independent names: distinct values pass, and
    // an alias may repeat another model's display name.
    expect(
      providerDraftSchema.safeParse(
        draftWith({
          models: [
            {
              aliases: ["short", "shorter"],
              id: "m1",
              name: "Shared Display",
            },
            {
              aliases: ["Shared Display"],
              id: "m2",
              name: "Shared Display Two",
            },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects unknown model shapes and zero limits", () => {
    expect(
      providerDraftSchema.safeParse(draftWithModel({ input: [] })).success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(draftWithModel({ input: ["audio"] }))
        .success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(draftWithModel({ contextWindow: 0 }))
        .success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(
        draftWithModel({ contextWindow: 4_294_967_296 }),
      ).success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(draftWithModel({ maxTokens: 0 })).success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(draftWithModel({ baseUrl: "not-a-url" }))
        .success,
    ).toBe(false);
    expect(
      providerDraftSchema.safeParse(
        draftWithModel({
          thinkingLevelMap: { extreme: "max", high: "high", off: null },
        }),
      ).success,
    ).toBe(false);
    // Unknown model keys are ignored, like unknown keys on the provider.
    expect(
      providerDraftSchema.safeParse(draftWithModel({ extra: 1 })).success,
    ).toBe(true);
  });

  it.each([
    [
      "the provider compat bucket",
      draftWith({
        compat: { "openai-completions": { supportsToolReferences: true } },
      }),
    ],
    [
      "a model compat bucket",
      draftWithModel({
        compat: { "openai-completions": { supportsToolReferences: true } },
      }),
    ],
    [
      "an unknown compat family",
      draftWith({ compat: { gemini: { supportsStore: true } } }),
    ],
    [
      "a null compat bucket",
      draftWith({ compat: { "openai-completions": null } }),
    ],
  ])("rejects a family mismatch in %s", (_label, draft) => {
    expect(providerDraftSchema.safeParse(draft).success).toBe(false);
  });

  it.each([
    ["enabled", null],
    ["apiKey", null],
    ["api", null],
    ["name", null],
    ["baseUrl", null],
    ["headers", null],
    ["maxRetries", null],
    ["requestTimeoutMs", null],
    ["streamIdleTimeoutMs", null],
    ["abortOnDisconnect", null],
    ["reasoningOutput", null],
    ["models", null],
  ])("rejects a null %s, which is not an optional field", (field) => {
    expect(
      providerDraftSchema.safeParse(draftWith({ [field]: null })).success,
    ).toBe(false);
  });

  it.each([
    ["name", null],
    ["baseUrl", null],
    ["cost", null],
    ["contextWindow", null],
    ["maxTokens", null],
    ["headers", null],
    ["samplingParams", null],
    ["thinkingLevelMap", null],
    ["compat", null],
  ])("reads a null %s model field as unset", (field) => {
    expect(
      providerDraftSchema.safeParse(draftWithModel({ [field]: null })).success,
    ).toBe(true);
  });

  it.each([
    ["aliases", null],
    ["apis", null],
    ["reasoning", null],
    ["input", null],
  ])("rejects a null %s model field, which is not optional", (field) => {
    expect(
      providerDraftSchema.safeParse(draftWithModel({ [field]: null })).success,
    ).toBe(false);
  });

  it("reads a null provider compat block as unset", () => {
    expect(
      providerDraftSchema.safeParse(draftWith({ compat: null })).success,
    ).toBe(true);
  });

  it("reports cross-field violations at the offending model field", () => {
    const duplicate = providerDraftSchema.safeParse(
      draftWith({ models: [{ id: "m1" }, { id: "m1" }] }),
    );
    expect(
      duplicate.success
        ? []
        : duplicate.error.issues.map((issue) => issue.path),
    ).toEqual([["models", 1, "id"]]);

    const shadowed = providerDraftSchema.safeParse(
      draftWithModel({ aliases: ["m1"] }),
    );
    expect(
      shadowed.success ? [] : shadowed.error.issues.map((issue) => issue.path),
    ).toEqual([["models", 0, "aliases"]]);
  });

  it("reports a nested cost violation at its own path", () => {
    const parsed = providerDraftSchema.safeParse(
      draftWithModel({
        cost: { cacheRead: 0, cacheWrite: 0, input: -1, output: 1 },
      }),
    );
    expect(
      parsed.success ? [] : parsed.error.issues.map((issue) => issue.path),
    ).toEqual([["models", 0, "cost", "input"]]);
  });

  it("carries a fully populated draft unchanged", () => {
    const draft = {
      abortOnDisconnect: false,
      api: "openai-completions",
      apiKey: "sk-test",
      baseUrl: "https://openrouter.ai/api/v1",
      compat: {
        "anthropic-messages": { supportsTemperature: false },
        "openai-completions": {
          maxTokensField: "max_tokens",
          supportsStore: false,
        },
        "openai-responses": { supportsToolSearch: true },
      },
      enabled: true,
      headers: { "X-Tag": "one" },
      maxRetries: 3,
      models: [
        {
          aliases: ["gpt"],
          apis: ["openai-responses"],
          contextWindow: 200_000,
          id: "openai/gpt-5.2",
          input: ["text"],
          maxTokens: 32_000,
          name: "GPT-5.2",
          reasoning: true,
        },
      ],
      name: "OpenRouter",
      reasoningOutput: "always",
      requestTimeoutMs: 30_000,
      streamIdleTimeoutMs: 90_000,
    };
    expect(providerDraftSchema.parse(draft)).toEqual(draft);
  });
});

describe("modelEntrySchema", () => {
  it("carries a fully populated row unchanged", () => {
    const model = {
      aliases: ["gpt"],
      apis: ["openai-completions", "openai-responses"],
      baseUrl: "https://models.example.com/v1",
      compat: { "anthropic-messages": { supportsTemperature: false } },
      contextWindow: 200_000,
      cost: { cacheRead: 0.5, cacheWrite: 0, input: 2.5, output: 20 },
      headers: { "X-Model": "one" },
      id: "openai/gpt-5.2",
      input: ["text", "image"],
      maxTokens: 32_000,
      name: "GPT-5.2",
      reasoning: true,
      samplingParams: { temperature: 0.2 },
      thinkingLevelMap: { high: "high", off: null },
    };
    expect(modelEntrySchema.parse(model)).toEqual(model);
  });
});
