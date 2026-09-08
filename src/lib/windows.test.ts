import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openSettings } from "./windows";

beforeEach(() => {
  vi.stubGlobal("window", {});
});
afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
});

describe("openSettings", () => {
  it.each([true, false])(
    "focuses the existing settings window with minimized=%s",
    async (initiallyMinimized) => {
      let isMinimized = initiallyMinimized;
      let isFocused = false;
      mockIPC((command, payload) => {
        if (command === "plugin:window|get_all_windows") {
          return ["main", "settings"];
        }
        expect(payload).toEqual({ label: "settings" });
        switch (command) {
          case "plugin:window|is_minimized":
            return isMinimized;
          case "plugin:window|set_focus":
            isFocused = !isMinimized;
            return;
          case "plugin:window|unminimize":
            expect(isMinimized).toBe(true);
            isMinimized = false;
            return;
          default:
            throw new Error(`Unexpected IPC command: ${command}`);
        }
      });

      await openSettings();

      expect(isMinimized).toBe(false);
      expect(isFocused).toBe(true);
    },
  );
});
