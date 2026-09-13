import type {
  InputModality,
  JsonValue,
  ModelCost,
  ModelCostTier,
  ModelEntry,
  PeakPricing,
  Protocol,
  ThinkingLevel,
  ThinkingLevelMap,
  TimeWindow,
  Weekday,
} from "@/types/ipc";

import type { KeyValueRow } from "../components/KeyValueEditor";

import { jsonValueSchema } from "../schemas/json";

// Pure row helpers of the model directory: every edit is a new array or a new
// row object, and the emitted entry keeps the keys the editor never touched
// (a model's compat overrides pass through a save by reference).

/** The seven thinking levels a model can override, in family default order. */
export const THINKING_LEVELS: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/** Pricing window days in week order; an empty selection means every day. */
export const WEEKDAYS: readonly Weekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

/** The base of a new row: the keys the wire type requires, nothing invented. */
export const BLANK_MODEL_ENTRY: ModelEntry = {
  id: "",
  input: ["text"],
  reasoning: false,
};

/** Row keys whose value can be cleared back to "unset". */
export type ClearedModelKey =
  | "baseUrl"
  | "compat"
  | "contextWindow"
  | "cost"
  | "headers"
  | "maxTokens"
  | "name"
  | "samplingParams"
  | "thinkingLevelMap";

/** The four rate texts one price row carries. */
export interface CostRates {
  cacheRead: string;
  cacheWrite: string;
  input: string;
  output: string;
}

/**
 * One row of the price table: the four rates, and the condition under which
 * they replace the base row's. `base` carries no condition and prices every
 * request; a `tier` applies above an input-token threshold; `peak` applies
 * inside its windows. Both override kinds replace the base row, never each
 * other, so the table reads as one list of conditions rather than as two
 * separate price blocks. The stored shape holds a single `peak` block, so the
 * table holds at most one `peak` row.
 */
export type CostRuleDraft =
  | { above: string; kind: "tier"; rates: CostRates }
  | { kind: "base"; rates: CostRates }
  | { kind: "peak"; rates: CostRates; windows: PeakWindowDraft[] };

/** One peak window as the editor holds it. */
export interface PeakWindowDraft {
  days: Weekday[];
  end: string;
  start: string;
}

/**
 * Appends a row pre-checking the provider's default protocol; the array order
 * is the persisted order.
 */
export function addModelRow(models: ModelEntry[], api: Protocol): ModelEntry[] {
  return [...models, { ...BLANK_MODEL_ENTRY, apis: [api] }];
}

/**
 * The submitted price list: absent while the base row is blank and no
 * conditional row was added, so a model that was never priced stores no `cost`
 * key. A row the user added counts however blank it is — its condition is the
 * edit, and dropping it would hide the reason the schema rejects it. A tier
 * keeps its zero threshold on the way out, which is what lets the save-time
 * schema report it instead of the write silently dropping the row.
 */
export function costFromRules(rules: CostRuleDraft[]): ModelCost | undefined {
  const base = rules.find(
    (rule): rule is Extract<CostRuleDraft, { kind: "base" }> =>
      rule.kind === "base",
  );
  if (base === undefined) {
    return undefined;
  }
  const tiers = rules.flatMap((rule) => (rule.kind === "tier" ? [rule] : []));
  const peak = rules.find(
    (rule): rule is Extract<CostRuleDraft, { kind: "peak" }> =>
      rule.kind === "peak",
  );
  if (isBlankRates(base.rates) && tiers.length === 0 && peak === undefined) {
    return undefined;
  }
  return {
    ...ratesOf(base.rates),
    ...(peak !== undefined && { peak: peakFromRule(peak) }),
    ...(tiers.length > 0 && { tiers: tiers.map(tierFromRule) }),
  };
}

