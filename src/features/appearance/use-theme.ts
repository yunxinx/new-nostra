import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useSyncExternalStore } from "react";

import { applyDerivedTokens } from "@/features/appearance/derived-tokens";
import { windowBackgroundFor } from "@/lib/window-background";
import { useUiStore } from "@/stores/ui-store";

// Pre-paint seed for the window entries: applies the system theme and its
// derived tokens synchronously before React renders, so the first frame is
// already correct; after mount, useTheme in the root component owns both.
export function seedInitialTheme(): void {
  const isDark = getSystemDark();
  document.documentElement.classList.toggle("dark", isDark);
  applyDerivedTokens();
}

export function useTheme(): boolean {
  const themeOverride = useUiStore((s) => s.themeOverride);
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemDark,
  );
  const isDark =
    themeOverride === "system" ? systemPrefersDark : themeOverride === "dark";

  // Single owner of the `.dark` class, the derived token overrides, and the
  // native window background color: entries only seed the class and tokens
  // before first paint and never change them afterwards.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    applyDerivedTokens();
    // The static config color is the dark fallback; this sync corrects
    // light-theme windows before their hidden window is shown and follows
    // every later theme change.
    void getCurrentWindow().setBackgroundColor(windowBackgroundFor(isDark));
  }, [isDark]);

  return isDark;
}

function getSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
