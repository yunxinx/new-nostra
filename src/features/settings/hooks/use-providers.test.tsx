import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AppError,
  Provider,
  ProviderDraft,
  Providers,
  UnifiedModel,
  UnifiedModelListItem,
} from "@/types/ipc";

import {
  clearDefaultModel,
  createProvider,
  createUnifiedModel,
  deleteProvider,
  deleteUnifiedModel,
  listProviders,
  listUnifiedModels,
  setDefaultModel,
  updateProvider,
  updateUnifiedModel,
} from "@/lib/ipc/providers";
import { providersKeys, unifiedModelsKeys } from "@/lib/query-keys";

import {
  useClearDefaultModel,
  useCreateProvider,
  useCreateUnifiedModel,
  useDeleteProvider,
  useDeleteUnifiedModel,
  useProviders,
  useSetDefaultModel,
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
  clearDefaultModel: vi.fn(),
  createProvider: vi.fn(),
  createUnifiedModel: vi.fn(),
  deleteProvider: vi.fn(),
  deleteUnifiedModel: vi.fn(),
  listProviders: vi.fn(),
  listUnifiedModels: vi.fn(),
  setDefaultModel: vi.fn(),
  updateProvider: vi.fn(),
  updateUnifiedModel: vi.fn(),
}));

const clearDefaultModelMock = vi.mocked(clearDefaultModel);
const createProviderMock = vi.mocked(createProvider);
const createUnifiedModelMock = vi.mocked(createUnifiedModel);
const deleteProviderMock = vi.mocked(deleteProvider);
const deleteUnifiedModelMock = vi.mocked(deleteUnifiedModel);
const listProvidersMock = vi.mocked(listProviders);
const listUnifiedModelsMock = vi.mocked(listUnifiedModels);
const setDefaultModelMock = vi.mocked(setDefaultModel);
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

const UNIFIED: UnifiedModel = {
  hide: false,
  id: "fast",
  members: [{ model: "m1", providerId: "p1" }],
};

const READ_ERROR: AppError = { code: "db", message: "read failed" };
const WRITE_ERROR: AppError = { code: "invalid_input", message: "bad draft" };

let queryClient: QueryClient;

function isInvalidated(key: readonly unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated === true;
}

// The mutation tests assert on the two seeded root queries: with no observers
// attached, an invalidation marks the cache entry without a refetch racing the
// assertion.
function seedCaches(): void {
  queryClient.setQueryData<Providers>(providersKeys.all, {
    defaultModel: null,
    providers: [],
  });
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
  it("fills the providers cache and projects the default reference", async () => {
    const payload: Providers = {
      defaultModel: { modelId: "m1", providerId: "p1" },
      providers: [PROVIDER],
    };
    listProvidersMock.mockResolvedValue(payload);
    const { result } = renderHook(() => useProviders(), { wrapper: Wrapper });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.providers).toEqual([PROVIDER]);
    expect(result.current.defaultModel).toEqual({
      modelId: "m1",
      providerId: "p1",
    });
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

  it("set default invalidates only the provider list", async () => {
    seedCaches();
    setDefaultModelMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSetDefaultModel(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ modelId: "m1", providerId: "p1" });
    });
    expect(setDefaultModelMock).toHaveBeenCalledWith(
      {
        modelId: "m1",
        providerId: "p1",
      },
      expect.anything(),
    );
    expect(isInvalidated(providersKeys.all)).toBe(true);
    expect(isInvalidated(unifiedModelsKeys.all)).toBe(false);
  });

  it("clear default invalidates only the provider list", async () => {
    seedCaches();
    clearDefaultModelMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClearDefaultModel(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(clearDefaultModelMock).toHaveBeenCalledWith(
      undefined,
      expect.anything(),
    );
    expect(isInvalidated(providersKeys.all)).toBe(true);
    expect(isInvalidated(unifiedModelsKeys.all)).toBe(false);
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
