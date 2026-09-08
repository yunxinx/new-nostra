import { describe, expect, it } from "vitest";

import {
  deepen,
  distinctSurface,
  hexToHsl,
  hslToHex,
  MIN_NESTED_SURFACE_CONTRAST,
  MIN_OUTLINE_CONTRAST,
  MIN_PANE_SURFACE_CONTRAST,
  parseHex,
  ratio,
  type Rgb,
  toHex,
} from "./contrast";

// The two shipped palettes (index.css). Base tokens are hand-final values;
// only the derived surfaces move with the engine, so these assertions pin
// the derivations to the palettes they actually run against.
const LIGHT_PALETTE = {
  background: "#ffffff",
  muted: "#f5f5f5",
  sidebar: "#fafafa",
  sidebarAccent: "#e5e5e5",
};

const DARK_PALETTE = {
  background: "#22272e",
  muted: "#2d333b",
  sidebar: "#2d333b",
  sidebarAccent: "#373e47",
};

// A floor is only reachable while there is lightness left to spend: at
// black or white the derivation returns the best it can instead of
// looping forever.
function clearsOrIsClamped(
  reads: number,
  derived: Rgb,
  floor: number,
): boolean {
  const lightness = hexToHsl(toHex(derived)).l;
  return reads >= floor || lightness === 0 || lightness === 1;
}

function derivedSidebar(
  palette: typeof DARK_PALETTE | typeof LIGHT_PALETTE,
  isDark: boolean,
): Rgb {
  return distinctSurface(
    parseHex(palette.sidebar),
    parseHex(palette.background),
    MIN_PANE_SURFACE_CONTRAST,
    isDark,
  );
}

describe("parseHex", () => {
  it.each([
    ["#fff", { b: 255, g: 255, r: 255 }],
    [" #aBc ", { b: 204, g: 187, r: 170 }],
    ["#22272e", { b: 46, g: 39, r: 34 }],
  ])("reads opaque CSS hex color %s", (input, expected) => {
    expect(parseHex(input)).toEqual(expected);
  });

  it.each(["#ff", "#ffff", "#ggg", "#ffffff00", ""])(
    "rejects unsupported color %s",
    (input) => {
      expect(() => parseHex(input)).toThrow();
    },
  );
});

describe("ratio", () => {
  it("is 1 for identical colours and 21 for black against white", () => {
    const gray = parseHex("#444c56");
    expect(ratio(gray, gray)).toBe(1);
    expect(ratio(parseHex("#000000"), parseHex("#ffffff"))).toBeCloseTo(21, 6);
  });

  it("is symmetric and matches a known WCAG value", () => {
    const gray = parseHex("#777777");
    const white = parseHex("#ffffff");
    expect(ratio(gray, white)).toBeCloseTo(ratio(white, gray), 10);
    // #777777 on white is the documented 4.48:1 example.
    expect(ratio(gray, white)).toBeCloseTo(4.48, 2);
  });
});

describe("distinctSurface", () => {
  it("keeps a preferred colour that already clears the floor untouched", () => {
    const preferred = parseHex("#444c56");
    const reference = parseHex("#2d333b");
    expect(ratio(preferred, reference)).toBeGreaterThanOrEqual(
      MIN_NESTED_SURFACE_CONTRAST,
    );
    expect(toHex(distinctSurface(preferred, reference, 1.2, true))).toBe(
      "#444c56",
    );
  });

  it("steps the light-theme sidebar away from the pane until the seam clears", () => {
    const sidebar = derivedSidebar(LIGHT_PALETTE, false);
    expect(
      ratio(sidebar, parseHex(LIGHT_PALETTE.background)),
    ).toBeGreaterThanOrEqual(MIN_PANE_SURFACE_CONTRAST);
    expect(hexToHsl(toHex(sidebar)).l).toBeLessThan(
      hexToHsl(LIGHT_PALETTE.sidebar).l,
    );
  });

  it("stops on the minimal step that clears the floor, not further", () => {
    const reference = parseHex("#ffffff");
    const derived = distinctSurface(
      parseHex(LIGHT_PALETTE.sidebar),
      reference,
      MIN_PANE_SURFACE_CONTRAST,
      false,
    );
    const derivedHsl = hexToHsl(toHex(derived));
    const oneStepShort = parseHex(
      hslToHex({ ...derivedHsl, l: derivedHsl.l + 0.01 }),
    );
    expect(ratio(oneStepShort, reference)).toBeLessThan(
      MIN_PANE_SURFACE_CONTRAST,
    );
  });

  it("breaks a lightness tie by lightening dark themes and darkening light ones", () => {
    const same = parseHex("#808080");
    const reference = parseHex("#808080");
    const darkResult = distinctSurface(same, reference, 1.5, true);
    const lightResult = distinctSurface(same, reference, 1.5, false);
    expect(hexToHsl(toHex(darkResult)).l).toBeGreaterThan(
      hexToHsl("#808080").l,
    );
    expect(hexToHsl(toHex(lightResult)).l).toBeLessThan(hexToHsl("#808080").l);
  });

  it("terminates and clamps when no lightness can clear an unreachable floor", () => {
    const gray = parseHex("#808080");
    const reference = parseHex("#808080");
    const light = distinctSurface(gray, reference, 30, false);
    const dark = distinctSurface(gray, reference, 30, true);
    expect(hexToHsl(toHex(light)).l).toBe(0);
    expect(hexToHsl(toHex(dark)).l).toBe(1);
  });
});

