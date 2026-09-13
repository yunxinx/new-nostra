import { useSyncExternalStore } from "react";

import { applyDerivedTokens } from "@/features/appearance/derived-tokens";
import { useUiStore } from "@/stores/ui-store";

// Pre-paint seed for the window entries: applies the system theme and its
// derived tokens synchronously before React renders, so the first frame is
// already correct; after mount, the window root owns both.
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
  return themeOverride === "system"
    ? systemPrefersDark
    : themeOverride === "dark";
}

function getSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
