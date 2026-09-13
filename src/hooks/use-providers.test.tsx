import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AppError,
  Provider,
  ProviderDraft,
  ProviderPreset,
  Providers,
  UnifiedModel,
  UnifiedModelListItem,
} from "@/types/ipc";

import {
  createProvider,
  createUnifiedModel,
  deleteProvider,
  deleteUnifiedModel,
  listProviderPresets,
  listProviders,
  listUnifiedModels,
  updateProvider,
  updateUnifiedModel,
} from "@/lib/ipc/providers";
import {
  providerPresetsKeys,
  providersKeys,
  unifiedModelsKeys,
} from "@/lib/query-keys";

import {
  useCreateProvider,
  useCreateUnifiedModel,
  useDeleteProvider,
  useDeleteUnifiedModel,
  useProviderPresets,
  useProviders,
  useUnifiedModels,
  useUpdateProvider,
  useUpdateUnifiedModel,
} from "./use-providers";

// These tests drive the real @tanstack/react-query kernel against a mocked IPC
// boundary, so cache population and the invalidation map are validated against
// actual cache state rather than against the hook's own wiring. TanStack calls
// every mutationFn with a trailing mutation-context object (client/meta/
// mutationKey), hence the `expect.anything()` that lets it through.

vi.mock("@/lib/ipc/providers", () => ({
  createProvider: vi.fn(),
  createUnifiedModel: vi.fn(),
  deleteProvider: vi.fn(),
  deleteUnifiedModel: vi.fn(),
  listProviderPresets: vi.fn(),
  listProviders: vi.fn(),
  listUnifiedModels: vi.fn(),
  updateProvider: vi.fn(),
  updateUnifiedModel: vi.fn(),
}));

const createProviderMock = vi.mocked(createProvider);
const createUnifiedModelMock = vi.mocked(createUnifiedModel);
const deleteProviderMock = vi.mocked(deleteProvider);
const deleteUnifiedModelMock = vi.mocked(deleteUnifiedModel);
const listProviderPresetsMock = vi.mocked(listProviderPresets);
const listProvidersMock = vi.mocked(listProviders);
const listUnifiedModelsMock = vi.mocked(listUnifiedModels);
const updateProviderMock = vi.mocked(updateProvider);
const updateUnifiedModelMock = vi.mocked(updateUnifiedModel);

const PROVIDER_DRAFT: ProviderDraft = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "",
  baseUrl: "http://localhost:11434/v1",
  enabled: true,
  maxRetries: 2,
  name: "Ollama",
  reasoningOutput: "auto",
  requestTimeoutMs: 120000,
  streamIdleTimeoutMs: 120000,
};

const PROVIDER: Provider = { ...PROVIDER_DRAFT, id: "p1" };

const PRESET: ProviderPreset = {
  api: "openai-completions",
  baseUrl: "https://openrouter.ai/api/v1",
  compat: { "openai-completions": { supportsDeveloperRole: false } },
  headers: { "X-OpenRouter-Title": "Nostra" },
  models: [
    {
      apis: ["anthropic-messages", "openai-completions"],
      id: "anthropic/claude-sonnet-5",
      reasoning: true,
    },
  ],
  name: "OpenRouter",
  presetId: "openrouter",
};

const UNIFIED: UnifiedModel = {
  id: "fast",
  members: [{ model: "m1", providerId: "p1" }],
};

const READ_ERROR: AppError = { code: "db", message: "read failed" };
const WRITE_ERROR: AppError = { code: "invalid_input", message: "bad draft" };

let queryClient: QueryClient;

function deferred<T>() {
  let reject: (error: unknown) => void = () => undefined;
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((complete, fail) => {
    reject = fail;
    resolve = complete;
  });
  return { promise, reject, resolve };
}

function isInvalidated(key: readonly unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated === true;
}

