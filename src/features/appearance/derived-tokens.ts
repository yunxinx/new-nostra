import {
  deepen,
  distinctSurface,
  MIN_NESTED_SURFACE_CONTRAST,
  MIN_PANE_SURFACE_CONTRAST,
  parseHex,
  type Rgb,
  toHex,
} from "./contrast";

interface ThemePalette {
  background: string;
  muted: string;
  sidebar: string;
  sidebarAccent: string;
}

// Each derived surface with its floor and reference surface. Inputs are the
// palette's preferred values from index.css; the outputs replace them as
// inline CSS variables at theme-apply time (the inline value is the only
// source for --sidebar-selected and --code-header, which have no stylesheet
// value). Base tokens (background/muted/...) are never derived.
//   sidebar         >= 1.35 vs background      (the pane seam)
//   sidebarAccent   >= 1.2  vs derived sidebar  (the row hover tint)
//   sidebarSelected  hover pushed one more >= 1.2 step away (selected row)
//   codeHeader      >= 1.2  vs muted            (the code body it caps)
function deriveTokens(palette: ThemePalette, isDark: boolean) {
  const background = parseHex(palette.background);
  const sidebar = distinctSurface(
    parseHex(palette.sidebar),
    background,
    MIN_PANE_SURFACE_CONTRAST,
    isDark,
  );
  const hover = distinctSurface(
    parseHex(palette.sidebarAccent),
    sidebar,
    MIN_NESTED_SURFACE_CONTRAST,
    isDark,
  );
  const selected = deepen(hover, sidebar, MIN_NESTED_SURFACE_CONTRAST);
  // The header starts at the code body colour and steps away from it
  // until it reads as its own surface; the tie rule gives dark themes a
  // lighter header and light themes a darker one.
  const muted = parseHex(palette.muted);
  const codeHeader: Rgb = distinctSurface(
    muted,
    muted,
    MIN_NESTED_SURFACE_CONTRAST,
    isDark,
  );
  return {
    codeHeader: toHex(codeHeader),
    sidebar: toHex(sidebar),
    sidebarAccent: toHex(hover),
    sidebarSelected: toHex(selected),
  };
}

const DERIVED_PROPERTIES = [
  "--code-header",
  "--sidebar",
  "--sidebar-accent",
  "--sidebar-selected",
] as const;

// Reads the palette from the active theme's CSS variables and overrides the
// derived tokens on the document element. Inline values written by a
// previous application beat the stylesheet's theme-scoped values, so they
// are cleared before reading; idempotent under repeated application.
export function applyDerivedTokens(): void {
  const documentStyle = document.documentElement.style;
  for (const property of DERIVED_PROPERTIES) {
    documentStyle.removeProperty(property);
  }
  const palette: ThemePalette = {
    background: readToken("--background"),
    muted: readToken("--muted"),
    sidebar: readToken("--sidebar"),
    sidebarAccent: readToken("--sidebar-accent"),
  };
  const isDark = document.documentElement.classList.contains("dark");
  const derived = deriveTokens(palette, isDark);
  documentStyle.setProperty("--sidebar", derived.sidebar);
  documentStyle.setProperty("--sidebar-accent", derived.sidebarAccent);
  documentStyle.setProperty("--sidebar-selected", derived.sidebarSelected);
  documentStyle.setProperty("--code-header", derived.codeHeader);
}

function readToken(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}
