import { describe, expect, it } from "vitest";

import { msFromSecondsText, secondsText } from "./duration";

describe("secondsText", () => {
  it("shows whole seconds without a fraction", () => {
    expect(secondsText(120_000)).toBe("120");
    expect(secondsText(1_000)).toBe("1");
  });

  it("keeps sub-second precision down to the millisecond", () => {
    expect(secondsText(1_500)).toBe("1.5");
    expect(secondsText(1_001)).toBe("1.001");
    expect(secondsText(59_999)).toBe("59.999");
  });

  it("reads an unset or unusable value as blank", () => {
    expect(secondsText(undefined)).toBe("");
    expect(secondsText(Number.NaN)).toBe("");
  });
});

describe("msFromSecondsText", () => {
  it("converts seconds text to whole milliseconds", () => {
    expect(msFromSecondsText("120")).toBe(120_000);
    expect(msFromSecondsText("1.25")).toBe(1_250);
    expect(msFromSecondsText(" 2.5 ")).toBe(2_500);
  });

  it("rounds past the millisecond instead of storing a fraction", () => {
    expect(msFromSecondsText("1.0004")).toBe(1_000);
    expect(msFromSecondsText("1.0005")).toBe(1_001);
  });

  it("refuses blank and unparsable text rather than defaulting", () => {
    expect(msFromSecondsText("")).toBeNaN();
    expect(msFromSecondsText("   ")).toBeNaN();
    expect(msFromSecondsText("abc")).toBeNaN();
  });

  it("round-trips every value the schema accepts", () => {
    for (const ms of [1_000, 1_001, 42_500, 599_999, 600_000]) {
      expect(msFromSecondsText(secondsText(ms))).toBe(ms);
    }
  });
});
