import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProviderDraft, ResolvedCompat } from "@/types/ipc";

import { resolveCompat } from "@/lib/ipc/providers";

import type { CompatResolutionInput } from "./use-compat-resolution";

import {
  COMPAT_RESOLVE_DEBOUNCE_MS,
  useCompatResolution,
} from "./use-compat-resolution";

vi.mock("@/lib/ipc/providers", () => ({ resolveCompat: vi.fn() }));

const resolveCompatMock = vi.mocked(resolveCompat);

const DRAFT: ProviderDraft = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "",
  baseUrl: "https://gateway.example/v1",
  enabled: true,
  maxRetries: 2,
  name: "Gateway",
  reasoningOutput: "auto",
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 120_000,
};

const RESOLUTION: ResolvedCompat = {
  sources: { supportsStore: "provider" },
  values: { supportsStore: false },
};

function inputWith(baseUrl: string): CompatResolutionInput {
  return { provider: { ...DRAFT, baseUrl } };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, COMPAT_RESOLVE_DEBOUNCE_MS * 2);
    });
  });
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("compat resolution", () => {
  it("resolves every family with the settled draft", async () => {
    resolveCompatMock.mockResolvedValue(RESOLUTION);
    const families = ["anthropic-messages", "openai-completions"] as const;
    const input = inputWith("https://gateway.example/v1");

    const { result } = renderHook(() => useCompatResolution(families, input));

    await waitFor(() => {
      expect(result.current.data["openai-completions"]).toBeDefined();
    });
    expect(result.current.data["anthropic-messages"]).toEqual(RESOLUTION);
    expect(resolveCompatMock).toHaveBeenCalledTimes(2);
    expect(resolveCompatMock).toHaveBeenCalledWith({
      protocol: "anthropic-messages",
      provider: input.provider,
    });
  });

  it("collapses a burst of draft edits into one resolve per family", async () => {
    resolveCompatMock.mockResolvedValue(RESOLUTION);
    const families = ["openai-completions"] as const;

    const { rerender } = renderHook(
      ({ input }: { input: CompatResolutionInput }) =>
        // A fresh family array per render: an identity change alone must not
        // trigger a resolve.
        useCompatResolution([...families], input),
      { initialProps: { input: inputWith("https://a.example") } },
    );
    await waitFor(() => {
      expect(resolveCompatMock).toHaveBeenCalledTimes(1);
    });

    rerender({ input: inputWith("https://ab.example") });
    rerender({ input: inputWith("https://abc.example") });
    await settle();

    expect(resolveCompatMock).toHaveBeenCalledTimes(2);
    expect(resolveCompatMock.mock.calls[1]?.[0].provider.baseUrl).toBe(
      "https://abc.example",
    );
  });

  it("marks previous defaults as loading as soon as the URL changes", async () => {
    const next: ResolvedCompat = {
      presetId: "anthropic",
      sources: {},
      values: {},
    };
    resolveCompatMock
      .mockResolvedValueOnce({ ...RESOLUTION, presetId: "openai" })
      .mockResolvedValue(next);
    const { rerender, result } = renderHook(
      ({ input }: { input: CompatResolutionInput }) =>
        useCompatResolution(["openai-completions"], input),
      { initialProps: { input: inputWith("https://api.openai.com/v1") } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender({ input: inputWith("https://api.anthropic.com") });
    expect(result.current.isLoading).toBe(true);
    expect(resolveCompatMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data["openai-completions"]).toEqual(next);
    });
  });

  it("keeps the newest run's resolution when an older run lands late", async () => {
    const late: { resolve: (value: ResolvedCompat) => void } = {
      resolve: () => undefined,
    };
    resolveCompatMock
      .mockImplementationOnce(
        () =>
          new Promise<ResolvedCompat>((resolve) => {
            late.resolve = resolve;
          }),
      )
      .mockResolvedValue(RESOLUTION);
    const families = ["openai-completions"] as const;
    const stale: ResolvedCompat = {
      sources: { supportsStore: "familyDefault" },
      values: { supportsStore: true },
    };

    const { rerender, result } = renderHook(
      ({ input }: { input: CompatResolutionInput }) =>
        useCompatResolution(families, input),
      { initialProps: { input: inputWith("https://a.example") } },
    );
    await waitFor(() => {
      expect(resolveCompatMock).toHaveBeenCalledTimes(1);
    });

    rerender({ input: inputWith("https://b.example") });
    await settle();
    await waitFor(() => {
      expect(result.current.data["openai-completions"]).toEqual(RESOLUTION);
    });

    // The first run's result arrives after the newer one: it must not
    // overwrite the state the panel is showing.
    await act(async () => {
      late.resolve(stale);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(result.current.data["openai-completions"]).toEqual(RESOLUTION);
  });

  it("clears stale values after failure and retries without changing the draft", async () => {
    resolveCompatMock
      .mockResolvedValueOnce(RESOLUTION)
      .mockRejectedValueOnce(new Error("invalid unsigned integer"))
      .mockResolvedValue(RESOLUTION);
    const families = ["openai-completions"] as const;
    const { rerender, result } = renderHook(
      ({ input }: { input: CompatResolutionInput }) =>
        useCompatResolution(families, input),
      { initialProps: { input: inputWith("https://first.example") } },
    );
    await waitFor(() =>
      expect(result.current.data["openai-completions"]).toEqual(RESOLUTION),
    );
    rerender({ input: inputWith("https://second.example") });
    await settle();
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.data).toEqual({});
    expect(result.current.isLoading).toBe(false);
    act(() => result.current.retry());
    await waitFor(() =>
      expect(result.current.data["openai-completions"]).toEqual(RESOLUTION),
    );
    expect(result.current.error).toBeNull();
    expect(resolveCompatMock).toHaveBeenCalledTimes(3);
  });

  it("consumes a rejection after unmount without updating an abandoned editor", async () => {
    let reject: (error: Error) => void = () => undefined;
    resolveCompatMock.mockImplementation(
      () =>
        new Promise<ResolvedCompat>((_resolve, rejectResult) => {
          reject = rejectResult;
        }),
    );
    const { unmount } = renderHook(() =>
      useCompatResolution(["openai-completions"], { provider: DRAFT }),
    );
    unmount();
    await act(async () => {
      reject(new Error("late failure"));
      await Promise.resolve();
    });
    expect(resolveCompatMock).toHaveBeenCalledTimes(1);
  });
});
