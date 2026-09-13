import { describe, expect, it } from "vitest";

import { modelCostSchema } from "./model-cost";

const BASE_RATES = { cacheRead: 0, cacheWrite: 0, input: 0, output: 1 };

function costWith(patch: Record<string, unknown>): unknown {
  return { ...BASE_RATES, ...patch };
}

describe("modelCostSchema", () => {
  it("accepts zero rates, usage tiers and peak windows, unchanged", () => {
    const cost = {
      cacheRead: 0.5,
      cacheWrite: 3,
      input: 2.5,
      output: 20,
      peak: {
        cacheRead: 0.006,
        cacheWrite: 0,
        input: 0.3,
        output: 1.2,
        windows: [
          {
            days: ["mon", "tue", "wed", "thu", "fri"],
            end: "04:00",
            start: "01:00",
          },
          // `end` before `start` crosses midnight and stays valid.
          { end: "00:30", start: "23:30" },
        ],
      },
      tiers: [
        {
          cacheRead: 0.25,
          cacheWrite: 3,
          input: 2.5,
          inputTokensAbove: 272000,
          output: 20,
        },
      ],
    };
    expect(modelCostSchema.parse(cost)).toEqual(cost);
  });

  it("ignores unknown keys, like the stored-document contract", () => {
    expect(modelCostSchema.safeParse(costWith({ extra: 1 })).success).toBe(
      true,
    );
  });

  it.each([
    ["a negative input rate", costWith({ input: -0.1 })],
    ["a negative cache-write rate", costWith({ cacheWrite: -1 })],
    [
      "a zero tier threshold",
      costWith({
        tiers: [
          {
            cacheRead: 0,
            cacheWrite: 0,
            input: 1,
            inputTokensAbove: 0,
            output: 1,
          },
        ],
      }),
    ],
    [
      "a negative tier rate",
      costWith({
        tiers: [
          {
            cacheRead: 0,
            cacheWrite: 0,
            input: 1,
            inputTokensAbove: 1000,
            output: -1,
          },
        ],
      }),
    ],
    [
      "a negative peak rate",
      costWith({
        peak: {
          cacheRead: 0,
          cacheWrite: 0,
          input: -1,
          output: 1,
          windows: [{ end: "02:00", start: "01:00" }],
        },
      }),
    ],
    [
      "a peak without windows",
      costWith({
        peak: {
          cacheRead: 0,
          cacheWrite: 0,
          input: 1,
          output: 1,
          windows: [],
        },
      }),
    ],
    [
      "a peak missing its windows key",
      costWith({
        peak: { cacheRead: 0, cacheWrite: 0, input: 1, output: 1 },
      }),
    ],
    [
      "a one-digit window hour",
      costWith({
        peak: peakWith([{ end: "02:00", start: "1:00" }]),
      }),
    ],
    [
      "a window hour past midnight",
      costWith({
        peak: peakWith([{ end: "02:00", start: "25:00" }]),
      }),
    ],
    [
      "a window minute past 59",
      costWith({
        peak: peakWith([{ end: "02:00", start: "01:60" }]),
      }),
    ],
    [
      "equal window bounds",
      costWith({
        peak: peakWith([{ end: "01:00", start: "01:00" }]),
      }),
    ],
    [
      "an unknown weekday",
      costWith({
        peak: peakWith([{ days: ["funday"], end: "02:00", start: "01:00" }]),
      }),
    ],
  ])("rejects %s", (_label, cost) => {
    expect(modelCostSchema.safeParse(cost).success).toBe(false);
  });

  it("treats an explicit null tier list or peak block as unset", () => {
    expect(
      modelCostSchema.safeParse(costWith({ peak: null, tiers: null })).success,
    ).toBe(true);
  });

  it("rejects a null window list, which is not an optional field", () => {
    expect(
      modelCostSchema.safeParse(costWith({ peak: peakWith(null) })).success,
    ).toBe(false);
  });
});

function peakWith(windows: unknown): unknown {
  return { cacheRead: 0, cacheWrite: 0, input: 1, output: 1, windows };
}
