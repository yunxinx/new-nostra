import { emit } from "@tauri-apps/api/event";
import i18next from "i18next";

import type { Language } from "@/lib/i18n";

import { PREFERENCE_KEYS, setPreference } from "@/lib/ipc/preferences";

/**
 * Single entry point for language changes: switches the local i18n instance,
 * persists the choice, and broadcasts it so every window switches
 * immediately (the local listener re-applies the same value idempotently).
 */
export function setLanguage(language: Language): void {
  void i18next.changeLanguage(language);
  void setPreference(PREFERENCE_KEYS.language, language);
  void emit("ui://language-changed", { language });
}
