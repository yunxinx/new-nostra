import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface UiState {
  setSidebarOpen: (open: boolean) => void;
  sidebarOpen: boolean;
}

export const useUiStore = create<UiState>()(
  immer((set) => ({
    setSidebarOpen: (sidebarOpen) =>
      set((state) => {
        state.sidebarOpen = sidebarOpen;
      }),
    sidebarOpen: true,
  })),
);
