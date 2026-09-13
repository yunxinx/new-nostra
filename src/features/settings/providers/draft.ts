import type { FieldErrors } from "react-hook-form";
import type { z } from "zod";

import type {
  ModelEntry,
  Provider,
  ProviderDraft,
  ProviderPreset,
} from "@/types/ipc";

import { isDeepEqual } from "@/lib/deep-equal";

import type { KeyValueRow } from "../components/KeyValueEditor";

import { storedBuckets } from "../components/compat/compat-values";
import { providerDraftSchema } from "../schemas/provider";

/** Errors of the model directory, keyed by row position. */
export type ModelErrors = NonNullable<
  FieldErrors<ProviderFormValues>["models"]
>;

/** Errors of one model row, as the resolver reports them under `models.N`. */
export type ModelRowErrors = ModelErrors[number];

/** One top-level key of the document the draft form edits. */
export type ProviderDraftField = keyof ProviderFormValues;

/**
 * Parsed form values, as the zod resolver hands them to the submit handler.
 * Optionals are `| undefined` here because the Rust decode fills the same keys
 * with its documented defaults.
 */
export type ProviderFormSubmission = z.output<typeof providerDraftSchema>;

/** Form values as react-hook-form carries them; absent keys stay optional. */
export type ProviderFormValues = z.input<typeof providerDraftSchema>;

/**
 * Blank create draft. The defaults mirror the Rust `ProviderConfig` serde
 * defaults, so a field the user never touches stores the value a missing key
 * would decode to.
 */
export const BLANK_PROVIDER_DRAFT: ProviderDraft = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "",
  baseUrl: "",
  enabled: true,
  maxRetries: 2,
  name: "",
  reasoningOutput: "auto",
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 120_000,
};

/**
 * The base URL a blank create stores. The write layer takes neither a blank
 * name nor a blank base URL, and this is the canonical endpoint of the blank
 * draft's default protocol.
 */
const BLANK_CREATE_BASE_URL = "https://api.openai.com/v1";

/**
 * The create payload of a blank provider: the form defaults carry neither a
 * name nor a base URL, so the caller supplies a free name and the default
 * protocol's canonical endpoint. Both are the user's to edit once the row
 * exists.
 */
export function blankCreateDraft(name: string): ProviderDraft {
  return { ...BLANK_PROVIDER_DRAFT, baseUrl: BLANK_CREATE_BASE_URL, name };
}

/**
 * The keys the form has moved away from the stored document's values. The
 * comparison is over values, not over edits: a switch turned off and back on
 * leaves nothing changed, and a map or list left empty counts as the absent
 * key it decodes to. The count is what the footer reports and the single
 * field's restore is what the rows offer, so both have to agree with what a
 * save would actually write.
 */
export function changedDraftFields(
  baseline: ProviderDraft,
  models: ModelEntry[],
  values: ProviderFormValues,
): ReadonlySet<ProviderDraftField> {
  const stored = toFormValues(baseline);
  const current: ProviderFormValues = { ...values, models };
  const changed = new Set<ProviderDraftField>();
  for (const key of new Set<ProviderDraftField>([
    ...(Object.keys(stored) as ProviderDraftField[]),
    ...(Object.keys(current) as ProviderDraftField[]),
  ])) {
    const isSame =
      key === "compat"
        ? isDeepEqual(
            storedBuckets(stored.compat),
            storedBuckets(current.compat),
          )
        : isSameValue(stored[key], current[key]);
    if (!isSame) {
      changed.add(key);
    }
  }
  return changed;
}

/**
 * A name no stored provider holds: `base`, or `base` with the lowest free
 * numeric suffix once it is taken. Comparison is exact, the same semantics the
 * write layer's name rule has, so a free-looking name is never refused.
 */
export function freeProviderName(
  base: string,
  taken: readonly string[],
): string {
  if (!taken.includes(base)) {
    return base;
  }
  let index = 2;
  while (taken.includes(`${base} ${String(index)}`)) {
    index += 1;
  }
  return `${base} ${String(index)}`;
}

/** The header map to submit: rows whose key is blank are dropped. */
export function headerRecord(rows: KeyValueRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.trim() === "") {
      continue;
    }
    record[row.key] = row.value;
  }
  return record;
}

/** Editor rows for a stored header map; an absent map yields no rows. */
export function headerRows(
  headers: Record<string, string> | undefined,
): KeyValueRow[] {
  return Object.entries(headers ?? {}).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value,
  }));
}

