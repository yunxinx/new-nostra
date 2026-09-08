import { useEffect } from "react";

import { toggleTheme } from "@/features/appearance/toggle-theme";
import { isMacOs } from "@/lib/platform";
import { useUiStore } from "@/stores/ui-store";

// Store access goes through getState so the listener stays valid for the
// window lifetime and never needs re-registration on state changes.
export function useShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const primary = isMacOs() ? event.metaKey : event.ctrlKey;
      if (!primary) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "b" && !event.shiftKey) {
        event.preventDefault();
        useUiStore.getState().toggleSidebarCollapsed();
      } else if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        useUiStore.getState().startNewChat();
      } else if (key === "l" && event.shiftKey) {
        event.preventDefault();
        toggleTheme();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
