import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AppError, Entry, PathPage } from "@/types/ipc";

import {
  MESSAGE_MAX_PAGES,
  MESSAGE_PAGE_SIZE,
  type MessageWindow,
} from "@/lib/message-window";
import { messagesKeys } from "@/lib/query-keys";

import { type ActivePathResult, useActivePath } from "./use-active-path";

// These tests drive the real infinite-query kernel through the hook against a
// mockIPC path server implementing the tail/before/after contract, so the
// window, direction guards, and cursor recovery are validated against actual
// cache behavior.

const SESSION_ID = "s1";

let queryClient: QueryClient;
let path: Entry[];
let loadCalls: string[];
let invalidBefore: boolean;
let failTail: boolean;

function buildPath(count: number): Entry[] {
  return Array.from({ length: count }, (_, index) =>
    entry(`e${String(index)}`, index === 0 ? null : `e${String(index - 1)}`),
  );
}

function cachedWindow(): MessageWindow | undefined {
  return queryClient.getQueryData<MessageWindow>(
    messagesKeys.bySession(SESSION_ID),
  );
}

function entry(id: string, parentId: null | string): Entry {
  return {
    content: [{ text: `m${id}`, type: "text" }],
    createdAt: "2026-09-09T00:00:00.000Z",
    id,
    parentId,
    role: "user",
    type: "message",
  };
}

function renderActivePath() {
  return renderHook(() => useActivePath(SESSION_ID), {
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    },
  });
}

function serveAfter(cursor: string, limit: number): PathPage {
  loadCalls.push(`after:${cursor}`);
  const index = path.findIndex((node) => node.id === cursor);
  if (index < 0 || index === path.length - 1) {
    throwAppError("invalid_input", `invalid after cursor ${cursor}`);
  }
  const start = index + 1;
  const end = Math.min(path.length, start + limit);
  return {
    entries: path.slice(start, end),
    nextCursor: end < path.length ? (path[end - 1]?.id ?? null) : null,
    prevCursor: path[start]?.id ?? null,
  };
}

function serveBefore(cursor: string, limit: number): PathPage {
  loadCalls.push(`before:${cursor}`);
  const index = path.findIndex((node) => node.id === cursor);
  if (index < 1) {
    throwAppError("invalid_input", `invalid before cursor ${cursor}`);
  }
  const end = index;
  const start = Math.max(0, end - limit);
  return {
    entries: path.slice(start, end),
    nextCursor: path[end - 1]?.id ?? null,
    prevCursor: start > 0 ? (path[start]?.id ?? null) : null,
  };
}

function serveTail(limit: number): PathPage {
  loadCalls.push("tail");
  if (failTail) {
    throwAppError("db", "tail read failed");
  }
  const start = Math.max(0, path.length - limit);
  return {
    entries: path.slice(start),
    nextCursor: null,
    prevCursor: start > 0 ? (path[start]?.id ?? null) : null,
  };
}

async function settle(result: { current: ActivePathResult }) {
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });
}

// The wire protocol rejects with the serialized AppError object, not an
// Error instance; plain throws need the escape hatch.
function throwAppError(code: AppError["code"], message: string): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- mockIPC rejects with the AppError JSON shape the Rust boundary produces; undo when the mocks module types its rejections.
  throw { code, message } satisfies AppError;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  path = buildPath(1500);
  loadCalls = [];
  invalidBefore = false;
  failTail = false;
  mockIPC((command, payload) => {
    const { params } = payload as {
      params: { cursor?: string; limit?: number; sessionId: string };
    };
    expect(params.sessionId).toBe(SESSION_ID);
    switch (command) {
      case "load_active_path":
        return serveTail(params.limit ?? 50);
      case "load_active_path_after":
        return serveAfter(params.cursor ?? "", params.limit ?? 50);
      case "load_active_path_before": {
        if (invalidBefore) {
          throwAppError("invalid_input", "stale cursor");
        }
        return serveBefore(params.cursor ?? "", params.limit ?? 50);
      }
      default:
        throw new Error(`Unexpected IPC command: ${command}`);
    }
  });
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  clearMocks();
});

