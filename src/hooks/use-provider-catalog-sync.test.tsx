import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { UnifiedModelListItem } from "@/types/ipc";

import { listenProviderCatalogChanges } from "@/lib/ipc/provider-events";
import { listProviders, listUnifiedModels } from "@/lib/ipc/providers";

import { useProviderCatalogSync } from "./use-provider-catalog-sync";
import { useProviders, useUnifiedModels } from "./use-providers";

vi.mock("@/lib/ipc/provider-events", () => ({
  listenProviderCatalogChanges: vi.fn(),
}));
vi.mock("@/lib/ipc/providers", () => ({
  listProviders: vi.fn(),
  listUnifiedModels: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("refreshes both catalogs and disposes listeners that register after StrictMode cleanup", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const registrations: Array<{
    callback: () => void;
    complete: (dispose: () => void) => void;
  }> = [];
  vi.mocked(listProviders).mockResolvedValue({ providers: [] });
  vi.mocked(listUnifiedModels).mockResolvedValue([]);
  vi.mocked(listenProviderCatalogChanges).mockImplementation(
    (callback) =>
      new Promise((complete) => registrations.push({ callback, complete })),
  );
  const { result, unmount } = renderHook(
    () => {
      useProviderCatalogSync();
      return { providers: useProviders(), unified: useUnifiedModels() };
    },
    {
      reactStrictMode: true,
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  await waitFor(() =>
    expect(
      result.current.providers.isLoading || result.current.unified.isLoading,
    ).toBe(false),
  );
  expect(registrations).toHaveLength(2);
  const disposedFirst = vi.fn();
  const disposedSecond = vi.fn();
  act(() => {
    registrations[0]?.complete(disposedFirst);
    registrations[1]?.complete(disposedSecond);
  });
  await waitFor(() => expect(disposedFirst).toHaveBeenCalledOnce());
  await waitFor(() => expect(listUnifiedModels).toHaveBeenCalledTimes(2));
  vi.mocked(listUnifiedModels).mockResolvedValue([
    { id: "created-elsewhere", members: [] },
  ]);
  act(() => registrations[1]?.callback());
  await waitFor(() =>
    expect(result.current.unified.unifiedModels[0]?.id).toBe(
      "created-elsewhere",
    ),
  );
  expect(listProviders).toHaveBeenCalledTimes(3);
  unmount();
  expect(disposedSecond).toHaveBeenCalledOnce();
  registrations[0]?.callback();
  registrations[1]?.callback();
  expect(listProviders).toHaveBeenCalledTimes(3);
  client.clear();
});

it.each(["registration", "notification"])(
  "replaces an in-flight first read after catalog %s",
  async (trigger) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let completeRead: (items: UnifiedModelListItem[]) => void = () => {
      throw new Error("No read pending");
    };
    let completeRegistration: (dispose: () => void) => void = () => {
      throw new Error("No registration pending");
    };
    let notify: () => void = () => {
      throw new Error("No listener registered");
    };
    const dispose = vi.fn();
    vi.mocked(listUnifiedModels)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            completeRead = resolve;
          }),
      )
      .mockResolvedValue([{ id: "new-model", members: [] }]);
    vi.mocked(listenProviderCatalogChanges).mockImplementation((callback) => {
      notify = callback;
      return new Promise((resolve) => {
        completeRegistration = resolve;
      });
    });
    const { result, unmount } = renderHook(
      () => {
        useProviderCatalogSync();
        return useUnifiedModels();
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(listUnifiedModels).toHaveBeenCalledOnce());
    await act(() => {
      if (trigger === "registration") completeRegistration(dispose);
      else notify();
      return Promise.resolve();
    });
    await waitFor(() =>
      expect(result.current.unifiedModels).toEqual([
        { id: "new-model", members: [] },
      ]),
    );
    await act(() => {
      completeRead([{ id: "stale-model", members: [] }]);
      return Promise.resolve();
    });
    expect(result.current.unifiedModels).toEqual([
      { id: "new-model", members: [] },
    ]);
    unmount();
    if (trigger === "notification")
      await act(() => {
        completeRegistration(dispose);
        return Promise.resolve();
      });
    expect(dispose).toHaveBeenCalledOnce();
    client.clear();
  },
);
