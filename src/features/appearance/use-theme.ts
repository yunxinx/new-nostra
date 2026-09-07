import { useEffect, useSyncExternalStore } from "react";

import { useUiStore } from "@/stores/ui-store";

export function useTheme(): boolean {
  const themeOverride = useUiStore((s) => s.themeOverride);
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemDark,
  );
  const isDark =
    themeOverride === "system" ? systemPrefersDark : themeOverride === "dark";

  // Single owner of the `.dark` class: entries only seed the system value
  // before first paint and never toggle it afterwards.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
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