describe("useActivePath", () => {
  it("mounts a single tail page, oldest-to-newest", async () => {
    const { result } = renderActivePath();
    await settle(result);
    expect(result.current.messages).toHaveLength(MESSAGE_PAGE_SIZE);
    expect(result.current.messages.at(-1)?.id).toBe("e1499");
    expect(result.current.messages[0]?.id).toBe("e1450");
    expect(result.current.hasNewerPages).toBe(false);
    expect(result.current.hasOlderPages).toBe(true);
  });

  it("pages both directions through the window and back to the tail", async () => {
    const { result } = renderActivePath();
    await settle(result);
    for (let round = 1; round <= 10; round += 1) {
      act(() => result.current.loadOlder());
      await waitFor(() => {
        expect(
          loadCalls.filter((call) => call.startsWith("before:")),
        ).toHaveLength(round);
      });
    }
    // The 10th older page evicted the newest end.
    await waitFor(() => {
      expect(result.current.hasNewerPages).toBe(true);
    });
    expect(result.current.messages).toHaveLength(
      MESSAGE_MAX_PAGES * MESSAGE_PAGE_SIZE,
    );

    act(() => result.current.loadNewer());
    await waitFor(() => {
      expect(result.current.messages.at(-1)?.id).toBe("e1499");
    });
    expect(result.current.hasNewerPages).toBe(false);
  });

  it("ignores a same-direction double trigger while a page fetch is in flight", async () => {
    const { result } = renderActivePath();
    await settle(result);
    act(() => {
      result.current.loadOlder();
      result.current.loadOlder();
    });
    await waitFor(() => {
      expect(result.current.messages).toHaveLength(MESSAGE_PAGE_SIZE * 2);
    });
    expect(loadCalls.filter((call) => call.startsWith("before:"))).toHaveLength(
      1,
    );
  });

  it("resets to a single tail page via resetToTail after the tail was evicted", async () => {
    const { result } = renderActivePath();
    await settle(result);
    for (let round = 1; round <= 10; round += 1) {
      act(() => result.current.loadOlder());
      await waitFor(() => {
        expect(
          loadCalls.filter((call) => call.startsWith("before:")),
        ).toHaveLength(round);
      });
    }
    expect(result.current.hasNewerPages).toBe(true);
    await act(() => result.current.resetToTail());
    await settle(result);
    expect(result.current.messages).toHaveLength(MESSAGE_PAGE_SIZE);
    expect(result.current.messages.at(-1)?.id).toBe("e1499");
    expect(result.current.hasNewerPages).toBe(false);
  });

  it("resets a cached window whose tail was evicted when the session is re-entered", async () => {
    // A stale history window left behind by a previous visit: its newest page
    // no longer holds the tail.
    queryClient.setQueryData<MessageWindow>(
      messagesKeys.bySession(SESSION_ID),
      {
        pageParams: [{ kind: "tail" }],
        pages: [
          {
            entries: path.slice(1400, 1450),
            nextCursor: "e1449",
            prevCursor: "e1400",
          },
        ],
      },
    );
    const { result } = renderActivePath();
    // The mount effect resets; the observer refetches the real tail.
    await settle(result);
    expect(result.current.messages.at(-1)?.id).toBe("e1499");
    expect(cachedWindow()?.pages).toHaveLength(1);
  });

  it("recovers once from an invalid cursor by resetting to tail", async () => {
    invalidBefore = true;
    const { result } = renderActivePath();
    await settle(result);
    act(() => result.current.loadOlder());
    // Recovery reads the tail a second time (initial load + reset).
    await waitFor(() => {
      expect(loadCalls.filter((call) => call === "tail")).toHaveLength(2);
    });
    await settle(result);
    expect(result.current.messages.at(-1)?.id).toBe("e1499");
    expect(result.current.messages).toHaveLength(MESSAGE_PAGE_SIZE);
  });

  it("surfaces the error without looping when the tail read also fails", async () => {
    invalidBefore = true;
    const { result } = renderActivePath();
    await settle(result);
    failTail = true;
    act(() => result.current.loadOlder());
    await waitFor(() => {
      expect(result.current.error?.code).toBe("db");
    });
    // One reset attempt (initial load + one retry), then the error stands:
    // no reset loop.
    expect(loadCalls.filter((call) => call === "tail")).toHaveLength(2);
  });
});
