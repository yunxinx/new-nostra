// Contrast floors for colour pairs a palette cannot be trusted to get
// right on its own: the palette does not know which of its colours this
// app puts next to each other. Where a layout relies on two colours being
// *told apart* — the sidebar seam, a row tint, a code-block header — the
// pairing is this app's decision, so the floor lives here. Every helper
// keeps the preferred colour when it already clears the floor and only
// nudges HSL lightness otherwise, so a palette's character survives.

// Smallest ratio at which a block nested on a panel (a row tint, a bubble,
// a code header) still reads as its own surface.
export const MIN_NESTED_SURFACE_CONTRAST = 1.2;
// Floor for the seam between the sidebar and the conversation pane. Higher
// than a nested block: a nested block has shape and padding to help, while
// two full-height panes give the eye nothing but the seam.
export const MIN_PANE_SURFACE_CONTRAST = 1.35;
// Floor for an outline that carries meaning (an error card's edge). A
// hairline covers far fewer pixels than a fill, so it needs the most of
// the three.
export const MIN_OUTLINE_CONTRAST = 1.5;

export interface Rgb {
  b: number;
  g: number;
  r: number;
}

interface Hsl {
  h: number;
  l: number;
  s: number;
}

// Push `tint` further from `surface` — in the direction `tint` already
// sits in — until it clears `floor` against the tint it replaces (hover,
// not the panel). Selected must keep moving outward from the panel instead
// of walking back across it, which is what distinctSurface with the tint
// as its own reference would do.
export function deepen(tint: Rgb, surface: Rgb, floor: number): Rgb {
  const tintHsl = rgbToHsl(tint);
  const step = tintHsl.l >= rgbToHsl(surface).l ? 0.01 : -0.01;
  let deeper = tintHsl;
  while (ratio(hslToRgb(deeper), tint) < floor) {
    const next = Math.min(1, Math.max(0, deeper.l + step));
    if (next === deeper.l) {
      break;
    }
    deeper = { ...deeper, l: next };
  }
  return hslToRgb(deeper);
}

// Keep `preferred` if it already stands apart from `reference`, otherwise
// walk its lightness *away from `reference`* until it clears `floor`.
// Away from the reference, not toward a palette extreme: a tint derived
// from another tint (a selection built on a hover) can sit on either side
// of what it is measured against, and stepping the wrong way walks back
// through it. A lightness tie breaks toward the room the palette leaves:
// dark themes lighten, light themes darken.
export function distinctSurface(
  preferred: Rgb,
  reference: Rgb,
  floor: number,
  isDark: boolean,
): Rgb {
  if (ratio(preferred, reference) >= floor) {
    return preferred;
  }

  const preferredHsl = rgbToHsl(preferred);
  const referenceLightness = rgbToHsl(reference).l;
  const lighter =
    preferredHsl.l === referenceLightness
      ? isDark
      : preferredHsl.l > referenceLightness;
  const step = lighter ? 0.01 : -0.01;
  let candidate = preferredHsl;
  while (ratio(hslToRgb(candidate), reference) < floor) {
    const next = Math.min(1, Math.max(0, candidate.l + step));
    if (next === candidate.l) {
      // Clamped at black or white: the floor is unreachable, keep the
      // best reachable colour instead of looping forever.
      break;
    }
    candidate = { ...candidate, l: next };
  }
  return hslToRgb(candidate);
}

export function hexToHsl(hex: string): Hsl {
  return rgbToHsl(parseHex(hex));
}

export function hslToHex(hsl: Hsl): string {
  return toHex(hslToRgb(hsl));
}

export function parseHex(hex: string): Rgb {
  const value = hex.trim().replace(/^#/, "");
  if (!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
    throw new Error(`expected a #rgb or #rrggbb colour, got "${hex}"`);
  }
  const expanded = value.length === 3 ? value.replaceAll(/./g, "$&$&") : value;
  return {
    b: Number.parseInt(expanded.slice(4, 6), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    r: Number.parseInt(expanded.slice(0, 2), 16),
  };
}

// WCAG relative-luminance contrast ratio, from 1.0 (identical) upwards.
export function ratio(a: Rgb, b: Rgb): number {
  const luminanceA = luminance(a);
  const luminanceB = luminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function toHex({ b, g, r }: Rgb): string {
  const channel = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function hslToRgb({ h, l, s }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const sector = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((sector % 2) - 1));
  const [rn, gn, bn] =
    sector < 1
      ? [c, x, 0]
      : sector < 2
        ? [x, c, 0]
        : sector < 3
          ? [0, c, x]
          : sector < 4
            ? [0, x, c]
            : sector < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return {
    b: Math.round((bn + m) * 255),
    g: Math.round((gn + m) * 255),
    r: Math.round((rn + m) * 255),
  };
}

function luminance({ b, g, r }: Rgb): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function rgbToHsl({ b, g, r }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    h =
      max === rn
        ? (gn - bn) / delta
        : max === gn
          ? 2 + (bn - rn) / delta
          : 4 + (rn - gn) / delta;
    h = (h * 60 + 360) % 360;
  }
  return { h, l, s };
}
