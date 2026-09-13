import type { ModelCost } from "@/types/ipc";

import { isDeepEqual } from "@/lib/deep-equal";

import { type CostRuleDraft, costRules } from "./model-rows";

export interface CostDraftRow {
  baseline: CostRuleDraft | undefined;
  key: string;
  rule: CostRuleDraft;
}

export function costDraftRows(cost: ModelCost | undefined): CostDraftRow[] {
  return costRules(cost).map((rule) => ({
    baseline: rule,
    key: crypto.randomUUID(),
    rule,
  }));
}

export function rebaseCostRows(
  current: CostDraftRow[],
  submitted: CostDraftRow[],
  saved: ModelCost | undefined,
): CostDraftRow[] {
  const stored = costRules(saved);
  const byKey = new Map<string, CostRuleDraft>();
  for (const kind of ["base", "tier", "peak"] as const) {
    const savedRules = stored.filter((rule) => rule.kind === kind);
    submitted
      .filter((row) => row.rule.kind === kind)
      .forEach((row, index) => {
        const rule = savedRules[index];
        if (rule !== undefined) byKey.set(row.key, rule);
      });
  }
  return current.map((row) => {
    const baseline = byKey.get(row.key);
    const previous = submitted.find((entry) => entry.key === row.key);
    return {
      ...row,
      baseline,
      rule:
        baseline !== undefined && isDeepEqual(row.rule, previous?.rule)
          ? baseline
          : row.rule,
    };
  });
}
