import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { attachConsole, error as logError } from "@tauri-apps/plugin-log";
import i18next from "i18next";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { Language } from "@/lib/i18n";
import type { ThemeOverride } from "@/stores/ui-store";

import { TooltipProvider } from "@/components/ui/tooltip";
import { seedInitialTheme } from "@/features/appearance/use-theme";
import { SettingsWindowApp } from "@/features/settings/SettingsWindowApp";
import { initI18n } from "@/lib/i18n";
import { hydrateSharedPreferences } from "@/lib/preferences";
import { useUiStore } from "@/stores/ui-store";

import "./index.css";

if (import.meta.env.DEV) {
  // Process-lifetime dev sink mirroring frontend console into the Rust log
  // plugin; the app entry never unmounts, so no unlisten point exists.
  void attachConsole();
}

// Seeds the system theme and its derived tokens before first paint so the
// initial render already uses the correct theme values. After mount,
// useTheme in the root component owns the `.dark` class and the derived
// tokens (system follow and manual override), so this initialization has
// no change listener of its own.
seedInitialTheme();

// Cross-window sync: the other window broadcasts theme and language
// changes; the app entry never unmounts, so no unlisten point exists.
void listen<{ override: ThemeOverride }>("ui://theme-changed", (event) => {
  useUiStore.getState().setThemeOverride(event.payload.override);
});

void listen<{ language: Language }>("ui://language-changed", (event) => {
  void i18next.changeLanguage(event.payload.language);
});

initI18n();

// Persisted preferences are restored before the first render so the window
// (created hidden and revealed after mount) shows the right theme and
// language in its first visible frame. A failed restore falls back to the
// defaults instead of blocking startup.
void (async () => {
  try {
    await hydrateSharedPreferences();
  } catch (error) {
    void logError(`preferences hydration failed: ${String(error)}`);
  }
  const rootElement = document.getElementById("settings-root");
  if (!rootElement) {
    throw new Error("settings root element missing in settings.html");
  }
  const queryClient = new QueryClient();
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        {/* Tooltip primitives throw without a Provider context, so both window
            entries carry one even before any tooltip exists here. */}
        <TooltipProvider>
          <SettingsWindowApp />
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
})();
