import { isDeepEqual } from "./deep-equal";

export function changedValueCount(baseline: unknown, value: unknown): number {
  if (isDeepEqual(baseline, value)) return 0;
  if (isRecord(baseline) || isRecord(value)) {
    const before = isRecord(baseline) ? baseline : {};
    const after = isRecord(value) ? value : {};
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].reduce(
      (count, key) => count + changedValueCount(before[key], after[key]),
      0,
    );
  }
  if (
    (baseline === undefined && Array.isArray(value) && value.length === 0) ||
    (value === undefined && Array.isArray(baseline) && baseline.length === 0)
  )
    return 0;
  return 1;
}

export function mergeSavedFields<T extends object>(
  submitted: T,
  current: T,
  saved: T,
): T {
  const next = { ...saved };
  const keys = new Set([
    ...Object.keys(submitted),
    ...Object.keys(current),
  ]) as Set<keyof T>;
  for (const key of keys) {
    if (!isDeepEqual(current[key], submitted[key])) {
      if (Object.hasOwn(current, key)) next[key] = current[key];
      else Reflect.deleteProperty(next, key);
    }
  }
  return next;
}

export function restoreField<T extends object>(
  current: T,
  baseline: T,
  key: keyof T,
): T {
  const next = { ...current };
  if (Object.hasOwn(baseline, key)) next[key] = baseline[key];
  else Reflect.deleteProperty(next, key);
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
