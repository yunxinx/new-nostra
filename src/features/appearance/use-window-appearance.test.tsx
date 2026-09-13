import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useUiStore } from "@/stores/ui-store";

import { useTheme } from "./use-theme";
import { useWindowAppearance } from "./use-window-appearance";

vi.mock("./derived-tokens", () => ({ applyDerivedTokens: vi.fn() }));

const BACKGROUND = "set_window_background";
const SHOW = "plugin:window|show";
const FOCUS = "plugin:window|set_focus";

let calls: Array<{ command: string; payload: unknown }>;
let bridge: (command: string, payload: unknown) => unknown;
let systemListeners: Set<() => void>;

beforeEach(() => {
  calls = [];
  bridge = () => undefined;
  systemListeners = new Set();
  useUiStore.setState(useUiStore.getInitialState(), true);
  useUiStore.getState().setThemeOverride("dark");
  vi.stubGlobal("matchMedia", (query: string) => ({
    addEventListener: (_event: string, callback: () => void) =>
      systemListeners.add(callback),
    matches: false,
    media: query,
    removeEventListener: (_event: string, callback: () => void) =>
      systemListeners.delete(callback),
  }));
  mockWindows("main");
  mockIPC((command, payload) => {
    if (![BACKGROUND, FOCUS, SHOW].includes(command)) {
      throw new Error(`Unexpected IPC command: ${command}`);
    }
    calls.push({ command, payload });
    return bridge(command, payload);
  });
});

afterEach(() => {
  cleanup();
  clearMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.className = "";
});

it("reveals once after the explicit background command finishes under StrictMode", async () => {
  const background = deferred();
  bridge = (command) =>
    command === BACKGROUND ? background.promise : undefined;
  renderHook(() => useWindowAppearance(), { reactStrictMode: true });
  await waitFor(() => expect(commands()).toEqual([BACKGROUND]));
  expect(calls[0]?.payload).toEqual({ params: { color: "#22272e" } });
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(document.documentElement.classList.contains("theme-transition")).toBe(
    false,
  );

  background.resolve();
  await waitFor(() => expect(commands()).toEqual([BACKGROUND, SHOW, FOCUS]));
});

it("waits for root readiness without repeating background IPC or later reveals", async () => {
  const { rerender } = renderHook(({ ready }) => useWindowAppearance(ready), {
    initialProps: { ready: false },
  });
  await waitFor(() => expect(commands()).toEqual([BACKGROUND]));
  rerender({ ready: true });
  await waitFor(() => expect(commands()).toEqual([BACKGROUND, SHOW, FOCUS]));
  rerender({ ready: false });
  rerender({ ready: true });
  await act(() => Promise.resolve());
  expect(commands()).toEqual([BACKGROUND, SHOW, FOCUS]);
});

it("finishes the latest theme before showing and never re-focuses on later theme changes", async () => {
  const firstBackground = deferred();
  const latestBackground = deferred();
  let backgroundUpdates = 0;
  bridge = (command) => {
    if (command === BACKGROUND) {
      backgroundUpdates += 1;
      if (backgroundUpdates === 1) return firstBackground.promise;
      if (backgroundUpdates === 2) return latestBackground.promise;
    }
    return undefined;
  };
  renderHook(() => useWindowAppearance());
  await waitFor(() => expect(commands()).toEqual([BACKGROUND]));
  act(() => useUiStore.getState().setThemeOverride("light"));
  firstBackground.resolve();
  await waitFor(() => expect(commands()).toEqual([BACKGROUND, BACKGROUND]));
  expect(calls.at(-1)?.payload).toEqual({ params: { color: "#ffffff" } });
  latestBackground.resolve();
  await waitFor(() => expect(commands().at(-1)).toBe(FOCUS));
  act(() => useUiStore.getState().setThemeOverride("dark"));
  await waitFor(() =>
    expect(commands().filter((command) => command === BACKGROUND)).toHaveLength(
      3,
    ),
  );
  expect(commands().filter((command) => command === SHOW)).toHaveLength(1);
  expect(commands().filter((command) => command === FOCUS)).toHaveLength(1);
  expect(document.documentElement.classList.contains("theme-transition")).toBe(
    true,
  );
});

it("does not reveal from work that completes after its owner unmounts", async () => {
  const background = deferred();
  bridge = (command) =>
    command === BACKGROUND ? background.promise : undefined;
  const { unmount } = renderHook(() => useWindowAppearance());
  await waitFor(() => expect(commands()).toEqual([BACKGROUND]));
  unmount();
  await act(async () => {
    background.resolve();
    await background.promise;
  });
  expect(commands()).not.toContain(SHOW);
  expect(commands()).not.toContain(FOCUS);
  expect(systemListeners.size).toBe(0);
});

it("theme consumers subscribe without changing window appearance", () => {
  const { result, unmount } = renderHook(() => useTheme(), {
    reactStrictMode: true,
  });
  expect(result.current).toBe(true);
  expect(commands()).toEqual([]);
  expect(systemListeners.size).toBe(1);
  unmount();
  expect(systemListeners.size).toBe(0);
});

it("logs background failure, reveals with CSS, and can synchronize on the next theme change", async () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
  let backgroundUpdates = 0;
  bridge = (command) => {
    if (command === BACKGROUND && backgroundUpdates++ === 0)
      throw new Error("background unavailable");
    return undefined;
  };
  renderHook(() => useWindowAppearance());
  await waitFor(() => expect(commands().at(-1)).toBe(FOCUS));
  expect(report).toHaveBeenCalledOnce();
  act(() => useUiStore.getState().setThemeOverride("light"));
  await waitFor(() => expect(backgroundUpdates).toBe(2));
  expect(calls.at(-1)?.payload).toEqual({ params: { color: "#ffffff" } });
  expect(commands().filter((command) => command === SHOW)).toHaveLength(1);
});

it("keeps the startup fallback without duplicating a native command failure log", async () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const fail = vi.fn<() => Promise<void>>().mockRejectedValue({
    code: "internal",
    message: "native window background update failed",
  });
  bridge = (command) => (command === BACKGROUND ? fail() : undefined);
  renderHook(() => useWindowAppearance());
  await waitFor(() => expect(commands()).toEqual([BACKGROUND, SHOW, FOCUS]));
  expect(report).not.toHaveBeenCalled();
});

function commands(): string[] {
  return calls.map(({ command }) => command);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {
    throw new Error("Deferred not initialized");
  };
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
