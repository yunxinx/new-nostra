import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type ThemeOverride = "dark" | "light" | "system";

const SIDEBAR_MAX_WIDTH = 440;
const SIDEBAR_MIN_WIDTH = 220;

interface UiState {
  activeSessionId: null | string;
  draftId: number;
  setActiveSession: (id: null | string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setThemeOverride: (override: ThemeOverride) => void;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  startNewChat: () => void;
  themeOverride: ThemeOverride;
  toggleSidebarCollapsed: () => void;
}

export const useUiStore = create<UiState>()(
  immer((set) => ({
    activeSessionId: null,
    draftId: 0,
    setActiveSession: (activeSessionId) =>
      set((state) => {
        state.activeSessionId = activeSessionId;
      }),
    setSidebarCollapsed: (sidebarCollapsed) =>
      set((state) => {
        state.sidebarCollapsed = sidebarCollapsed;
      }),
    setSidebarWidth: (sidebarWidth) =>
      set((state) => {
        // Resize gestures overshoot the usable range; the store is the
        // single authority that keeps the width inside 220..440.
        state.sidebarWidth = Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth),
        );
      }),
    setThemeOverride: (themeOverride) =>
      set((state) => {
        state.themeOverride = themeOverride;
      }),
    sidebarCollapsed: false,
    sidebarWidth: 272,
    startNewChat: () =>
      set((state) => {
        state.activeSessionId = null;
        state.draftId += 1;
      }),
    themeOverride: "system",
    toggleSidebarCollapsed: () =>
      set((state) => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
      }),
  })),
);
