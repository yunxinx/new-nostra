import { z } from "zod";

import type {
  AnthropicMessagesCompat,
  CompatBuckets,
  JsonValue,
  OpenaiCompletionsCompat,
  OpenaiResponsesCompat,
} from "@/types/ipc";

import type { ProtocolFamily } from "./compat-fields";

import {
  anthropicMessagesCompatSchema,
  compatBucketsSchema,
  openaiCompletionsCompatSchema,
  openaiResponsesCompatSchema,
} from "../../schemas/compat";
import { jsonValueSchema } from "../../schemas/json";

/**
 * Bucket map as the draft form carries it: the compat schema's own shape,
 * where an absent key and an explicit null both mean "unset". The panel reads
 * and writes this shape; `storedBuckets` narrows it to the wire shape.
 */
export type FormCompatBuckets = z.input<typeof compatBucketsSchema>;

/** One map field's keys, as the wire shape holds them. */
export type MapFields = Record<string, JsonValue>;

/** Result of reading a JSON editor's text: the parsed value or a refusal. */
export type StrictJson = { ok: false } | { ok: true; value: JsonValue };

/** One family's fragment of a form-carried bucket map. */
type FormCompatFragment = Exclude<
  FormCompatBuckets[ProtocolFamily],
  null | undefined
>;

/** The editing text of a JSON field; an unset field opens blank. */
export function formatJsonValue(value: JsonValue | undefined): string {
  return value === undefined ? "" : JSON.stringify(value, null, 2);
}

/**
 * A map field's keys as a plain record: anything that is not an object carries
 * none, and an explicit null entry means "unset" and drops out, the way null
 * reads everywhere else on the wire.
 */
export function mapRecord(value: JsonValue | undefined): MapFields {
  const record: MapFields = {};
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return record;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== null) {
      record[key] = entry;
    }
  }
  return record;
}

/**
 * `inherited` with `own` merged over it, key by key — the mirror of the Rust
 * compat merge (`merge_object`, src-tauri/src/provider/config.rs) used to read
 * a map key's effective value. An explicit null in `own` never clears a key,
 * and a key that is an object on both sides merges instead of replacing; any
 * other pair the overlay wins, which is what the Rust layer does above the
 * recursion. A commit still writes this layer's own fragment.
 */
export function mergeObjectValue(
  inherited: JsonValue | undefined,
  own: JsonValue,
): JsonValue {
  if (!isPlainObject(inherited) || !isPlainObject(own)) {
    return own;
  }
  const merged: MapFields = { ...inherited };
  for (const [key, value] of Object.entries(own)) {
    if (value === null) {
      continue;
    }
    const existing = merged[key];
    merged[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? mergeObjectValue(existing, value)
        : value;
  }
  return merged;
}

/**
 * A family fragment as a plain record; an absent key, an explicit null and a
 * non-JSON value never contribute (null means "unset" on the wire).
 */
export function overrideRecord(
  fragment: FormCompatFragment | undefined,
): Record<string, JsonValue> {
  const record: Record<string, JsonValue> = {};
  if (fragment === undefined) {
    return record;
  }
  for (const [field, value] of Object.entries(fragment)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (isJsonValue(value)) {
      record[field] = value;
    }
  }
  return record;
}

/**
 * A map cell's text as its value: JSON when the text parses, plain text
 * otherwise, so no cell text is ever invalid. Quoting is how a string that
 * looks like JSON keeps its literal form.
 */
export function parseCellText(text: string): JsonValue {
  const parsed = parseStrictJson(text);
  return parsed.ok ? parsed.value : text;
}

/**
 * A JSON editor's text as its value. A refusal keeps the editor's text out of
 * the stored fragment, and a parsed `null` reaches the caller as a value: it
 * means "unset" on the wire, so the caller clears the override with it.
 */
export function parseStrictJson(text: string): StrictJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  const value = jsonValueSchema.safeParse(parsed);
  return value.success ? { ok: true, value: value.data } : { ok: false };
}

/**
 * The wire shape of a form-carried bucket map: explicit nulls and absent keys
 * drop out (both mean "unset"), and an empty map becomes undefined. A fragment
 * that does not match its family's schema drops out as a whole rather than
 * reaching a save the backend would refuse.
 */
