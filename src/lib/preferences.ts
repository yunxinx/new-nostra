import i18next from "i18next";

import type { Language } from "@/lib/i18n";

import {
  getPreference,
  PREFERENCE_KEYS,
  type PreferenceKey,
} from "@/lib/ipc/preferences";
import { type ThemeOverride, useUiStore } from "@/stores/ui-store";

const THEME_OVERRIDES = ["dark", "light", "system"] as const;

/**
 * Restores the persisted theme and language into the window before its first
 * render, so the first visible frame is already correct (both windows are
 * created hidden and revealed after mount). Runs once per window entry;
 * absent or invalid values keep the defaults.
 */
export async function hydrateSharedPreferences(): Promise<void> {
  const [themeOverride, language] = await Promise.all([
    readPreference(PREFERENCE_KEYS.themeOverride),
    readPreference(PREFERENCE_KEYS.language),
  ]);
  if (isThemeOverride(themeOverride)) {
    useUiStore.getState().setThemeOverride(themeOverride);
  }
  if (isLanguage(language)) {
    await i18next.changeLanguage(language);
  }
}

/**
 * Restores the persisted sidebar geometry into the ui store (main window
 * only); width passes through the store's 220..440 clamp.
 */
export async function hydrateSidebarGeometry(): Promise<void> {
  const [width, collapsed] = await Promise.all([
    readPreference(PREFERENCE_KEYS.sidebarWidth),
    readPreference(PREFERENCE_KEYS.sidebarCollapsed),
  ]);
  if (typeof width === "number" && Number.isFinite(width)) {
    useUiStore.getState().setSidebarWidth(width);
  }
  if (typeof collapsed === "boolean") {
    useUiStore.getState().setSidebarCollapsed(collapsed);
  }
}

function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "zh";
}

// Untrusted JSON from disk: only values that parse into the store's unions
// are applied, everything else falls back to in-code defaults.
function isThemeOverride(value: unknown): value is ThemeOverride {
  return (
    typeof value === "string" &&
    (THEME_OVERRIDES as readonly string[]).includes(value)
  );
}

async function readPreference(key: PreferenceKey): Promise<unknown> {
  try {
    return await getPreference(key);
  } catch (error) {
    console.error(`Preference ${key} hydration failed`, error);
    return undefined;
  }
}
