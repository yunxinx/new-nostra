// Timeouts are stored in whole milliseconds and edited in seconds: the field
// a user reaches for is "how many seconds", while the wire contract and the
// Rust decode both count milliseconds. The conversion lives here so the form
// is the only place the two units meet.

/**
 * The stored millisecond value of a seconds text, rounded to whole
 * milliseconds. Blank and unparsable text both yield `NaN`, which the draft
 * schema reports as an invalid field rather than silently storing a default.
 */
export function msFromSecondsText(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? Number.NaN : Math.round(Number(trimmed) * 1000);
}

/** Editing text in seconds for a stored millisecond value; unset reads blank. */
export function secondsText(ms: number | undefined): string {
  return ms === undefined || Number.isNaN(ms) ? "" : String(ms / 1000);
}