// The mutation tests assert on the two seeded root queries: with no observers
// attached, an invalidation marks the cache entry without a refetch racing the
// assertion.
function seedCaches(): void {
  queryClient.setQueryData<Providers>(providersKeys.all, { providers: [] });
  queryClient.setQueryData<UnifiedModelListItem[]>(unifiedModelsKeys.all, []);
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe("provider queries", () => {
  it("fills the providers cache from the stored list", async () => {
    const payload: Providers = { providers: [PROVIDER] };
    listProvidersMock.mockResolvedValue(payload);
    const { result } = renderHook(() => useProviders(), { wrapper: Wrapper });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.providers).toEqual([PROVIDER]);
    expect(result.current.error).toBeNull();
    expect(queryClient.getQueryData(providersKeys.all)).toEqual(payload);
  });

  it("fills the unified-model cache under its own key", async () => {
    const rows: UnifiedModelListItem[] = [
      UNIFIED,
      { corrupted: true, id: "bad" },
    ];
    listUnifiedModelsMock.mockResolvedValue(rows);
    const { result } = renderHook(() => useUnifiedModels(), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.unifiedModels).toEqual(rows);
    expect(queryClient.getQueryData(unifiedModelsKeys.all)).toEqual(rows);
    expect(queryClient.getQueryData(providersKeys.all)).toBeUndefined();
  });

  it("surfaces the AppError of a failed read", async () => {
    listProvidersMock.mockRejectedValue(READ_ERROR);
    const { result } = renderHook(() => useProviders(), { wrapper: Wrapper });
    await waitFor(() => {
      expect(result.current.error?.code).toBe("db");
    });
    expect(result.current.isLoading).toBe(false);
  });
});

describe("provider presets", () => {
  it("fills the presets cache under its own key", async () => {
    listProviderPresetsMock.mockResolvedValue([PRESET]);
    const { result } = renderHook(() => useProviderPresets(), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current.presets).toEqual([PRESET]);
    });
    expect(queryClient.getQueryData(providerPresetsKeys.all)).toEqual([PRESET]);
    expect(result.current.error).toBeNull();
    expect(queryClient.getQueryData(providersKeys.all)).toBeUndefined();
  });

  it("surfaces the AppError of a failed read and retries", async () => {
    listProviderPresetsMock
      .mockRejectedValueOnce(READ_ERROR)
      .mockResolvedValueOnce([PRESET]);
    const { result } = renderHook(() => useProviderPresets(), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current.error?.code).toBe("db");
    });
    expect(result.current.presets).toEqual([]);

    await act(async () => {
      result.current.retry();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.presets).toEqual([PRESET]);
    });
    expect(result.current.error).toBeNull();
  });
});

describe("provider write invalidations", () => {
  it("create invalidates the provider and unified-model lists", async () => {
    seedCaches();
    createProviderMock.mockResolvedValue(PROVIDER);
    const { result } = renderHook(() => useCreateProvider(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ provider: PROVIDER_DRAFT });
    });
    await waitFor(() => {
      expect(result.current.data).toEqual(PROVIDER);
    });
    expect(createProviderMock).toHaveBeenCalledWith(
      { provider: PROVIDER_DRAFT },
      expect.anything(),
    );
    expect(isInvalidated(providersKeys.all)).toBe(true);
    expect(isInvalidated(unifiedModelsKeys.all)).toBe(true);
  });

  it("update invalidates the provider and unified-model lists", async () => {
    seedCaches();
    updateProviderMock.mockResolvedValue(PROVIDER);
    const { result } = renderHook(() => useUpdateProvider(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({
        id: PROVIDER.id,
        provider: PROVIDER_DRAFT,
      });
    });
    expect(updateProviderMock).toHaveBeenCalledWith(
      {
        id: PROVIDER.id,
        provider: PROVIDER_DRAFT,
      },
      expect.anything(),
    );
    expect(isInvalidated(providersKeys.all)).toBe(true);
    expect(isInvalidated(unifiedModelsKeys.all)).toBe(true);
  });

  it("delete invalidates the provider and unified-model lists", async () => {
    seedCaches();
    deleteProviderMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteProvider(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ id: PROVIDER.id });
    });
    expect(deleteProviderMock).toHaveBeenCalledWith(
      { id: PROVIDER.id },
      expect.anything(),
    );
    expect(isInvalidated(providersKeys.all)).toBe(true);
    expect(isInvalidated(unifiedModelsKeys.all)).toBe(true);
  });
});