/**
 * The create payload of a preset: the vendor's values over the blank defaults,
 * which keep the key and the operating parameters blank. The caller owns the
 * stored name, so a preset whose name is taken is stored under a numbered one
 * instead of being refused.
 */
export function presetDraft(preset: ProviderPreset): ProviderDraft {
  return {
    ...BLANK_PROVIDER_DRAFT,
    api: preset.api,
    baseUrl: preset.baseUrl,
    name: preset.name,
    ...(Object.keys(preset.compat).length > 0 && { compat: preset.compat }),
    ...(Object.keys(preset.headers).length > 0 && { headers: preset.headers }),
    ...(preset.models.length > 0 && { models: preset.models }),
  };
}

/** The full-replace payload of a stored provider, ready to be edited. */
export function providerToDraft(provider: Provider): ProviderDraft {
  return {
    abortOnDisconnect: provider.abortOnDisconnect,
    api: provider.api,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    maxRetries: provider.maxRetries,
    name: provider.name,
    reasoningOutput: provider.reasoningOutput,
    requestTimeoutMs: provider.requestTimeoutMs,
    streamIdleTimeoutMs: provider.streamIdleTimeoutMs,
    // Absent optional keys stay absent: the stored document's semantics are
    // "missing key keeps the default", and an explicit `undefined` would add
    // nothing.
    ...(provider.compat !== undefined && { compat: provider.compat }),
    ...(provider.headers !== undefined && { headers: provider.headers }),
    ...(provider.models !== undefined && { models: provider.models }),
  };
}

/** The draft form's slice of a provider document: the registered fields plus
 *  the compat map and the model rows, which their own components edit. */
export function toFormValues(draft: ProviderDraft): ProviderFormValues {
  return {
    abortOnDisconnect: draft.abortOnDisconnect,
    api: draft.api,
    apiKey: draft.apiKey,
    baseUrl: draft.baseUrl,
    enabled: draft.enabled,
    maxRetries: draft.maxRetries,
    models: draft.models ?? [],
    name: draft.name,
    reasoningOutput: draft.reasoningOutput,
    requestTimeoutMs: draft.requestTimeoutMs,
    streamIdleTimeoutMs: draft.streamIdleTimeoutMs,
    ...(draft.compat !== undefined && { compat: draft.compat }),
    ...(draft.headers !== undefined && { headers: draft.headers }),
  };
}

/**
 * The wire draft of a save. Form-owned keys come from the parsed values; the
 * model directory comes from the form rows the controller holds — the rows the
 * user never touched keep their keys (a model's compat overrides included).
 * The compat map is narrowed back to its wire shape, where an explicit null and
 * an absent key both mean "unset". An empty model list submits no key, which
 * the repo reads as "no models".
 */
export function toProviderDraft(
  values: ProviderFormSubmission,
  models: ModelEntry[],
): ProviderDraft {
  const compat = storedBuckets(values.compat);
  return {
    abortOnDisconnect:
      values.abortOnDisconnect ?? BLANK_PROVIDER_DRAFT.abortOnDisconnect,
    api: values.api,
    apiKey: values.apiKey ?? BLANK_PROVIDER_DRAFT.apiKey,
    baseUrl: values.baseUrl,
    enabled: values.enabled ?? BLANK_PROVIDER_DRAFT.enabled,
    maxRetries: values.maxRetries ?? BLANK_PROVIDER_DRAFT.maxRetries,
    name: values.name,
    reasoningOutput:
      values.reasoningOutput ?? BLANK_PROVIDER_DRAFT.reasoningOutput,
    requestTimeoutMs:
      values.requestTimeoutMs ?? BLANK_PROVIDER_DRAFT.requestTimeoutMs,
    streamIdleTimeoutMs:
      values.streamIdleTimeoutMs ?? BLANK_PROVIDER_DRAFT.streamIdleTimeoutMs,
    ...(compat !== undefined && { compat }),
    ...(values.headers !== undefined && { headers: values.headers }),
    ...(models.length > 0 && { models }),
  };
}

/** Whether the value is one a save would leave out: unset, or empty. */
function isBlankValue(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object" && value !== null) {
    return Object.keys(value).length === 0;
  }
  return false;
}

/** Whether two stored values write the same thing, blank keys included. */
function isSameValue(left: unknown, right: unknown): boolean {
  if (isBlankValue(left) && isBlankValue(right)) {
    return true;
  }
  return isDeepEqual(left, right);
}
