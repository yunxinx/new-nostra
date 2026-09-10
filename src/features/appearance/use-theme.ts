import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { applyDerivedTokens } from "@/features/appearance/derived-tokens";
import { windowBackgroundFor } from "@/lib/window-background";
import { useUiStore } from "@/stores/ui-store";

// Matches .theme-transition's transition-duration in index.css; the class
// is removed once the color changes have settled so it never touches the
// app's everyday hover and animation transitions.
const THEME_TRANSITION_MS = 250;

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

  const previousIsDarkRef = useRef<boolean | null>(null);
  const transitionTimeoutRef = useRef<number | undefined>(undefined);

  // Single owner of the `.dark` class, the derived token overrides, and the
  // native window background color: entries only seed the class and tokens
  // before first paint and never change them afterwards.
  useEffect(() => {
    // Only a real flip after the first application transitions — the mount
    // apply (and StrictMode's second setup, which sees no flip) must not
    // animate from an unthemed first frame, and reduced-motion users get
    // the instant flip (the CSS block also disables the transition as a
    // backstop).
    const isFlip =
      previousIsDarkRef.current !== null &&
      previousIsDarkRef.current !== isDark;
    previousIsDarkRef.current = isDark;
    const animated =
      isFlip && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (animated) {
      document.documentElement.classList.add("theme-transition");
    }
    document.documentElement.classList.toggle("dark", isDark);
    applyDerivedTokens();
    // The static config color is the dark fallback; this sync corrects
    // light-theme windows before their hidden window is shown and follows
    // every later theme change.
    void getCurrentWindow().setBackgroundColor(windowBackgroundFor(isDark));
    if (animated) {
      transitionTimeoutRef.current = window.setTimeout(
        () => document.documentElement.classList.remove("theme-transition"),
        THEME_TRANSITION_MS,
      );
    }
    // Undoing the class in the same synchronous commit as the next setup's
    // re-add leaves it present at style time, so a flip during the window
    // retargets the running transition instead of snapping it.
    return () => {
      window.clearTimeout(transitionTimeoutRef.current);
      document.documentElement.classList.remove("theme-transition");
    };
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
