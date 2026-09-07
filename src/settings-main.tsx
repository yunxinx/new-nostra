import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { attachConsole } from "@tauri-apps/plugin-log";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { ThemeOverride } from "@/stores/ui-store";

import { SettingsWindowApp } from "@/features/settings/SettingsWindowApp";
import { initI18n } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";

import "./index.css";

if (import.meta.env.DEV) {
  // Process-lifetime dev sink mirroring frontend console into the Rust log
  // plugin; the app entry never unmounts, so no unlisten point exists.
  void attachConsole();
}

// Seeds the system theme before first paint so the initial render already
// uses the correct theme tokens. After mount, useTheme in the root component
// owns the `.dark` class (system follow and manual override), so this
// initialization has no change listener of its own.
document.documentElement.classList.toggle(
  "dark",
  window.matchMedia("(prefers-color-scheme: dark)").matches,
);

// Cross-window theme sync: the other window broadcasts override flips; the
// app entry never unmounts, so no unlisten point exists.
void listen<{ override: ThemeOverride }>("ui://theme-changed", (event) => {
  useUiStore.getState().setThemeOverride(event.payload.override);
});

initI18n();

const rootElement = document.getElementById("settings-root");
if (!rootElement) {
  throw new Error("settings root element missing in settings.html");
}

const queryClient = new QueryClient();

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsWindowApp />
    </QueryClientProvider>
  </StrictMode>,
);