/** Text state for one stored price list; an absent list opens as the base row. */
export function costRules(cost: ModelCost | undefined): CostRuleDraft[] {
  const base: CostRuleDraft = {
    kind: "base",
    rates: {
      cacheRead: rateText(cost?.cacheRead),
      cacheWrite: rateText(cost?.cacheWrite),
      input: rateText(cost?.input),
      output: rateText(cost?.output),
    },
  };
  const tiers: CostRuleDraft[] = (cost?.tiers ?? []).map((tier) => ({
    above: rateText(tier.inputTokensAbove),
    kind: "tier",
    rates: {
      cacheRead: rateText(tier.cacheRead),
      cacheWrite: rateText(tier.cacheWrite),
      input: rateText(tier.input),
      output: rateText(tier.output),
    },
  }));
  return [base, ...tiers, ...peakRule(cost?.peak)];
}

/** True when any leaf of an error subtree carries a message. */
export function hasFieldError(node: unknown): boolean {
  if (!isRecord(node)) {
    return false;
  }
  if (typeof node["message"] === "string") {
    return true;
  }
  return Object.values(node).some(hasFieldError);
}

/** An optional numeric field's text; a blank field leaves the key unset. */
export function optionalNumber(text: string): number | undefined {
  return text.trim() === "" ? undefined : Number(text);
}

/** Blank text means the key is unset, not an empty string. */
export function optionalText(text: string): string | undefined {
  return text === "" ? undefined : text;
}

/**
 * One sampling-parameter value: JSON when the text parses, plain text
 * otherwise. Any text maps to a value, so the editor has no invalid state.
 */
export function parseJsonLiteral(text: string): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  return jsonValueSchema.parse(parsed);
}

/** Applies a shallow row patch, returning a new row. */
export function patchModel(
  model: ModelEntry,
  patch: Partial<ModelEntry>,
): ModelEntry {
  return { ...model, ...patch };
}

/** A number as editing text; an unset value is blank. */
export function rateText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/**
 * A numeric input's text as the submitted number. Blank reads as zero: the
 * merge already treats an unset rate as zero, and the schema rejects the zero
 * threshold of a tier.
 */
export function rateValue(text: string): number {
  return text.trim() === "" ? 0 : Number(text);
}

/** Removes one row by position. */
export function removeModelRow(
  models: ModelEntry[],
  index: number,
): ModelEntry[] {
  return models.filter((_, position) => position !== index);
}

/**
 * The sampling map to submit, or undefined when no row carries a key — a row
 * whose key is still blank stays visible in the editor but never reaches the
 * stored document.
 */
export function samplingParamsRecord(
  rows: KeyValueRow[],
): Record<string, JsonValue> | undefined {
  const params: Record<string, JsonValue> = {};
  let hasKey = false;
  for (const row of rows) {
    if (row.key.trim() === "") {
      continue;
    }
    params[row.key] = parseJsonLiteral(row.value);
    hasKey = true;
  }
  return hasKey ? params : undefined;
}

/** Editor rows of a stored sampling map; a value shows as its JSON text. */
export function samplingRows(
  params: Record<string, JsonValue> | undefined,
): KeyValueRow[] {
  return Object.entries(params ?? {}).map(([key, value]) => ({
    key,
    value: jsonLiteralText(value),
  }));
}

/** Toggles one input modality; the schema rejects an empty modality set. */
export function toggleModality(
  model: ModelEntry,
  modality: InputModality,
): ModelEntry {
  const input = model.input ?? [];
  return patchModel(model, {
    input: input.includes(modality)
      ? input.filter((entry) => entry !== modality)
      : [...input, modality],
  });
}

/** Toggles one protocol; the array order is the order the boxes were checked. */
export function toggleProtocol(
  model: ModelEntry,
  protocol: string,
): ModelEntry {
  const apis = model.apis ?? [];
  return patchModel(model, {
    apis: apis.includes(protocol)
      ? apis.filter((entry) => entry !== protocol)
      : [...apis, protocol],
  });
}

/**
 * Sets or clears one optional key of a row. Clearing drops the key instead of
 * storing a `null`: the wire contract spells "unset" as an absent key.
 */
