import { act, renderHook, waitFor } from "@testing-library/react";
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
  vi.resetAllMocks();
});

describe("compat resolution", () => {
  it("resolves every family with the settled draft", async () => {
    resolveCompatMock.mockResolvedValue(RESOLUTION);
    const families = ["anthropic-messages", "openai-completions"] as const;
    const input = inputWith("https://gateway.example/v1");

    const { result } = renderHook(() => useCompatResolution(families, input));

    await waitFor(() => {
      expect(result.current["openai-completions"]).toBeDefined();
    });
    expect(result.current["anthropic-messages"]).toEqual(RESOLUTION);
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
      expect(result.current["openai-completions"]).toEqual(RESOLUTION);
    });

    // The first run's result arrives after the newer one: it must not
    // overwrite the state the panel is showing.
    await act(async () => {
      late.resolve(stale);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(result.current["openai-completions"]).toEqual(RESOLUTION);
  });
});
