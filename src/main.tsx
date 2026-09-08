import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { attachConsole, error as logError } from "@tauri-apps/plugin-log";
import i18next from "i18next";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { Language } from "@/lib/i18n";
import type { ThemeOverride } from "@/stores/ui-store";

import { App } from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { seedInitialTheme } from "@/features/appearance/use-theme";
import { initI18n } from "@/lib/i18n";
import {
  hydrateSharedPreferences,
  hydrateSidebarGeometry,
} from "@/lib/preferences";
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
// (created hidden and revealed after mount) shows the right theme, language,
// and sidebar geometry in its first visible frame. A failed restore falls
// back to the defaults instead of blocking startup.
void (async () => {
  try {
    await hydrateSharedPreferences();
    await hydrateSidebarGeometry();
  } catch (error) {
    void logError(`preferences hydration failed: ${String(error)}`);
  }
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("root element missing in index.html");
  }
  const queryClient = new QueryClient();
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
})();
