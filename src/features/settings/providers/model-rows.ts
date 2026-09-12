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

/** The cost editor's text state; numbers stay text so typing is never rewritten. */
export interface CostDraft {
  cacheRead: string;
  cacheWrite: string;
  input: string;
  output: string;
  peak: PeakDraft | undefined;
  tiers: CostTierDraft[];
}

/** One cost tier as the editor holds it: five numeric texts. */
export interface CostTierDraft {
  cacheRead: string;
  cacheWrite: string;
  input: string;
  inputTokensAbove: string;
  output: string;
}

/** The peak block of the cost editor. */
export interface PeakDraft {
  cacheRead: string;
  cacheWrite: string;
  input: string;
  output: string;
  windows: PeakWindowDraft[];
}

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

/** Text state for one stored price list; an absent list opens blank. */
export function costDraft(cost: ModelCost | undefined): CostDraft {
  return {
    cacheRead: rateText(cost?.cacheRead),
    cacheWrite: rateText(cost?.cacheWrite),
    input: rateText(cost?.input),
    output: rateText(cost?.output),
    peak: cost?.peak === undefined ? undefined : peakDraft(cost.peak),
    tiers: (cost?.tiers ?? []).map(tierDraft),
  };
}

/**
 * The submitted price list: absent while every text is blank and no tier or
 * peak exists, so a row that never priced anything stores no `cost` key.
 */
export function costFromDraft(draft: CostDraft): ModelCost | undefined {
  const isBlank =
    draft.cacheRead.trim() === "" &&
    draft.cacheWrite.trim() === "" &&
    draft.input.trim() === "" &&
    draft.output.trim() === "" &&
    draft.tiers.length === 0 &&
    draft.peak === undefined;
  if (isBlank) {
    return undefined;
  }
  return {
    cacheRead: rateValue(draft.cacheRead),
    cacheWrite: rateValue(draft.cacheWrite),
    input: rateValue(draft.input),
    output: rateValue(draft.output),
    ...(draft.peak !== undefined && { peak: peakFromDraft(draft.peak) }),
    ...(draft.tiers.length > 0 && { tiers: draft.tiers.map(tierFromDraft) }),
  };
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

function isRecord(node: unknown): node is Record<string, unknown> {
  return typeof node === "object" && node !== null;
}

/** The editing text of a stored value; strings keep their quotes to round trip. */
function jsonLiteralText(value: JsonValue): string {
  return JSON.stringify(value);
}

/** Text state for one stored peak block. */
function peakDraft(peak: PeakPricing): PeakDraft {
  return {
    cacheRead: rateText(peak.cacheRead),
    cacheWrite: rateText(peak.cacheWrite),
    input: rateText(peak.input),
    output: rateText(peak.output),
    windows: peak.windows.map(windowDraft),
  };
}

/** The submitted peak block; an empty day list means every day. */
function peakFromDraft(draft: PeakDraft): PeakPricing {
  return {
    cacheRead: rateValue(draft.cacheRead),
    cacheWrite: rateValue(draft.cacheWrite),
    input: rateValue(draft.input),
    output: rateValue(draft.output),
    windows: draft.windows.map((window) => ({
      end: window.end,
      start: window.start,
      ...(window.days.length > 0 && { days: window.days }),
    })),
  };
}

function tierDraft(tier: ModelCostTier): CostTierDraft {
  return {
    cacheRead: rateText(tier.cacheRead),
    cacheWrite: rateText(tier.cacheWrite),
    input: rateText(tier.input),
    inputTokensAbove: rateText(tier.inputTokensAbove),
    output: rateText(tier.output),
  };
}

function tierFromDraft(draft: CostTierDraft): ModelCostTier {
  return {
    cacheRead: rateValue(draft.cacheRead),
    cacheWrite: rateValue(draft.cacheWrite),
    input: rateValue(draft.input),
    inputTokensAbove: rateValue(draft.inputTokensAbove),
    output: rateValue(draft.output),
  };
}

function windowDraft(window: TimeWindow): PeakWindowDraft {
  return {
    days: [...(window.days ?? [])],
    end: window.end,
    start: window.start,
  };
}