describe("deepen", () => {
  it("pushes a tint further from the surface it already sits away from", () => {
    const surface = parseHex(DARK_PALETTE.sidebar);
    const tint = distinctSurface(
      parseHex(DARK_PALETTE.sidebarAccent),
      surface,
      MIN_NESTED_SURFACE_CONTRAST,
      true,
    );
    const deeper = deepen(tint, surface, MIN_NESTED_SURFACE_CONTRAST);
    expect(ratio(deeper, tint)).toBeGreaterThanOrEqual(
      MIN_NESTED_SURFACE_CONTRAST,
    );
    expect(hexToHsl(toHex(deeper)).l).toBeGreaterThan(hexToHsl(toHex(tint)).l);
  });
});

describe("derived surfaces for both shipped palettes", () => {
  const cases = [
    { isDark: false, name: "light", palette: LIGHT_PALETTE },
    { isDark: true, name: "dark", palette: DARK_PALETTE },
  ] as const;

  it.each(cases)(
    "holds the pane seam floor for the $name sidebar",
    ({ isDark, palette }) => {
      const sidebar = derivedSidebar(palette, isDark);
      expect(
        ratio(sidebar, parseHex(palette.background)),
      ).toBeGreaterThanOrEqual(MIN_PANE_SURFACE_CONTRAST);
    },
  );

  it.each(cases)(
    "keeps hover and selected apart from the panel and from each other ($name)",
    ({ isDark, palette }) => {
      const sidebar = derivedSidebar(palette, isDark);
      const hover = distinctSurface(
        parseHex(palette.sidebarAccent),
        sidebar,
        MIN_NESTED_SURFACE_CONTRAST,
        isDark,
      );
      const selected = deepen(hover, sidebar, MIN_NESTED_SURFACE_CONTRAST);
      const hoverReads = ratio(hover, sidebar);
      const selectedReads = ratio(selected, sidebar);
      expect(
        clearsOrIsClamped(hoverReads, hover, MIN_NESTED_SURFACE_CONTRAST),
      ).toBe(true);
      // Selection must sit further from the panel than hover, or pointing
      // at a row looks the same as having it open.
      expect(selectedReads).toBeGreaterThan(hoverReads);
      expect(
        clearsOrIsClamped(
          ratio(selected, hover),
          selected,
          MIN_NESTED_SURFACE_CONTRAST,
        ),
      ).toBe(true);
    },
  );

  it.each(cases)(
    "holds the nested floor between the code header and the code body ($name)",
    ({ isDark, palette }) => {
      const muted = parseHex(palette.muted);
      const codeHeader = distinctSurface(
        muted,
        muted,
        MIN_NESTED_SURFACE_CONTRAST,
        isDark,
      );
      expect(
        clearsOrIsClamped(
          ratio(codeHeader, muted),
          codeHeader,
          MIN_NESTED_SURFACE_CONTRAST,
        ),
      ).toBe(true);
      // The header starts at the body colour, so the direction is the tie
      // rule: dark themes lighten, light themes darken.
      const codeHeaderLightness = hexToHsl(toHex(codeHeader)).l;
      expect(
        isDark
          ? codeHeaderLightness > hexToHsl(palette.muted).l
          : codeHeaderLightness < hexToHsl(palette.muted).l,
      ).toBe(true);
    },
  );

  it("exports the outline floor at the old project's value", () => {
    expect(MIN_OUTLINE_CONTRAST).toBe(1.5);
  });
});
