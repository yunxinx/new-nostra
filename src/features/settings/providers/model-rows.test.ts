import { describe, expect, it } from "vitest";

import type { ModelCost, ModelEntry } from "@/types/ipc";

import {
  addModelRow,
  BLANK_MODEL_ENTRY,
  type CostDraft,
  costDraft,
  costFromDraft,
  hasFieldError,
  optionalNumber,
  optionalText,
  parseJsonLiteral,
  patchModel,
  rateText,
  rateValue,
  removeModelRow,
  samplingParamsRecord,
  samplingRows,
  toggleModality,
  toggleProtocol,
  withModelValue,
  withThinkingLevel,
} from "./model-rows";

const MODEL: ModelEntry = {
  apis: ["openai-completions"],
  id: "m1",
  input: ["text"],
  reasoning: true,
};

const PRICED: ModelCost = {
  cacheRead: 0.05,
  cacheWrite: 0.1,
  input: 0.5,
  output: 1.5,
  peak: {
    cacheRead: 0.06,
    cacheWrite: 0.12,
    input: 0.6,
    output: 1.8,
    windows: [{ days: ["mon"], end: "17:00", start: "09:00" }],
  },
  tiers: [
    {
      cacheRead: 0.02,
      cacheWrite: 0.04,
      input: 0.2,
      inputTokensAbove: 128000,
      output: 0.8,
    },
  ],
};

describe("model row list edits", () => {
  it("appends a row that pre-checks the given default protocol", () => {
    expect(addModelRow([MODEL], "anthropic-messages")).toEqual([
      MODEL,
      { ...BLANK_MODEL_ENTRY, apis: ["anthropic-messages"] },
    ]);
    // The base entry itself stays down to the required keys.
    expect(Object.keys(BLANK_MODEL_ENTRY).sort()).toEqual([
      "id",
      "input",
      "reasoning",
    ]);
  });

  it("removes by position", () => {
    const models = [MODEL, { ...MODEL, id: "m2" }, { ...MODEL, id: "m3" }];
    expect(removeModelRow(models, 1).map((model) => model.id)).toEqual([
      "m1",
      "m3",
    ]);
  });
});

describe("model row field edits", () => {
  it("appends protocols in check order and drops them on uncheck", () => {
    const first = toggleProtocol(MODEL, "anthropic-messages");
    expect(first.apis).toEqual(["openai-completions", "anthropic-messages"]);
    expect(toggleProtocol(first, "openai-completions").apis).toEqual([
      "anthropic-messages",
    ]);
  });

  it("toggles modalities, leaving the empty set to the schema", () => {
    expect(toggleModality(MODEL, "image").input).toEqual(["text", "image"]);
    expect(toggleModality(MODEL, "text").input).toEqual([]);
  });

  it("clears an optional key instead of storing a null", () => {
    const priced = patchModel(MODEL, { cost: PRICED });
    const cleared = withModelValue(priced, "cost", undefined);
    expect("cost" in cleared).toBe(false);
    expect(cleared.id).toBe("m1");
  });

  it("drops the thinking map once its last level is removed", () => {
    const mapped = withThinkingLevel(MODEL, "high", "high");
    expect(mapped.thinkingLevelMap).toEqual({ high: "high" });
    // An empty value disables the level with an explicit null.
    expect(withThinkingLevel(mapped, "high", null).thinkingLevelMap).toEqual({
      high: null,
    });
    const emptied = withThinkingLevel(mapped, "high", undefined);
    expect(emptied.thinkingLevelMap).toBeUndefined();
    expect("thinkingLevelMap" in emptied).toBe(false);
  });

  it("reads blank text and blank numbers as unset", () => {
    expect(optionalText("")).toBeUndefined();
    expect(optionalText("high")).toBe("high");
    expect(optionalNumber("")).toBeUndefined();
    expect(optionalNumber("12")).toBe(12);
    expect(rateText(undefined)).toBe("");
    expect(rateText(0.5)).toBe("0.5");
    expect(rateValue("")).toBe(0);
    expect(rateValue("1.5")).toBe(1.5);
  });
});

describe("cost drafts", () => {
  it("opens blank when the row carries no price list", () => {
    expect(costFromDraft(costDraft(undefined))).toBeUndefined();
  });

  it("round trips a stored price list", () => {
    expect(costFromDraft(costDraft(PRICED))).toEqual(PRICED);
  });

  it("reads blank rates as zero once any rate is filled", () => {
    const draft = { ...costDraft(undefined), input: "0.5" };
    expect(costFromDraft(draft)).toEqual({
      cacheRead: 0,
      cacheWrite: 0,
      input: 0.5,
      output: 0,
    });
  });

  it("keeps a tier block alive on its zero threshold for the schema", () => {
    const draft: CostDraft = {
      ...costDraft(undefined),
      tiers: [
        {
          cacheRead: "",
          cacheWrite: "",
          input: "",
          inputTokensAbove: "",
          output: "",
        },
      ],
    };
    expect(costFromDraft(draft)).toEqual({
      cacheRead: 0,
      cacheWrite: 0,
      input: 0,
      output: 0,
      tiers: [
        {
          cacheRead: 0,
          cacheWrite: 0,
          input: 0,
          inputTokensAbove: 0,
          output: 0,
        },
      ],
    });
  });

  it("drops an empty day list and keeps start and end verbatim", () => {
    const draft: CostDraft = {
      ...costDraft(undefined),
      peak: {
        cacheRead: "1",
        cacheWrite: "2",
        input: "3",
        output: "4",
        windows: [
          { days: [], end: "04:00", start: "01:00" },
          { days: ["sat", "sun"], end: "02:00", start: "23:00" },
        ],
      },
    };
    expect(costFromDraft(draft)?.peak).toEqual({
      cacheRead: 1,
      cacheWrite: 2,
      input: 3,
      output: 4,
      windows: [
        { end: "04:00", start: "01:00" },
        { days: ["sat", "sun"], end: "02:00", start: "23:00" },
      ],
    });
  });
});

describe("sampling parameter rows", () => {
  it("shows stored values as their JSON text", () => {
    expect(samplingRows({ stream: true, temperature: 0.7 })).toEqual([
      { key: "stream", value: "true" },
      { key: "temperature", value: "0.7" },
    ]);
    expect(samplingRows(undefined)).toEqual([]);
  });

  it("parses a JSON text and falls back to plain text", () => {
    expect(parseJsonLiteral("0.7")).toBe(0.7);
    expect(parseJsonLiteral("true")).toBe(true);
    expect(parseJsonLiteral("hello")).toBe("hello");
    expect(parseJsonLiteral("007")).toBe("007");
    // A quoted string keeps its type across an edit of another row.
    expect(parseJsonLiteral('"123"')).toBe("123");
  });

  it("drops blank-key rows and an all-blank map", () => {
    expect(
      samplingParamsRecord([
        { key: "temperature", value: "0.7" },
        { key: "  ", value: "0.1" },
      ]),
    ).toEqual({ temperature: 0.7 });
    expect(samplingParamsRecord([])).toBeUndefined();
    expect(samplingParamsRecord([{ key: "", value: "1" }])).toBeUndefined();
  });
});

describe("error subtrees", () => {
  it("finds a message at any depth", () => {
    expect(hasFieldError(undefined)).toBe(false);
    expect(hasFieldError({})).toBe(false);
    expect(hasFieldError({ id: { message: "blank" } })).toBe(true);
    expect(
      hasFieldError({
        cost: { peak: { windows: [{ start: { message: "x" } }] } },
      }),
    ).toBe(true);
  });
});
