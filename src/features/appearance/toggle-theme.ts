import { emit } from "@tauri-apps/api/event";

import { useUiStore } from "@/stores/ui-store";

// Flips light/dark; while following the system, the flip targets the
// opposite of the current system appearance. Broadcasts the new override so
// the other window applies the same theme; the local listener receives it
// too and re-applies the same value (idempotent).
export function toggleTheme(): void {
  const { setThemeOverride, themeOverride } = useUiStore.getState();
  const isDark =
    themeOverride === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : themeOverride === "dark";
  const override = isDark ? "light" : "dark";
  setThemeOverride(override);
  void emit("ui://theme-changed", { override });
}