export function withModelValue<K extends ClearedModelKey>(
  model: ModelEntry,
  key: K,
  value: ModelEntry[K] | undefined,
): ModelEntry {
  const next = { ...model };
  if (value === undefined) {
    dropModelKey(next, key);
  } else {
    next[key] = value;
  }
  return next;
}

/**
 * Sets or clears one thinking level: `undefined` removes the key (the level
 * falls back to the family default), `null` disables it explicitly.
 */
export function withThinkingLevel(
  model: ModelEntry,
  level: ThinkingLevel,
  value: null | string | undefined,
): ModelEntry {
  const map: ThinkingLevelMap = {};
  for (const known of THINKING_LEVELS) {
    const next = known === level ? value : model.thinkingLevelMap?.[known];
    if (next !== undefined) {
      map[known] = next;
    }
  }
  return withModelValue(
    model,
    "thinkingLevelMap",
    Object.keys(map).length > 0 ? map : undefined,
  );
}

/** The key list is also what keeps every deletion a literal-key operation. */
function dropModelKey(model: ModelEntry, key: ClearedModelKey): void {
  switch (key) {
    case "baseUrl":
      delete model.baseUrl;
      return;
    case "compat":
      delete model.compat;
      return;
    case "contextWindow":
      delete model.contextWindow;
      return;
    case "cost":
      delete model.cost;
      return;
    case "headers":
      delete model.headers;
      return;
    case "maxTokens":
      delete model.maxTokens;
      return;
    case "name":
      delete model.name;
      return;
    case "samplingParams":
      delete model.samplingParams;
      return;
    case "thinkingLevelMap":
      delete model.thinkingLevelMap;
      return;
    default:
      return;
  }
}

function isBlankRates(rates: CostRates): boolean {
  return (
    rates.cacheRead.trim() === "" &&
    rates.cacheWrite.trim() === "" &&
    rates.input.trim() === "" &&
    rates.output.trim() === ""
  );
}

function isRecord(node: unknown): node is Record<string, unknown> {
  return typeof node === "object" && node !== null;
}

/** The editing text of a stored value; strings keep their quotes to round trip. */
function jsonLiteralText(value: JsonValue): string {
  return JSON.stringify(value);
}

/** The submitted peak block; an empty day list means every day. */
function peakFromRule(rule: {
  rates: CostRates;
  windows: PeakWindowDraft[];
}): PeakPricing {
  return {
    ...ratesOf(rule.rates),
    windows: rule.windows.map((window) => ({
      end: window.end,
      start: window.start,
      ...(window.days.length > 0 && { days: window.days }),
    })),
  };
}

/** The stored peak row, or none: an absent block contributes no row. */
function peakRule(peak: PeakPricing | undefined): CostRuleDraft[] {
  if (peak === undefined) {
    return [];
  }
  return [
    {
      kind: "peak",
      rates: {
        cacheRead: rateText(peak.cacheRead),
        cacheWrite: rateText(peak.cacheWrite),
        input: rateText(peak.input),
        output: rateText(peak.output),
      },
      windows: peak.windows.map(windowDraft),
    },
  ];
}

function ratesOf(rates: CostRates): {
  cacheRead: number;
  cacheWrite: number;
  input: number;
  output: number;
} {
  return {
    cacheRead: rateValue(rates.cacheRead),
    cacheWrite: rateValue(rates.cacheWrite),
    input: rateValue(rates.input),
    output: rateValue(rates.output),
  };
}

function tierFromRule(rule: {
  above: string;
  rates: CostRates;
}): ModelCostTier {
  return {
    ...ratesOf(rule.rates),
    inputTokensAbove: rateValue(rule.above),
  };
}

function windowDraft(window: TimeWindow): PeakWindowDraft {
  return {
    days: [...(window.days ?? [])],
    end: window.end,
    start: window.start,
  };
}
