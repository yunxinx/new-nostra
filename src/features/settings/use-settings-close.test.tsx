import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockWindows } from "@tauri-apps/api/mocks";
import { CloseRequestedEvent, Window } from "@tauri-apps/api/window";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { resolveSettingsClose } from "@/lib/ipc/windows";

import { useSettingsClose } from "./use-settings-close";

vi.mock("@/lib/ipc/windows", () => ({ resolveSettingsClose: vi.fn() }));

interface Registration {
  callback: (event: CloseRequestedEvent) => unknown;
  complete: (dispose: () => void) => void;
}

let client: QueryClient;
let registrations: Registration[];

beforeEach(() => {
  mockWindows("settings");
  client = new QueryClient();
  registrations = [];
  vi.spyOn(Window.prototype, "onCloseRequested").mockImplementation(
    (callback) =>
      new Promise((complete) => registrations.push({ callback, complete })),
  );
  vi.mocked(resolveSettingsClose).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  client.clear();
  clearMocks();
  vi.restoreAllMocks();
});

it("disposes late StrictMode registrations and ignores callbacks after cleanup", async () => {
  const request = vi.fn();
  const firstDispose = vi.fn();
  const secondDispose = vi.fn();
  const { result, unmount } = renderHook(() => useSettingsClose(request), {
    reactStrictMode: true,
    wrapper,
  });
  expect(registrations).toHaveLength(2);
  await act(() => {
    registrations[0]?.complete(firstDispose);
    registrations[1]?.complete(secondDispose);
    return Promise.resolve();
  });
  expect(firstDispose).toHaveBeenCalledOnce();
  expect(secondDispose).not.toHaveBeenCalled();
  expect(result.current.registrationStatus).toBe("ready");
  const staleEvent = closeEvent();
  const activeEvent = closeEvent();
  act(() => {
    registrations[0]?.callback(staleEvent);
    registrations[1]?.callback(activeEvent);
  });
  expect(request).toHaveBeenCalledOnce();
  expect(staleEvent.isPreventDefault()).toBe(true);
  expect(activeEvent.isPreventDefault()).toBe(true);
  unmount();
  expect(secondDispose).toHaveBeenCalledOnce();
  registrations[1]?.callback(closeEvent());
  expect(request).toHaveBeenCalledOnce();
});

it("cleans a registration that completes after the window root unmounts", async () => {
  const request = vi.fn();
  const dispose = vi.fn();
  const { unmount } = renderHook(() => useSettingsClose(request), { wrapper });
  unmount();
  await act(() => {
    registrations[0]?.complete(dispose);
    return Promise.resolve();
  });
  expect(dispose).toHaveBeenCalledOnce();
  registrations[0]?.callback(closeEvent());
  expect(request).not.toHaveBeenCalled();
});

it("can retry failed native listener registration", async () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(Window.prototype.onCloseRequested).mockRejectedValueOnce(
    new Error("listen unavailable"),
  );
  const { result } = renderHook(() => useSettingsClose(vi.fn()), { wrapper });
  await waitFor(() => expect(result.current.registrationStatus).toBe("failed"));
  expect(result.current.registrationError?.code).toBe("internal");
  expect(report).toHaveBeenCalledOnce();
  act(() => result.current.retryRegistration());
  await act(() => {
    registrations[0]?.complete(vi.fn());
    return Promise.resolve();
  });
  expect(result.current.registrationStatus).toBe("ready");
  expect(result.current.registrationError).toBeNull();
});

it("submits one decision until its native resolution finishes", async () => {
  let completeResolution: () => void = () => {
    throw new Error("No resolution pending");
  };
  vi.mocked(resolveSettingsClose).mockImplementation(
    () =>
      new Promise((resolve) => {
        completeResolution = resolve;
      }),
  );
  const settled = vi.fn();
  const { result } = renderHook(() => useSettingsClose(vi.fn()), { wrapper });
  act(() => {
    result.current.resolve(true, settled);
    result.current.resolve(true, settled);
  });
  await waitFor(() =>
    expect(
      vi.mocked(resolveSettingsClose).mock.calls.map(([accepted]) => accepted),
    ).toEqual([true]),
  );
  expect(settled).not.toHaveBeenCalled();
  await act(() => {
    completeResolution();
    return Promise.resolve();
  });
  await waitFor(() => expect(settled).toHaveBeenCalledOnce());
});

function closeEvent(): CloseRequestedEvent {
  return new CloseRequestedEvent({
    event: "tauri://close-requested",
    id: 0,
    payload: null,
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
