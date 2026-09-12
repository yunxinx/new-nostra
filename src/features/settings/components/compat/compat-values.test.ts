import { describe, expect, it } from "vitest";

import type { CompatBuckets } from "@/types/ipc";

import {
  formatJsonValue,
  overrideRecord,
  parseCellText,
  parseStrictJson,
  storedBuckets,
  withCompatOverride,
} from "./compat-values";

const COMPLETIONS_BUCKET: CompatBuckets = {
  "openai-completions": { supportsStore: false, thinkingFormat: "deepseek" },
};

describe("compat value text", () => {
  it("reads a map cell as JSON when it parses and as plain text otherwise", () => {
    expect(parseCellText("1.5")).toBe(1.5);
    expect(parseCellText("true")).toBe(true);
    expect(parseCellText("null")).toBeNull();
    expect(parseCellText('"quoted"')).toBe("quoted");
    expect(parseCellText("plain text")).toBe("plain text");
    expect(parseCellText("")).toBe("");
    expect(
      parseCellText('{"$var": "thinking.budget", "omitWhenOff": true}'),
    ).toEqual({ $var: "thinking.budget", omitWhenOff: true });
    expect(parseCellText("{oops")).toBe("{oops");
  });

  it("refuses a structured editor's non-JSON text", () => {
    expect(parseStrictJson("{oops")).toEqual({ ok: false });
    expect(parseStrictJson("plain")).toEqual({ ok: false });
    expect(parseStrictJson("[1, 2]")).toEqual({ ok: true, value: [1, 2] });
    expect(parseStrictJson("null")).toEqual({ ok: true, value: null });
  });

  it("prints a field value as its editing text", () => {
    expect(formatJsonValue(undefined)).toBe("");
    expect(formatJsonValue(3)).toBe("3");
    expect(formatJsonValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe("compat bucket edits", () => {
  it("reads a fragment as a record without its unset values", () => {
    expect(
      overrideRecord({
        requiresToolResultName: null,
        supportsStore: true,
        thinkingFormat: "deepseek",
        vllmPriority: undefined,
      }),
    ).toEqual({ supportsStore: true, thinkingFormat: "deepseek" });
    expect(overrideRecord(undefined)).toEqual({});
  });

  it("sets and clears one family's field", () => {
    const set = withCompatOverride(
      undefined,
      "openai-completions",
      "supportsStore",
      false,
    );
    expect(set).toEqual({ "openai-completions": { supportsStore: false } });

    const both = withCompatOverride(
      set,
      "openai-completions",
      "thinkingFormat",
      "deepseek",
    );
    expect(both).toEqual(COMPLETIONS_BUCKET);

    const cleared = withCompatOverride(
      both,
      "openai-completions",
      "supportsStore",
      null,
    );
    expect(cleared).toEqual({
      "openai-completions": { thinkingFormat: "deepseek" },
    });

    // The last field of the last family drops the whole map: an empty fragment
    // is not an override.
    expect(
      withCompatOverride(cleared, "openai-completions", "thinkingFormat", null),
    ).toBeUndefined();
  });

  it("leaves other families untouched", () => {
    expect(
      withCompatOverride(
        COMPLETIONS_BUCKET,
        "anthropic-messages",
        "supportsTemperature",
        true,
      ),
    ).toEqual({
      "anthropic-messages": { supportsTemperature: true },
      "openai-completions": COMPLETIONS_BUCKET["openai-completions"],
    });
  });

  it("drops an edit whose value its own field schema rejects", () => {
    expect(
      withCompatOverride(
        COMPLETIONS_BUCKET,
        "openai-completions",
        "thinkingFormat",
        "gemini",
      ),
    ).toEqual(COMPLETIONS_BUCKET);
    expect(
      withCompatOverride(
        COMPLETIONS_BUCKET,
        "openai-completions",
        "notAField",
        true,
      ),
    ).toEqual(COMPLETIONS_BUCKET);
  });

  it("narrows a form map to the wire shape", () => {
    expect(
      storedBuckets({
        "anthropic-messages": { supportsTemperature: true },
        "openai-completions": { supportsStore: true, thinkingFormat: null },
      }),
    ).toEqual({
      "anthropic-messages": { supportsTemperature: true },
      "openai-completions": { supportsStore: true },
    });
    expect(storedBuckets({ "openai-completions": {} })).toBeUndefined();
    expect(storedBuckets({})).toBeUndefined();
    expect(storedBuckets(null)).toBeUndefined();
  });
});
