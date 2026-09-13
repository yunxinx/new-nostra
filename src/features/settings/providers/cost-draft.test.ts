import { describe, expect, it } from "vitest";

import type { ModelCost } from "@/types/ipc";

import { costDraftRows, rebaseCostRows } from "./cost-draft";

describe("price baseline after saving", () => {
  it("rebases surviving identities while preserving edits made during the save", () => {
    const saved: ModelCost = {
      cacheRead: 0,
      cacheWrite: 0,
      input: 1,
      output: 2,
      tiers: [
        {
          cacheRead: 0,
          cacheWrite: 0,
          input: 3,
          inputTokensAbove: 100,
          output: 4,
        },
        {
          cacheRead: 0,
          cacheWrite: 0,
          input: 5,
          inputTokensAbove: 200,
          output: 6,
        },
      ],
    };
    const submitted = costDraftRows(saved);
    const current = submitted
      .filter((_, index) => index !== 1)
      .map((row) => ({
        ...row,
        rule: { ...row.rule, rates: { ...row.rule.rates, input: "9" } },
      }));
    const rebased = rebaseCostRows(current, submitted, saved);
    expect(rebased.map((row) => row.key)).toEqual(
      current.map((row) => row.key),
    );
    expect(rebased[1]?.baseline?.rates.input).toBe("5");
    expect(rebased[1]?.rule.rates.input).toBe("9");
    expect(submitted).toHaveLength(3);
  });
});
