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

// Reads the palette from the theme rules in the stylesheets rather than the
// computed style of the document element: during a theme transition the
// computed values are interpolating, and the derived surfaces must be
// computed from the target theme's exact palette. Stylesheet reads do not
// force a style recalc, so the class flip and the inline derived writes
// stay in a single style-change event and transition together.
export function applyDerivedTokens(): void {
  const isDark = document.documentElement.classList.contains("dark");
  const palette: ThemePalette = {
    background: readToken("--background", isDark),
    muted: readToken("--muted", isDark),
    sidebar: readToken("--sidebar", isDark),
    sidebarAccent: readToken("--sidebar-accent", isDark),
  };
  const derived = deriveTokens(palette, isDark);
  const documentStyle = document.documentElement.style;
  documentStyle.setProperty("--sidebar", derived.sidebar);
  documentStyle.setProperty("--sidebar-accent", derived.sidebarAccent);
  documentStyle.setProperty("--sidebar-selected", derived.sidebarSelected);
  documentStyle.setProperty("--code-header", derived.codeHeader);
}

function* collectStyleRules(
  rules: CSSRuleList,
): Generator<CSSStyleRule, void, undefined> {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      yield rule;
    } else if ("cssRules" in rule) {
      yield* collectStyleRules((rule as { cssRules: CSSRuleList }).cssRules);
    }
  }
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

/** Reads a token from the `:root` (light) or `.dark` (dark) style rules. */
function readToken(name: string, isDark: boolean): string {
  const selector = isDark ? ".dark" : ":root";
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of collectStyleRules(sheet.cssRules)) {
      const selectors = rule.selectorText
        .split(",")
        .map((value) => value.trim());
      if (selectors.includes(selector)) {
        const value = rule.style.getPropertyValue(name);
        if (value !== "") {
          return value.trim();
        }
      }
    }
  }
  return "";
}
