/**
 * Whether two decoded values carry the same content. Used where a value is
 * compared against the one it was loaded from, so "has this changed" is a
 * question about what a save would write rather than about what was typed.
 */
export function isDeepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    ) {
      return false;
    }
    return left.every((entry, index) => isDeepEqual(entry, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  if (keys.length !== Object.keys(rightRecord).length) {
    return false;
  }
  return keys.every(
    (key) =>
      Object.hasOwn(rightRecord, key) &&
      isDeepEqual(leftRecord[key], rightRecord[key]),
  );
}
