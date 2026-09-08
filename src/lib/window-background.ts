import { useUiStore } from "@/stores/ui-store";

// Mirrors the --background token values in src/index.css (Neutral Light /
// Nostra Dark): the native window and WKWebView layers need plain hex colors
// before CSS is parsed. tauri.conf.json ships the dark value as the pre-JS
// static fallback, so light-theme windows rely on the dynamic path to avoid
// flashing the wrong color.
const LIGHT_BACKGROUND = "#ffffff";
const DARK_BACKGROUND = "#22272e";

// Snapshot of the effective theme (override, else system) at call time; a
// theme change right after the call is not reflected.
export function resolveWindowBackground(): string {
  const { themeOverride } = useUiStore.getState();
  const isDark =
    themeOverride === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : themeOverride === "dark";
  return windowBackgroundFor(isDark);
}

export function windowBackgroundFor(isDark: boolean): string {
  return isDark ? DARK_BACKGROUND : LIGHT_BACKGROUND;
}
