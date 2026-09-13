import type { ModelCost } from "@/types/ipc";

/** What a model's price column has to say at a glance. */
export interface PriceSummary {
  /** Extra blocks the price adds on top of the base rates. */
  extras: string[];
  /** The peak block, when the model prices its busy hours separately. */
  peak?: RateLine[] | undefined;
  /** The four base rates, in the order a price list reads. */
  rates: RateLine[];
  /** One line per usage tier, each naming the threshold it starts at. */
  tiers: Array<{ rates: RateLine[]; threshold: string }>;
}

/** One named rate of a price block, in the order a price list reads. */
interface RateLine {
  key: string;
  value: number;
}

/**
 * A rate as it is written in a price column: two decimals when the rate is in
 * whole dollars, four when it is in fractions of one, and never a row of
 * trailing zeroes that has to be read past.
 */
export function formatRate(value: number): string {
  const fixed = value
    .toFixed(4)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  return `$${fixed}`;
}

/** The price block of one model, ready for a column and for its detail. */
export function priceSummary(cost: ModelCost | undefined): null | PriceSummary {
  if (cost === undefined) {
    return null;
  }
  const rates = rateLines(cost);
  return {
    extras: [
      ...(cost.tiers !== undefined && cost.tiers.length > 0 ? ["tiered"] : []),
      ...(cost.peak !== undefined ? ["peak"] : []),
    ],
    peak: cost.peak === undefined ? undefined : rateLines(cost.peak),
    rates,
    tiers: (cost.tiers ?? []).map((tier) => ({
      rates: rateLines(tier),
      threshold: tier.inputTokensAbove.toLocaleString(),
    })),
  };
}

function rateLines(cost: {
  cacheRead: number;
  cacheWrite: number;
  input: number;
  output: number;
}): RateLine[] {
  return [
    { key: "costInput", value: cost.input },
    { key: "costOutput", value: cost.output },
    { key: "costCacheRead", value: cost.cacheRead },
    { key: "costCacheWrite", value: cost.cacheWrite },
  ];
}
