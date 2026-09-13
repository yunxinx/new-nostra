import { describe, expect, it } from "vitest";

import type { ModelEntry } from "@/types/ipc";

import {
  anthropicMessagesCompatSchema,
  openaiCompletionsCompatSchema,
  openaiResponsesCompatSchema,
  protocolFamilySchema,
} from "../../schemas/compat";
import {
  compatFamiliesFor,
  compatFieldsFor,
  knownCompatFamilies,
} from "./compat-fields";

// The field set of a descriptor list must equal the schema's own key set: a
// compat field added to the schema reaches the panel through introspection, and
// this comparison is what keeps that promise honest.
const SHAPES = {
  "anthropic-messages": anthropicMessagesCompatSchema.shape,
  "openai-completions": openaiCompletionsCompatSchema.shape,
  "openai-responses": openaiResponsesCompatSchema.shape,
};

function fieldsOf(family: keyof typeof SHAPES) {
  return new Map(
    compatFieldsFor(family).map((descriptor) => [descriptor.name, descriptor]),
  );
}

describe("compat field introspection", () => {
  it("describes exactly the fields of each family schema", () => {
    for (const family of protocolFamilySchema.options) {
      expect(compatFieldsFor(family).map((field) => field.name)).toEqual(
        Object.keys(SHAPES[family]).sort(),
      );
    }
  });

  it("picks the control kind from the field's own schema type", () => {
    const completions = fieldsOf("openai-completions");
    expect(completions.get("supportsStore")?.kind).toBe("switch");
    expect(completions.get("maxTokensField")?.kind).toBe("select");
    expect(completions.get("cacheControlFormat")?.kind).toBe("select");
    expect(completions.get("chatTemplateKwargs")?.kind).toBe("map");
    expect(completions.get("vllmPriority")?.kind).toBe("json");

    const anthropic = fieldsOf("anthropic-messages");
    expect(anthropic.get("allowedFallbackModels")?.kind).toBe("list");
  });

  it("lists a select's options in schema order", () => {
    const completions = fieldsOf("openai-completions");
    expect(completions.get("maxTokensField")?.options).toEqual([
      "max_completion_tokens",
      "max_tokens",
    ]);
    expect(completions.get("cacheControlFormat")?.options).toEqual([
      "anthropic",
    ]);
    expect(completions.get("thinkingFormat")?.options).toContain(
      "qwen-chat-template",
    );
    expect(completions.get("supportsStore")?.options).toEqual([]);
  });

  it("accepts the values the field's schema accepts and refuses the rest", () => {
    const completions = fieldsOf("openai-completions");
    const store = completions.get("supportsStore");
    expect(store?.parseValue(true)).toBe(true);
    expect(store?.parseValue("true")).toBeNull();

    const maxTokensField = completions.get("maxTokensField");
    expect(maxTokensField?.parseValue("max_tokens")).toBe("max_tokens");
    expect(maxTokensField?.parseValue("tokens")).toBeNull();

    const priority = completions.get("vllmPriority");
    expect(priority?.parseValue(2)).toBe(2);
    expect(priority?.parseValue("high")).toBeNull();

    const fallbacks = fieldsOf("anthropic-messages").get(
      "allowedFallbackModels",
    );
    const fallback = {
      cost: { cacheRead: 0, cacheWrite: 0, input: 1, output: 2 },
      model: "claude-fable-5-1",
      provider: "anthropic",
    };
    expect(fallbacks?.parseValue([fallback])).toEqual([fallback]);
    expect(fallbacks?.parseValue([{ model: "claude-fable-5-1" }])).toBeNull();
    expect(fallbacks?.parseValue({})).toBeNull();
  });

  it("keeps the known families, deduplicated and in schema order", () => {
    expect(
      knownCompatFamilies([
        "openai-responses",
        "gemini",
        "openai-responses",
        "anthropic-messages",
      ]),
    ).toEqual(["anthropic-messages", "openai-responses"]);
    expect(knownCompatFamilies([])).toEqual([]);
  });
});

describe("compat families of a directory", () => {
  function model(apis: ModelEntry["apis"]): ModelEntry {
    return apis === undefined
      ? { id: "m1", reasoning: true }
      : { apis, id: "m1", reasoning: true };
  }

  it("takes every family the rows check, in schema order", () => {
    expect(
      compatFamiliesFor("openai-completions", [
        model(["openai-responses"]),
        model(["anthropic-messages", "openai-responses"]),
      ]),
    ).toEqual(["anthropic-messages", "openai-responses"]);
  });

  it("falls back to the default protocol while no row checks one", () => {
    expect(compatFamiliesFor("openai-responses", [])).toEqual([
      "openai-responses",
    ]);
    expect(compatFamiliesFor("openai-responses", [model(undefined)])).toEqual([
      "openai-responses",
    ]);
  });

  it("names no family while the provider has no default either", () => {
    expect(compatFamiliesFor(undefined, [])).toEqual([]);
  });
});
