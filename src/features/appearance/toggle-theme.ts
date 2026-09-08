import { useUiStore } from "@/stores/ui-store";

import { setThemeMode } from "./set-theme-mode";

// Flips light/dark; while following the system, the flip targets the
// opposite of the current system appearance.
export function toggleTheme(): void {
  const { themeOverride } = useUiStore.getState();
  const isDark =
    themeOverride === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : themeOverride === "dark";
  setThemeMode(isDark ? "light" : "dark");
}
