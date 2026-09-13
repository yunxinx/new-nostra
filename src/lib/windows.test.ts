import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUiStore } from "@/stores/ui-store";

import { openSettings } from "./windows";

beforeEach(() => {
  vi.stubGlobal("window", {});
  mockWindows("main");
  useUiStore.setState(useUiStore.getInitialState(), true);
  useUiStore.getState().setThemeOverride("dark");
});
afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("openSettings", () => {
  it("waits for one native creation while concurrent opens share it", async () => {
    let completeCreation: () => void = () => {
      throw new Error("No creation pending");
    };
    const nativeCreation = new Promise<void>((resolve) => {
      completeCreation = resolve;
    });
    const create = vi.fn(() => nativeCreation);
    const once = vi.spyOn(WebviewWindow.prototype, "once");
    mockNewWindow(create);
    const first = openSettings();
    const second = openSettings();
    const completed = vi.fn();
    void first.then(completed);

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(completed).not.toHaveBeenCalled();
    completeCreation();
    await Promise.all([first, second]);

    expect(completed).toHaveBeenCalledOnce();
    const window = once.mock.contexts[0];
    expect(window).toBeInstanceOf(WebviewWindow);
    if (!(window instanceof WebviewWindow)) throw new Error("No window");
    expect(window.listeners["tauri://created"]).toEqual([]);
    expect(window.listeners["tauri://error"]).toEqual([]);
  });

  it("releases a failed creation so opening settings can be retried", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("native creation unavailable"))
      .mockResolvedValue(undefined);
    const once = vi.spyOn(WebviewWindow.prototype, "once");
    mockNewWindow(create);

    await expect(openSettings()).rejects.toThrow("native creation unavailable");
    const failedWindow = once.mock.contexts[0];
    if (!(failedWindow instanceof WebviewWindow)) throw new Error("No window");
    expect(failedWindow.listeners["tauri://created"]).toEqual([]);
    expect(failedWindow.listeners["tauri://error"]).toEqual([]);
    await expect(openSettings()).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("reads independent geometry together and centers on the chat column", async () => {
    const geometry = new Map<string, (value: unknown) => void>();
    const create = vi.fn();
    mockIPC((command, payload) => {
      if (command === "plugin:window|get_all_windows") return ["main"];
      if (command === "plugin:webview|create_webview_window") {
        create(payload);
        return;
      }
      return new Promise((resolve) => geometry.set(command, resolve));
    });
    useUiStore.getState().setSidebarWidth(280);
    const opening = openSettings();
    await vi.waitFor(() => expect(geometry.size).toBe(4));
    geometry.get("plugin:window|scale_factor")?.(2);
    geometry.get("plugin:window|inner_position")?.({ x: 400, y: 200 });
    geometry.get("plugin:window|inner_size")?.({ height: 1800, width: 2800 });
    geometry.get("plugin:window|current_monitor")?.(null);
    await opening;
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      options: { x: 520, y: 210 },
    });
  });

  it("keeps settings inside the monitor work area after scale conversion", async () => {
    const create = vi.fn();
    mockNewWindow(create, {
      name: "Retina",
      position: { x: 0, y: 0 },
      scaleFactor: 2,
      size: { height: 1800, width: 2880 },
      workArea: {
        position: { x: 0, y: 48 },
        size: { height: 1640, width: 2880 },
      },
    });
    await openSettings();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      options: { x: 400, y: 164 },
    });
  });

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

function mockNewWindow(
  create: (payload: unknown) => unknown,
  monitor: unknown = null,
): void {
  mockIPC((command, payload) => {
    switch (command) {
      case "plugin:webview|create_webview_window":
        return create(payload);
      case "plugin:window|current_monitor":
        return monitor;
      case "plugin:window|get_all_windows":
        return ["main"];
      case "plugin:window|inner_position":
        return { x: 400, y: 200 };
      case "plugin:window|inner_size":
        return { height: 1800, width: 2800 };
      case "plugin:window|scale_factor":
        return 2;
      default:
        throw new Error(`Unexpected IPC command: ${command}`);
    }
  });
}
