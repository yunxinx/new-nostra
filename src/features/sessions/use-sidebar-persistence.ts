import { useEffect } from "react";

import { PREFERENCE_KEYS, setPreference } from "@/lib/ipc/preferences";
import { useUiStore } from "@/stores/ui-store";

// Resize drags update the store on every pointermove; a trailing debounce
// coalesces them into one disk write after the gesture settles.
const GEOMETRY_SAVE_DELAY_MS = 300;

// Persists sidebar geometry as it changes in the main window (the single
// writer of these keys). Hydration completes before the first mount, so the
// subscription never echoes restored values back to disk.
export function useSidebarPersistence(): void {
  useEffect(() => {
    let saveTimer: null | ReturnType<typeof setTimeout> = null;

    const unsubscribe = useUiStore.subscribe((state, prevState) => {
      if (
        state.sidebarWidth === prevState.sidebarWidth &&
        state.sidebarCollapsed === prevState.sidebarCollapsed
      ) {
        return;
      }
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
      }
      saveTimer = setTimeout(() => {
        saveTimer = null;
        const { sidebarCollapsed, sidebarWidth } = useUiStore.getState();
        void setPreference(PREFERENCE_KEYS.sidebarWidth, sidebarWidth);
        void setPreference(PREFERENCE_KEYS.sidebarCollapsed, sidebarCollapsed);
      }, GEOMETRY_SAVE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
      }
    };
  }, []);
}
