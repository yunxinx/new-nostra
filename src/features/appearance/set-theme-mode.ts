import { emit } from "@tauri-apps/api/event";

import { PREFERENCE_KEYS, setPreference } from "@/lib/ipc/preferences";
import { type ThemeOverride, useUiStore } from "@/stores/ui-store";

/**
 * Single entry point for explicit theme-mode changes: applies the override,
 * persists it, and broadcasts it so every window follows (the local listener
 * re-applies the same value idempotently).
 */
export function setThemeMode(override: ThemeOverride): void {
  useUiStore.getState().setThemeOverride(override);
  void setPreference(PREFERENCE_KEYS.themeOverride, override);
  void emit("ui://theme-changed", { override });
}
