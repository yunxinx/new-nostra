import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";

import { setWindowBackground } from "@/lib/ipc/windows";
import { windowBackgroundFor } from "@/lib/window-background";

import { applyDerivedTokens } from "./derived-tokens";
import { useTheme } from "./use-theme";

// Matches .theme-transition's duration in index.css.
const THEME_TRANSITION_MS = 250;

export function useWindowAppearance(isReadyToShow = true): void {
  const isDark = useTheme();
  const previousIsDarkRef = useRef<boolean | null>(null);
  const nativeSyncRef = useRef(Promise.resolve());
  const hasShownRef = useRef(false);
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    const isFlip =
      previousIsDarkRef.current !== null &&
      previousIsDarkRef.current !== isDark;
    previousIsDarkRef.current = isDark;
    const animated =
      isFlip && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (animated) document.documentElement.classList.add("theme-transition");
    document.documentElement.classList.toggle("dark", isDark);
    applyDerivedTokens();
    const timeout = animated
      ? window.setTimeout(
          () => document.documentElement.classList.remove("theme-transition"),
          THEME_TRANSITION_MS,
        )
      : undefined;

    return () => {
      window.clearTimeout(timeout);
      document.documentElement.classList.remove("theme-transition");
    };
  }, [isDark]);

  useEffect(() => {
    let isDisposed = false;

    // Each two-layer sync finishes before the next begins; an older theme
    // cannot overwrite the webview after a newer native color has landed.
    nativeSyncRef.current = nativeSyncRef.current.then(async () => {
      if (isDisposed) return;
      try {
        await setWindowBackground(windowBackgroundFor(isDark));
      } catch (error) {
        // The command boundary already records native failures.
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "internal"
        ) {
          console.error("Window background synchronization failed", error);
        }
      }
    });

    return () => {
      isDisposed = true;
    };
  }, [isDark]);

  useEffect(() => {
    let isDisposed = false;
    const appWindow = getCurrentWindow();
    const isActive = () => !isDisposed;
    nativeSyncRef.current = nativeSyncRef.current.then(async () => {
      if (!isActive() || !isReadyToShow) return;
      try {
        // Hidden WKWebViews suspend rAF. Readiness comes from React's commit
        // and completed background IPC, not a compositor-frame callback.
        if (!hasShownRef.current) {
          await appWindow.show();
          hasShownRef.current = true;
        }
        if (isActive() && !hasFocusedRef.current) {
          hasFocusedRef.current = true;
          await appWindow.setFocus();
        }
      } catch (error) {
        console.error("Window reveal failed", error);
      }
    });

    return () => {
      isDisposed = true;
    };
  }, [isDark, isReadyToShow]);
}