export function storedBuckets(
  buckets: FormCompatBuckets | null | undefined,
): CompatBuckets | undefined {
  if (buckets === undefined || buckets === null) {
    return undefined;
  }
  const stored: CompatBuckets = {};
  const anthropic = overrideRecord(buckets["anthropic-messages"]);
  if (hasFields(anthropic) && isStoredAnthropic(anthropic)) {
    stored["anthropic-messages"] = anthropic;
  }
  const completions = overrideRecord(buckets["openai-completions"]);
  if (hasFields(completions) && isStoredCompletions(completions)) {
    stored["openai-completions"] = completions;
  }
  const responses = overrideRecord(buckets["openai-responses"]);
  if (hasFields(responses) && isStoredResponses(responses)) {
    stored["openai-responses"] = responses;
  }
  return hasFields(stored) ? stored : undefined;
}

/**
 * `buckets` with one field of one family set (`value`) or cleared (`null`). An
 * edit that leaves the family empty drops the bucket, and an edit that leaves
 * every family empty returns undefined: an empty fragment is not an override.
 */
export function withCompatOverride(
  buckets: FormCompatBuckets | null | undefined,
  family: ProtocolFamily,
  field: string,
  value: JsonValue | null,
): FormCompatBuckets | undefined {
  const next: FormCompatBuckets = { ...buckets };
  switch (family) {
    case "anthropic-messages": {
      const record = editedRecord(
        overrideRecord(next["anthropic-messages"]),
        field,
        value,
      );
      if (Object.keys(record).length === 0) {
        delete next["anthropic-messages"];
        break;
      }
      if (isStoredAnthropic(record)) {
        next["anthropic-messages"] = record;
      }
      break;
    }
    case "openai-completions": {
      const record = editedRecord(
        overrideRecord(next["openai-completions"]),
        field,
        value,
      );
      if (Object.keys(record).length === 0) {
        delete next["openai-completions"];
        break;
      }
      if (isStoredCompletions(record)) {
        next["openai-completions"] = record;
      }
      break;
    }
    case "openai-responses": {
      const record = editedRecord(
        overrideRecord(next["openai-responses"]),
        field,
        value,
      );
      if (Object.keys(record).length === 0) {
        delete next["openai-responses"];
        break;
      }
      if (isStoredResponses(record)) {
        next["openai-responses"] = record;
      }
      break;
    }
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

function editedRecord(
  record: Record<string, JsonValue>,
  field: string,
  value: JsonValue | null,
): Record<string, JsonValue> {
  if (value === null) {
    return omitField(record, field);
  }
  return { ...record, [field]: value };
}

/** Whether a fragment carries any field at all; an empty one is not set. */
function hasFields(fragment: object): boolean {
  return Object.keys(fragment).length > 0;
}

/** Whether a value is part of the JSON surface a fragment can carry. */
function isJsonValue(value: unknown): value is JsonValue {
  return jsonValueSchema.safeParse(value).success;
}

/** Whether a JSON value is an object the merge can descend into. */
function isPlainObject(value: JsonValue | undefined): value is MapFields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The stored-shape guards narrow a record to the wire type once the family's
// own schema accepts it: the schema proves the JSON shape, and JSON never
// carries an explicit undefined, so the wire type's optional keys hold.

function isStoredAnthropic(value: unknown): value is AnthropicMessagesCompat {
  return anthropicMessagesCompatSchema.safeParse(value).success;
}

function isStoredCompletions(value: unknown): value is OpenaiCompletionsCompat {
  return openaiCompletionsCompatSchema.safeParse(value).success;
}

function isStoredResponses(value: unknown): value is OpenaiResponsesCompat {
  return openaiResponsesCompatSchema.safeParse(value).success;
}

/** A copy without one key: clearing a field drops the key, since null means
 *  "unset" and never reaches the stored fragment. */
function omitField(
  record: Record<string, JsonValue>,
  field: string,
): Record<string, JsonValue> {
  const next: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== field) {
      next[key] = value;
    }
  }
  return next;
}
