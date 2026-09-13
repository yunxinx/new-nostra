import { describe, expect, it } from "vitest";

import type { CompatBuckets, ResolvedCompat } from "@/types/ipc";

import type { ProtocolFamily } from "./compat-fields";

import {
  canonicalCompatValue,
  changedCompatCount,
  hasCustomCompat,
  hasInvalidCompatInputs,
  restoreCompatDefaults,
  withCompatInput,
} from "./compat-draft";

describe("compat input drafts", () => {
  it("returns inherited switches to an unset override after a toggle round trip", () => {
    expect(canonicalCompatValue("switch", true, undefined, false)).toBe(true);
    expect(canonicalCompatValue("switch", false, undefined, false)).toBeNull();
    expect(
      canonicalCompatValue("switch", false, undefined, undefined),
    ).toBeNull();
    expect(canonicalCompatValue("switch", false, false, true)).toBe(false);
  });

  it("clears redundant inherited values for every other compat control", () => {
    expect(
      canonicalCompatValue("select", "standard", undefined, "standard"),
    ).toBeNull();
    expect(canonicalCompatValue("json", 7, undefined, 7)).toBeNull();
    expect(
      canonicalCompatValue("list", ["first"], undefined, ["first"]),
    ).toBeNull();
    expect(
      canonicalCompatValue("map", { order: ["first"] }, undefined, {
        order: ["first"],
      }),
    ).toBeNull();
    expect(canonicalCompatValue("json", 7, 7, 3)).toBe(7);
  });

  it("counts an invalid field once even when its last valid value also changed", () => {
    const baseline = { "openai-completions": { vllmPriority: 7 } };
    const inputs = withCompatInput({}, "openai-completions", "vllmPriority", {
      isInvalid: true,
      text: "oops",
    });
    expect(hasInvalidCompatInputs(inputs)).toBe(true);
    expect(changedCompatCount(baseline, baseline, inputs)).toBe(1);
    expect(
      changedCompatCount(
        baseline,
        { "openai-completions": { vllmPriority: 9 } },
        inputs,
      ),
    ).toBe(1);
    expect(
      withCompatInput(inputs, "openai-completions", "vllmPriority", undefined),
    ).toEqual({});
  });

  it("does not count formatting of a valid unchanged value as another edit", () => {
    const baseline = { "openai-completions": { vllmPriority: 7 } };
    const inputs = withCompatInput({}, "openai-completions", "vllmPriority", {
      isInvalid: false,
      text: " 7 ",
    });
    expect(changedCompatCount(baseline, baseline, inputs)).toBe(0);
    expect(hasInvalidCompatInputs(inputs)).toBe(false);
  });
});

describe("compat defaults", () => {
  const defaults: Partial<Record<ProtocolFamily, ResolvedCompat>> = {
    "anthropic-messages": {
      sources: { supportsTemperature: "familyDefault" },
      values: { supportsTemperature: true },
    },
    "openai-completions": {
      sources: { supportsStore: "familyDefault", vllmPriority: "vendor" },
      values: { supportsStore: true, vllmPriority: 3 },
    },
    "openai-responses": { sources: {}, values: {} },
  };

  it("restores all protocol buckets while preserving saved values already at the default", () => {
    const baseline: CompatBuckets = {
      "anthropic-messages": { supportsTemperature: false },
      "openai-completions": { supportsStore: true, vllmPriority: 7 },
      "openai-responses": { supportsStrictMode: false },
    };
    expect(hasCustomCompat(baseline, defaults)).toBe(true);
    const restored = restoreCompatDefaults(baseline, defaults);
    expect(restored).toEqual({
      "openai-completions": { supportsStore: true },
      "openai-responses": { supportsStrictMode: false },
    });
    expect(hasCustomCompat(restored, defaults)).toBe(false);
    expect(baseline["openai-completions"]?.vllmPriority).toBe(7);
    expect(baseline["anthropic-messages"]?.supportsTemperature).toBe(false);
  });

  it("does not dirty an already-default saved configuration", () => {
    const baseline: CompatBuckets = {
      "anthropic-messages": { supportsTemperature: true },
      "openai-completions": { supportsStore: true, vllmPriority: 3 },
    };
    expect(hasCustomCompat(baseline, defaults)).toBe(false);
    expect(restoreCompatDefaults(baseline, defaults)).toBe(baseline);
    expect(restoreCompatDefaults(undefined, defaults)).toBeUndefined();
  });
});
