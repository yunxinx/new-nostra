import { describe, expect, it } from "vitest";

import type { Provider, ProviderPreset } from "@/types/ipc";

import { providerDraftSchema } from "../schemas/provider";
import {
  BLANK_PROVIDER_DRAFT,
  blankCreateDraft,
  freeProviderName,
  headerRecord,
  headerRows,
  presetDraft,
  providerToDraft,
  toFormValues,
  toProviderDraft,
} from "./draft";

const STORED: Provider = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "sk-secret",
  baseUrl: "https://gateway.example/v1",
  compat: { "openai-completions": { supportsStore: false } },
  enabled: true,
  headers: { "x-extra": "1" },
  id: "p1",
  maxRetries: 2,
  models: [
    {
      apis: ["openai-completions"],
      id: "m1",
      reasoning: true,
    },
  ],
  name: "Gateway",
  reasoningOutput: "auto",
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 120_000,
};

const MINIMAL: Provider = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "",
  baseUrl: "https://minimal.example",
  enabled: true,
  id: "p2",
  maxRetries: 2,
  name: "Minimal",
  reasoningOutput: "auto",
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 120_000,
};

describe("provider draft conversions", () => {
  it("keeps every stored key when a provider becomes a draft", () => {
    expect(providerToDraft(STORED)).toEqual({
      abortOnDisconnect: true,
      api: "openai-completions",
      apiKey: "sk-secret",
      baseUrl: "https://gateway.example/v1",
      compat: { "openai-completions": { supportsStore: false } },
      enabled: true,
      headers: { "x-extra": "1" },
      maxRetries: 2,
      models: [
        {
          apis: ["openai-completions"],
          id: "m1",
          reasoning: true,
        },
      ],
      name: "Gateway",
      reasoningOutput: "auto",
      requestTimeoutMs: 120_000,
      streamIdleTimeoutMs: 120_000,
    });
  });

  it("keeps optional keys absent when the stored row never set them", () => {
    const draft = providerToDraft(MINIMAL);
    expect("compat" in draft).toBe(false);
    expect("headers" in draft).toBe(false);
    expect("models" in draft).toBe(false);
  });

  it("carries the form's compat map into the form values", () => {
    const values = toFormValues(providerToDraft(STORED));
    expect(values.compat).toEqual({
      "openai-completions": { supportsStore: false },
    });
    expect(values.models).toEqual(STORED.models);
    expect(values.headers).toEqual({ "x-extra": "1" });
    expect(values.name).toBe("Gateway");
  });

  it("carries the unedited compat and models through a save", () => {
    const submission = providerDraftSchema.parse({
      ...toFormValues(providerToDraft(STORED)),
      name: "Renamed",
    });
    const draft = toProviderDraft(submission, STORED.models ?? []);
    expect(draft).toEqual({
      ...providerToDraft(STORED),
      name: "Renamed",
    });
  });

  it("narrows an explicit null in a compat bucket to an unset key", () => {
    const submission = providerDraftSchema.parse({
      ...toFormValues(providerToDraft(STORED)),
      compat: { "openai-completions": { supportsStore: null } },
    });
    const draft = toProviderDraft(submission, []);
    expect(draft.compat).toBeUndefined();
  });

  it("submits no model key when every row is gone", () => {
    const submission = providerDraftSchema.parse(
      toFormValues(providerToDraft(STORED)),
    );
    const draft = toProviderDraft(submission, []);
    expect("models" in draft).toBe(false);
  });

  it("takes the blank draft defaults from the Rust decode defaults", () => {
    const submission = providerDraftSchema.parse({
      ...toFormValues(BLANK_PROVIDER_DRAFT),
      baseUrl: "https://blank.example",
      name: "Filled in",
    });
    expect(toProviderDraft(submission, [])).toEqual({
      ...BLANK_PROVIDER_DRAFT,
      baseUrl: "https://blank.example",
      name: "Filled in",
    });
  });
});

describe("preset prefill", () => {
  const PRESET: ProviderPreset = {
    api: "openai-completions",
    baseUrl: "https://openrouter.ai/api/v1",
    compat: { "openai-completions": { supportsDeveloperRole: false } },
    headers: { "X-OpenRouter-Title": "Nostra" },
    models: [
      {
        apis: ["anthropic-messages", "openai-completions"],
        id: "anthropic/claude-sonnet-5",
        input: ["text", "image"],
        name: "Claude Sonnet 5",
        reasoning: true,
      },
    ],
    name: "OpenRouter",
    presetId: "openrouter",
  };

  it("prefills the preset values over the blank defaults", () => {
    expect(presetDraft(PRESET)).toEqual({
      ...BLANK_PROVIDER_DRAFT,
      api: "openai-completions",
      baseUrl: "https://openrouter.ai/api/v1",
      compat: { "openai-completions": { supportsDeveloperRole: false } },
      headers: { "X-OpenRouter-Title": "Nostra" },
      models: PRESET.models,
      name: "OpenRouter",
    });
  });

  it("keeps empty preset maps and directories absent", () => {
    const bare: ProviderPreset = {
      api: "anthropic-messages",
      baseUrl: "https://api.anthropic.com",
      compat: {},
      headers: {},
      models: [],
      name: "Anthropic",
      presetId: "anthropic",
    };
    const draft = presetDraft(bare);
    expect("compat" in draft).toBe(false);
    expect("headers" in draft).toBe(false);
    expect("models" in draft).toBe(false);
    expect(draft.apiKey).toBe("");
    expect(draft.enabled).toBe(true);
  });
});

describe("blank create payload", () => {
  it("carries the given name and the default protocol's endpoint", () => {
    expect(blankCreateDraft("Untitled provider")).toEqual({
      ...BLANK_PROVIDER_DRAFT,
      baseUrl: "https://api.openai.com/v1",
      name: "Untitled provider",
    });
  });
});

describe("free provider name", () => {
  it("keeps the base name while no stored provider holds it", () => {
    expect(freeProviderName("Untitled provider", [])).toBe("Untitled provider");
    expect(freeProviderName("Untitled provider", ["Gateway"])).toBe(
      "Untitled provider",
    );
  });

  it("numbers the name from the lowest free suffix once it is taken", () => {
    expect(freeProviderName("Untitled provider", ["Untitled provider"])).toBe(
      "Untitled provider 2",
    );
    expect(
      freeProviderName("Untitled provider", [
        "Untitled provider 2",
        "Untitled provider",
        "Untitled provider 3",
      ]),
    ).toBe("Untitled provider 4");
  });

  it("compares exactly, the way the stored name index does", () => {
    expect(freeProviderName("Gateway", ["gateway"])).toBe("Gateway");
  });
});

describe("header row conversions", () => {
  it("lists stored headers as rows and an absent map as no rows", () => {
    expect(headerRows({ "x-a": "1", "x-b": "2" })).toEqual([
      { key: "x-a", value: "1" },
      { key: "x-b", value: "2" },
    ]);
    expect(headerRows(undefined)).toEqual([]);
  });

  it("drops rows whose key is blank", () => {
    expect(
      headerRecord([
        { key: "x-a", value: "1" },
        { key: "   ", value: "2" },
        { key: "", value: "" },
        { key: "x-b", value: "" },
      ]),
    ).toEqual({ "x-a": "1", "x-b": "" });
  });
});
