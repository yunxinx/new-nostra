import { load, type Store } from "@tauri-apps/plugin-store";

/** Persisted preference keys; the value shape is fixed per key (see
 * PREFERENCE_KEYS users) and a renamed key reads as absent, so renames
 * silently reset that preference to its default. */
export const PREFERENCE_KEYS = {
  language: "language",
  sidebarCollapsed: "sidebarCollapsed",
  sidebarWidth: "sidebarWidth",
  themeOverride: "themeOverride",
} as const;

/** Union of PREFERENCE_KEYS values; narrows setPreference's key argument. */
export type PreferenceKey =
  (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

const PREFERENCES_STORE_PATH = "preferences.json";

// Single shared handle: every caller awaits the same promise, so each
// webview holds one store resource instead of one per call. A failed load
// clears the cache so the next call can retry.
let storePromise: null | Promise<Store> = null;

/**
 * Reads one persisted preference; returns undefined until its first write.
 * The value comes from JSON on disk, so callers narrow it with type guards.
 * Rejects only when the store plugin fails to load (missing capability).
 */
export async function getPreference(key: PreferenceKey): Promise<unknown> {
  return (await getStore()).get(key);
}

/**
 * Writes one preference and saves it to disk; callers serialize through the
 * shared handle, last write wins. Rejects when the store fails to load
 * (e.g. missing store capability).
 */
export async function setPreference(
  key: PreferenceKey,
  value: boolean | number | string,
): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
  await store.save();
}

function getStore(): Promise<Store> {
  storePromise ??= load(PREFERENCES_STORE_PATH, { autoSave: false }).catch(
    (error: unknown) => {
      storePromise = null;
      throw error;
    },
  );
  return storePromise;
}
