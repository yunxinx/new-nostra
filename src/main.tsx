import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { attachConsole } from "@tauri-apps/plugin-log";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/App";
import { initI18n } from "@/lib/i18n";

import "./index.css";

if (import.meta.env.DEV) {
  // Process-lifetime dev sink mirroring frontend console into the Rust log
  // plugin; the app entry never unmounts, so no unlisten point exists.
  void attachConsole();
}

// Runs before first paint so the initial render already uses the correct
// theme tokens; the entry never unmounts, so no unlisten point exists.
const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const applySystemTheme = () => {
  document.documentElement.classList.toggle("dark", darkModeQuery.matches);
};
applySystemTheme();
darkModeQuery.addEventListener("change", applySystemTheme);

initI18n();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("root element missing in index.html");
}

const queryClient = new QueryClient();

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
