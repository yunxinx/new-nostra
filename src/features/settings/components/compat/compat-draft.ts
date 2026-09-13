import type { CompatBuckets, JsonValue, ResolvedCompat } from "@/types/ipc";

import { isDeepEqual } from "@/lib/deep-equal";
import { changedValueCount } from "@/lib/draft-values";

import {
  type CompatFieldDescriptor,
  compatFieldsFor,
  knownCompatFamilies,
  type ProtocolFamily,
} from "./compat-fields";
import {
  overrideRecord,
  storedBuckets,
  withCompatOverride,
} from "./compat-values";

export interface CompatInputDraft {
  isInvalid: boolean;
  text: string;
}

export type CompatInputDrafts = Partial<
  Record<ProtocolFamily, Record<string, CompatInputDraft>>
>;

export function canonicalCompatValue(
  kind: CompatFieldDescriptor["kind"],
  value: JsonValue | null,
  baseline: JsonValue | undefined,
  fallback: JsonValue | undefined,
): JsonValue | null {
  if (value === null || isDeepEqual(value, baseline)) return value;
  // An unset switch displays as off; returning to that display must not pin false.
  const inherited = kind === "switch" ? fallback === true : fallback;
  return changedValueCount(inherited, value) === 0 ? null : value;
}

export function changedCompatCount(
  baseline: CompatBuckets | undefined,
  value: CompatBuckets | undefined,
  inputs: CompatInputDrafts,
): number {
  const families = new Set([
    ...Object.keys(baseline ?? {}),
    ...Object.keys(value ?? {}),
    ...Object.keys(inputs),
  ]);
  let count = 0;
  for (const family of knownCompatFamilies([...families])) {
    const before = overrideRecord(baseline?.[family]);
    const after = overrideRecord(value?.[family]);
    const fields = new Set([
      ...Object.keys(before),
      ...Object.keys(after),
      ...Object.keys(inputs[family] ?? {}),
    ]);
    for (const field of fields) {
      count += inputs[family]?.[field]?.isInvalid
        ? 1
        : changedValueCount(before[field], after[field]);
    }
  }
  return count;
}

export function hasCustomCompat(
  compat: CompatBuckets | undefined,
  defaults: Partial<Record<ProtocolFamily, ResolvedCompat>>,
): boolean {
  return knownCompatFamilies(Object.keys(compat ?? {})).some((family) => {
    const bucket = overrideRecord(compat?.[family]);
    const resolved = defaults[family];
    return (
      resolved !== undefined &&
      compatFieldsFor(family).some((field) => {
        const value = bucket[field.name];
        return (
          value !== undefined &&
          canonicalCompatValue(
            field.kind,
            value,
            undefined,
            resolved.values[field.name],
          ) !== null
        );
      })
    );
  });
}

export function hasInvalidCompatInputs(inputs: CompatInputDrafts): boolean {
  return Object.values(inputs).some((fields) =>
    Object.values(fields).some((input) => input.isInvalid),
  );
}

export function restoreCompatDefaults(
  baseline: CompatBuckets | undefined,
  defaults: Partial<Record<ProtocolFamily, ResolvedCompat>>,
): CompatBuckets | undefined {
  let result = baseline;
  for (const family of knownCompatFamilies(Object.keys(baseline ?? {}))) {
    const resolved = defaults[family];
    if (resolved === undefined) continue;
    const bucket = overrideRecord(baseline?.[family]);
    for (const field of compatFieldsFor(family)) {
      const value = bucket[field.name];
      // Saved overrides already showing the default remain unchanged.
      if (
        value !== undefined &&
        canonicalCompatValue(
          field.kind,
          value,
          undefined,
          resolved.values[field.name],
        ) !== null
      ) {
        result = storedBuckets(
          withCompatOverride(result, family, field.name, null),
        );
      }
    }
  }
  return result;
}

export function withCompatInput(
  inputs: CompatInputDrafts,
  family: ProtocolFamily,
  field: string,
  input: CompatInputDraft | undefined,
): CompatInputDrafts {
  const fields = { ...inputs[family] };
  if (input === undefined) Reflect.deleteProperty(fields, field);
  else fields[field] = input;
  const next = { ...inputs };
  if (Object.keys(fields).length === 0) Reflect.deleteProperty(next, family);
  else next[family] = fields;
  return next;
}
