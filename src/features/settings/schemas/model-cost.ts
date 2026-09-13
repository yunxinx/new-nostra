import { z } from "zod";

// Pricing metadata: the accept/reject set mirrors the Rust decode
// (src-tauri/src/types.rs ModelCost, PeakPricing, TimeWindow, Weekday) and
// validate_cost (src-tauri/src/provider/config.rs). Unknown keys are ignored on
// both sides.

/** Day of a pricing window; wire values are lowercase short names. */
const weekdaySchema = z.enum(["fri", "mon", "sat", "sun", "thu", "tue", "wed"]);

/** `HH:MM` on a 24-hour UTC clock: two digits each, hours below 24. */
const timeOfDaySchema = z
  .string()
  .regex(
    /^([01][0-9]|2[0-3]):[0-5][0-9]$/,
    "peak window times must be UTC HH:MM",
  );

/** One daily pricing window; `end` before `start` crosses midnight. */
const timeWindowSchema = z
  .object({
    days: z.array(weekdaySchema).optional(),
    end: timeOfDaySchema,
    start: timeOfDaySchema,
  })
  .superRefine((window, ctx) => {
    // Times are only invalid when equal; an end before the start is the
    // documented midnight-crossing form, not an error.
    if (window.start === window.end) {
      ctx.addIssue({
        code: "custom",
        message: "peak window start and end must differ",
        path: ["start"],
      });
    }
  });

/** Per-million-token USD rate; a negative value would corrupt every estimate. */
const rateSchema = z.number().nonnegative("cost rates must not be negative");

/** One usage tier replacing the base rates once input tokens exceed it. */
const modelCostTierSchema = z.object({
  cacheRead: rateSchema,
  cacheWrite: rateSchema,
  input: rateSchema,
  inputTokensAbove: z
    .int()
    .min(1, "cost tier inputTokensAbove must be greater than zero"),
  output: rateSchema,
});

/** Peak-time rates replacing the base rates inside `windows`. */
const peakPricingSchema = z.object({
  cacheRead: rateSchema,
  cacheWrite: rateSchema,
  input: rateSchema,
  output: rateSchema,
  windows: z
    .array(timeWindowSchema)
    .min(1, "peak pricing needs at least one window"),
});

/**
 * Model pricing: display and estimation data, never a routing gate. The base
 * rates price off-peak usage; `tiers` and `peak` each replace all four base
 * rates once their condition holds.
 */
export const modelCostSchema = z.object({
  cacheRead: rateSchema,
  cacheWrite: rateSchema,
  input: rateSchema,
  output: rateSchema,
  peak: peakPricingSchema.nullish(),
  tiers: z.array(modelCostTierSchema).nullish(),
});