describe("committed provider cache", () => {
  it("uses the returned provider immediately and retains it when the refresh fails", async () => {
    const sibling: Provider = { ...PROVIDER, id: "p2", name: "Sibling" };
    const stored: Provider = { ...PROVIDER, name: "Stored name" };
    const refresh = deferred<Providers>();
    queryClient.setQueryData<Providers>(providersKeys.all, {
      providers: [sibling, PROVIDER, { corrupted: true, id: "bad" }],
    });
    listProvidersMock.mockReturnValue(refresh.promise);
    updateProviderMock.mockResolvedValue(stored);
    const { result } = renderHook(
      () => ({ list: useProviders(), update: useUpdateProvider() }),
      { wrapper: Wrapper },
    );
    let submitted: Promise<Provider> | undefined;
    act(() => {
      submitted = result.current.update.mutateAsync({
        id: PROVIDER.id,
        provider: { ...PROVIDER_DRAFT, name: "Submitted name" },
      });
    });
    await waitFor(() => expect(listProvidersMock).toHaveBeenCalledOnce());
    expect(queryClient.getQueryData(providersKeys.all)).toEqual({
      providers: [sibling, stored, { corrupted: true, id: "bad" }],
    });
    expect(result.current.update.isPending).toBe(true);
    await act(async () => {
      refresh.reject(READ_ERROR);
      await expect(submitted).resolves.toEqual(stored);
    });
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
    expect(result.current.update.error).toBeNull();
    expect(result.current.list.error).toEqual(READ_ERROR);
    expect(result.current.list.providers).toEqual([
      sibling,
      stored,
      { corrupted: true, id: "bad" },
    ]);
  });

  it("prevents an older in-flight read from replacing the committed provider", async () => {
    const stored: Provider = { ...PROVIDER, name: "Saved" };
    const staleRead = deferred<Providers>();
    queryClient.setQueryData<Providers>(providersKeys.all, {
      providers: [PROVIDER],
    });
    listProvidersMock
      .mockReturnValueOnce(staleRead.promise)
      .mockRejectedValue(READ_ERROR);
    updateProviderMock.mockResolvedValue(stored);
    const { result } = renderHook(
      () => ({ list: useProviders(), update: useUpdateProvider() }),
      { wrapper: Wrapper },
    );
    act(() => result.current.list.retry());
    await waitFor(() => expect(listProvidersMock).toHaveBeenCalledOnce());
    await act(async () => {
      await result.current.update.mutateAsync({
        id: PROVIDER.id,
        provider: PROVIDER_DRAFT,
      });
    });
    await waitFor(() => expect(result.current.list.error).toEqual(READ_ERROR));
    expect(result.current.list.providers).toEqual([stored]);
    await act(async () => {
      staleRead.resolve({ providers: [PROVIDER] });
      await staleRead.promise;
    });
    expect(result.current.list.providers).toEqual([stored]);
    expect(result.current.update.isSuccess).toBe(true);
  });

  it("preserves both provider commits when concurrent updates finish out of order", async () => {
    const second: Provider = { ...PROVIDER, id: "p2", name: "Second" };
    const savedFirst: Provider = { ...PROVIDER, name: "Saved first" };
    const savedSecond: Provider = { ...second, name: "Saved second" };
    const firstWrite = deferred<Provider>();
    const secondWrite = deferred<Provider>();
    queryClient.setQueryData<Providers>(providersKeys.all, {
      providers: [PROVIDER, second],
    });
    listProvidersMock.mockRejectedValue(READ_ERROR);
    updateProviderMock.mockImplementation(({ id }) =>
      id === PROVIDER.id ? firstWrite.promise : secondWrite.promise,
    );
    const { result } = renderHook(
      () => ({
        first: useUpdateProvider(),
        list: useProviders(),
        second: useUpdateProvider(),
      }),
      { wrapper: Wrapper },
    );
    let firstSubmitted: Promise<Provider> | undefined;
    let secondSubmitted: Promise<Provider> | undefined;
    act(() => {
      firstSubmitted = result.current.first.mutateAsync({
        id: PROVIDER.id,
        provider: PROVIDER_DRAFT,
      });
      secondSubmitted = result.current.second.mutateAsync({
        id: second.id,
        provider: PROVIDER_DRAFT,
      });
    });
    await act(async () => {
      secondWrite.resolve(savedSecond);
      await secondSubmitted;
    });
    await waitFor(() =>
      expect(result.current.list.providers).toEqual([PROVIDER, savedSecond]),
    );
    await act(async () => {
      firstWrite.resolve(savedFirst);
      await firstSubmitted;
    });
    await waitFor(() =>
      expect(result.current.list.providers).toEqual([savedFirst, savedSecond]),
    );
    expect(result.current.first.isSuccess).toBe(true);
    expect(result.current.second.isSuccess).toBe(true);
    expect(result.current.list.error).toEqual(READ_ERROR);
  });

  it("does not invent a complete catalog from an update when no catalog has loaded", async () => {
    updateProviderMock.mockResolvedValue(PROVIDER);
    const { result } = renderHook(() => useUpdateProvider(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({
        id: PROVIDER.id,
        provider: PROVIDER_DRAFT,
      });
    });
    expect(queryClient.getQueryData(providersKeys.all)).toBeUndefined();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("unified-model write invalidations", () => {
  it("create invalidates only the unified-model list", async () => {
    seedCaches();
    createUnifiedModelMock.mockResolvedValue(UNIFIED);
    const { result } = renderHook(() => useCreateUnifiedModel(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ unified: UNIFIED });
    });
    await waitFor(() => {
      expect(result.current.data).toEqual(UNIFIED);
    });
    expect(createUnifiedModelMock).toHaveBeenCalledWith(
      { unified: UNIFIED },
      expect.anything(),
    );
    expect(isInvalidated(unifiedModelsKeys.all)).toBe(true);
    expect(isInvalidated(providersKeys.all)).toBe(false);
  });

  it("update invalidates only the unified-model list", async () => {
    seedCaches();
    updateUnifiedModelMock.mockResolvedValue(UNIFIED);
    const { result } = renderHook(() => useUpdateUnifiedModel(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ id: UNIFIED.id, unified: UNIFIED });
    });
    expect(updateUnifiedModelMock).toHaveBeenCalledWith(
      {
        id: UNIFIED.id,
        unified: UNIFIED,
      },
      expect.anything(),
    );
    expect(isInvalidated(unifiedModelsKeys.all)).toBe(true);
    expect(isInvalidated(providersKeys.all)).toBe(false);
  });

  it("delete invalidates only the unified-model list", async () => {
    seedCaches();
    deleteUnifiedModelMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteUnifiedModel(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ id: UNIFIED.id });
    });
    expect(deleteUnifiedModelMock).toHaveBeenCalledWith(
      { id: UNIFIED.id },
      expect.anything(),
    );
    expect(isInvalidated(unifiedModelsKeys.all)).toBe(true);
    expect(isInvalidated(providersKeys.all)).toBe(false);
  });
});

describe("mutation failures", () => {
  it("rejects with the AppError and invalidates nothing on a provider write", async () => {
    seedCaches();
    updateProviderMock.mockRejectedValue(WRITE_ERROR);
    const { result } = renderHook(() => useUpdateProvider(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          id: PROVIDER.id,
          provider: PROVIDER_DRAFT,
        }),
      ).rejects.toEqual(WRITE_ERROR);
    });
    expect(isInvalidated(providersKeys.all)).toBe(false);
    expect(isInvalidated(unifiedModelsKeys.all)).toBe(false);
  });

  it("rejects with the AppError and invalidates nothing on a unified write", async () => {
    seedCaches();
    deleteUnifiedModelMock.mockRejectedValue(WRITE_ERROR);
    const { result } = renderHook(() => useDeleteUnifiedModel(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: UNIFIED.id }),
      ).rejects.toEqual(WRITE_ERROR);
    });
    expect(isInvalidated(unifiedModelsKeys.all)).toBe(false);
    expect(isInvalidated(providersKeys.all)).toBe(false);
  });
});
