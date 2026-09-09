import type { ReactNode } from "react";

import {
  type InfiniteData,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError, Session, SessionPage } from "@/types/ipc";

import { type ListSessionsParams } from "@/lib/ipc/sessions";
import { messagesKeys, sessionsKeys } from "@/lib/query-keys";
import { useUiStore } from "@/stores/ui-store";

import {
  SESSION_ROW_ANIMATION_MS,
  useDeleteSession,
  useRenameSession,
  useSessions,
  useSetSessionPinned,
} from "./use-sessions";

// These tests drive the real @tanstack/react-query kernel (useInfiniteQuery
// observers) against a mockIPC list_sessions that implements the keyset
// contract, so pagination, invalidation, and reset semantics are validated
// against actual cache behavior.

const PAGE_SIZE = 4;
const SAME_TIMESTAMP = "2026-09-09T00:00:00.000Z";

let sessions: Session[];
let listCalls: Array<null | { id: string; updatedAt: string }>;
let failList: boolean;
let deferredList: ((resolve: PageResolver) => void) | null;

let queryClient: QueryClient;

type PageResolver = (value: PromiseLike<SessionPage> | SessionPage) => void;

// Keyset predicate for (updatedAt DESC, id DESC) ordering.
function compareKeyset(
  a: { id: string; updatedAt: string },
  b: { id: string; updatedAt: string },
): number {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt < b.updatedAt ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
}

function isAfterCursor(
  session: Session,
  cursor: { id: string; updatedAt: string },
): boolean {
  return compareKeyset(session, cursor) < 0;
}

function listPage(params: ListSessionsParams): SessionPage {
  const pool = sessions
    .filter((session) => session.pinned === params.pinned)
    .sort((a, b) => compareKeyset(b, a));
  const cursor = params.cursor;
  const remaining = cursor
    ? pool.filter((session) => isAfterCursor(session, cursor))
    : pool;
  const rows = remaining.slice(0, PAGE_SIZE);
  const lastRow = rows.at(-1);
  listCalls.push(params.cursor ?? null);
  return {
    nextCursor:
      remaining.length > rows.length && lastRow
        ? { id: lastRow.id, updatedAt: lastRow.updatedAt }
        : null,
    sessions: rows,
  };
}

function makeSessions(pinned: boolean, count: number): Session[] {
  return Array.from({ length: count }, (_, index) => ({
    createdAt: SAME_TIMESTAMP,
    id: `${pinned ? "p" : "n"}${String(index).padStart(2, "0")}`,
    pinned,
    title: `Session ${pinned ? "p" : "n"}${String(index)}`,
    updatedAt: SAME_TIMESTAMP,
  }));
}

function standardListData(): InfiniteData<SessionPage> | undefined {
  return queryClient.getQueryData<InfiniteData<SessionPage>>(
    sessionsKeys.list(false),
  );
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
  sessions = [...makeSessions(false, 20), ...makeSessions(true, 20)];
  listCalls = [];
  failList = false;
  deferredList = null;
  mockIPC((command, payload) => {
    if (command === "list_sessions") {
      if (failList) {
        // The wire protocol rejects with the serialized AppError object, not
        // an Error instance; plain throws need the escape hatch.
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- mockIPC rejects with the AppError JSON shape the Rust boundary produces; undo when the mocks module types its rejections.
        throw { code: "db", message: "list failed" } satisfies AppError;
      }
      if (deferredList) {
        const deferred = deferredList;
        return new Promise<SessionPage>(deferred);
      }
      const { params } = payload as { params: ListSessionsParams };
      return listPage(params);
    }
    if (command === "rename_session") {
      const {
        params: { sessionId, title },
      } = payload as { params: { sessionId: string; title: string } };
      const target = sessions.find((session) => session.id === sessionId);
      if (target) {
        target.title = title;
      }
      return undefined;
    }
    if (command === "set_session_pinned") {
      const {
        params: { pinned, sessionId },
      } = payload as { params: { pinned: boolean; sessionId: string } };
      const target = sessions.find((session) => session.id === sessionId);
      if (target) {
        target.pinned = pinned;
      }
      return undefined;
    }
    if (command === "delete_session") {
      const {
        params: { sessionId },
      } = payload as { params: { sessionId: string } };
      sessions = sessions.filter((session) => session.id !== sessionId);
      return undefined;
    }
    throw new Error(`Unexpected IPC command: ${command}`);
  });
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  clearMocks();
});

async function renderUseSessions() {
  const { result } = renderHook(() => useSessions(), { wrapper: Wrapper });
  await waitFor(() => {
    expect(result.current.pinned.isLoading).toBe(false);
    expect(result.current.standard.isLoading).toBe(false);
  });
  return result;
}

describe("useSessions streams", () => {
  it("loads the first page of both pinned and standard streams on mount", async () => {
    const result = await renderUseSessions();
    expect(result.current.pinned.sessions.map((s) => s.id)).toEqual([
      "p19",
      "p18",
      "p17",
      "p16",
    ]);
    expect(result.current.standard.sessions.map((s) => s.id)).toEqual([
      "n19",
      "n18",
      "n17",
      "n16",
    ]);
    expect(result.current.hasSessions).toBe(true);
  });

  it("pages past three pages in both streams without duplicates or gaps", async () => {
    const result = await renderUseSessions();
    for (const pinned of [true, false]) {
      for (let round = 0; round < 4; round += 1) {
        act(() => result.current.loadMore(pinned));
        await waitFor(() => {
          const stream = pinned
            ? result.current.pinned
            : result.current.standard;
          expect(stream.isFetching).toBe(false);
        });
      }
      const stream = pinned ? result.current.pinned : result.current.standard;
      const ids = stream.sessions.map((s) => s.id);
      expect(ids).toHaveLength(20);
      expect(new Set(ids).size).toBe(20);
      expect(stream.hasNextPage).toBe(false);
    }
  });

  it("keeps same-timestamp sessions paginated by the id tiebreak", async () => {
    const result = await renderUseSessions();
    for (let round = 0; round < 4; round += 1) {
      act(() => result.current.loadMore(false));
      await waitFor(() => {
        expect(result.current.standard.isFetching).toBe(false);
      });
    }
    expect(result.current.standard.sessions.map((s) => s.id)).toEqual(
      Array.from(
        { length: 20 },
        (_, index) => `n${String(19 - index).padStart(2, "0")}`,
      ),
    );
  });

  it("echoes each cursor to list_sessions exactly once per page", async () => {
    const result = await renderUseSessions();
    for (let round = 0; round < 2; round += 1) {
      act(() => result.current.loadMore(false));
      await waitFor(() => {
        expect(result.current.standard.isFetching).toBe(false);
      });
    }
    expect(listCalls.filter((cursor) => cursor !== null)).toEqual([
      { id: "n16", updatedAt: SAME_TIMESTAMP },
      { id: "n12", updatedAt: SAME_TIMESTAMP },
    ]);
  });

  it("ignores loadMore while a fetch for the same stream is in flight", async () => {
    const result = await renderUseSessions();
    // The synchronous double call must not stack two page fetches.
    act(() => {
      result.current.loadMore(false);
      result.current.loadMore(false);
    });
    await waitFor(() => {
      expect(result.current.standard.isFetching).toBe(false);
    });
    expect(result.current.standard.sessions).toHaveLength(PAGE_SIZE * 2);
  });

  it("does not interrupt an invalidated list refresh with pagination", async () => {
    const result = await renderUseSessions();
    const resolvers: PageResolver[] = [];
    deferredList = (resolve) => {
      resolvers.push(resolve);
    };
    const { result: renameResult } = renderHook(() => useRenameSession(), {
      wrapper: Wrapper,
    });

    act(() =>
      renameResult.current.mutate({ sessionId: "n19", title: "Renamed" }),
    );
    await waitFor(() => {
      expect(result.current.standard.isFetching).toBe(true);
      expect(resolvers).toHaveLength(2);
    });
    act(() => result.current.loadMore(false));

    expect(resolvers).toHaveLength(2);
  });

  it("retains pagination when deletion empties the loaded pinned page", async () => {
    sessions = makeSessions(true, 5);
    const result = await renderUseSessions();
    const { result: remove } = renderHook(() => useDeleteSession(), {
      wrapper: Wrapper,
    });
    for (const id of ["p04", "p03", "p02", "p01"]) {
      await act(async () => {
        await remove.current.mutateAsync({ sessionId: id });
      });
    }
    await waitFor(() => expect(result.current.pinned.sessions).toEqual([]));
    expect(result.current.hasSessions).toBe(true);
    act(() => result.current.loadMore(true));
    await waitFor(() => {
      expect(result.current.pinned.sessions.map((row) => row.id)).toEqual([
        "p00",
      ]);
    });
  });

  it("does not restore a deleted row when an in-flight page resolves", async () => {
    const result = await renderUseSessions();
    let resolvePage: PageResolver | undefined;
    deferredList = (resolve) => {
      resolvePage = resolve;
    };
    const stalePage = listPage({
      cursor: { id: "n16", updatedAt: SAME_TIMESTAMP },
      pinned: false,
    });
    act(() => result.current.loadMore(false));
    await waitFor(() => expect(resolvePage).toBeDefined());
    const { result: remove } = renderHook(() => useDeleteSession(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await remove.current.mutateAsync({ sessionId: "n19" });
    });
    await act(async () => {
      resolvePage?.(stalePage);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.standard.sessions.map((row) => row.id)).toEqual([
        "n18",
        "n17",
        "n16",
      ]);
    });
  });

  it("does not report an empty library while the first page is loading", () => {
    sessions = [];
    let resolveFirst: PageResolver | undefined;
    deferredList = (resolve) => {
      resolveFirst = resolve;
    };
    const { result } = renderHook(() => useSessions(), { wrapper: Wrapper });
    expect(result.current.hasSessions).toBe(true);
    resolveFirst?.({ nextCursor: null, sessions: [] });
  });

  it("does not report an empty library after a load error", async () => {
    sessions = [];
    failList = true;
    const { result } = renderHook(() => useSessions(), { wrapper: Wrapper });
    await waitFor(() => {
      expect(result.current.pinned.error?.code).toBe("db");
    });
    expect(result.current.hasSessions).toBe(true);
    expect(result.current.pinned.sessions).toHaveLength(0);
  });

  it("reports an empty library only after both streams settle empty", async () => {
    sessions = [];
    const result = await renderUseSessions();
    expect(result.current.hasSessions).toBe(false);
  });
});

describe("session mutations", () => {
  it("refreshes titles in place after rename without resetting pages", async () => {
    const sessionsResult = await renderUseSessions();
    for (let round = 0; round < 2; round += 1) {
      act(() => sessionsResult.current.loadMore(false));
      await waitFor(() => {
        expect(sessionsResult.current.standard.isFetching).toBe(false);
      });
    }
    expect(sessionsResult.current.standard.sessions).toHaveLength(12);

    const { result: renameResult } = renderHook(() => useRenameSession(), {
      wrapper: Wrapper,
    });
    renameResult.current.mutate({ sessionId: "n19", title: "Renamed" });
    await waitFor(() => expect(renameResult.current.isSuccess).toBe(true));
    await waitFor(() => {
      expect(
        sessionsResult.current.standard.sessions.find(
          (session) => session.id === "n19",
        )?.title,
      ).toBe("Renamed");
    });
    // Rename never bumps updatedAt, so the loaded pages stay valid.
    expect(sessionsResult.current.standard.sessions).toHaveLength(12);
  });

  it("resets both streams to their first page after pinning", async () => {
    const sessionsResult = await renderUseSessions();
    for (let round = 0; round < 2; round += 1) {
      act(() => sessionsResult.current.loadMore(false));
      act(() => sessionsResult.current.loadMore(true));
      await waitFor(() => {
        expect(sessionsResult.current.standard.isFetching).toBe(false);
        expect(sessionsResult.current.pinned.isFetching).toBe(false);
      });
    }
    expect(standardListData()?.pages).toHaveLength(3);

    const { result: pinResult } = renderHook(() => useSetSessionPinned(), {
      wrapper: Wrapper,
    });
    pinResult.current.mutate({ pinned: true, sessionId: "n19" });
    await waitFor(() => expect(pinResult.current.isSuccess).toBe(true));

    // n19 left the standard stream, which restarted from its first page.
    await waitFor(() => {
      expect(sessionsResult.current.standard.sessions.map((s) => s.id)).toEqual(
        ["n18", "n17", "n16", "n15"],
      );
    });
    expect(standardListData()?.pages).toHaveLength(1);
    expect(standardListData()?.pageParams).toHaveLength(1);
    // The pinned stream reaches the newly pinned session without the
    // standard history having to be paged first.
    for (let round = 0; round < 5; round += 1) {
      act(() => sessionsResult.current.loadMore(true));
      await waitFor(() => {
        expect(sessionsResult.current.pinned.isFetching).toBe(false);
      });
    }
    const pinnedIds = sessionsResult.current.pinned.sessions.map((s) => s.id);
    expect(pinnedIds).toHaveLength(21);
    expect(pinnedIds).toContain("n19");
  });

  it("removes the deleted row from the loaded pages and clears the selection", async () => {
    const sessionsResult = await renderUseSessions();
    useUiStore.setState({ activeSessionId: "n19" });
    queryClient.setQueryData(messagesKeys.bySession("n19"), {
      pageParams: [],
      pages: [],
    });

    const { result: removeResult } = renderHook(() => useDeleteSession(), {
      wrapper: Wrapper,
    });
    removeResult.current.mutate({ sessionId: "n19" });
    await waitFor(() => expect(removeResult.current.isSuccess).toBe(true));

    // The row leaves the cache only after the exit animation window closes;
    // the loaded page keeps its shape and boundary cursor.
    await waitFor(() => {
      expect(sessionsResult.current.standard.sessions.map((s) => s.id)).toEqual(
        ["n18", "n17", "n16"],
      );
    });
    expect(standardListData()?.pages).toHaveLength(1);
    expect(standardListData()?.pageParams).toHaveLength(1);
    expect(useUiStore.getState().activeSessionId).toBeNull();
    expect(
      queryClient.getQueryData(messagesKeys.bySession("n19")),
    ).toBeUndefined();
  });

  it("holds the row in the caches for the exit window, then removes it from both loaded lists", async () => {
    vi.useFakeTimers();
    try {
      const before = ["n19", "n18", "n17", "n16"];
      queryClient.setQueryData(sessionsKeys.list(false), {
        pageParams: [null],
        pages: [
          {
            nextCursor: {
              id: "n15",
              updatedAt: SAME_TIMESTAMP,
            },
            sessions: sessions
              .filter((s) => !s.pinned)
              .sort((a, b) => compareKeyset(b, a))
              .slice(0, before.length),
          },
        ],
      });
      queryClient.setQueryData(sessionsKeys.list(true), {
        pageParams: [null],
        pages: [
          {
            nextCursor: null,
            sessions: sessions
              .filter((s) => s.pinned)
              .sort((a, b) => compareKeyset(b, a))
              .slice(0, 4),
          },
        ],
      });

      const { result } = renderHook(() => useDeleteSession(), {
        wrapper: Wrapper,
      });
      result.current.mutate({ sessionId: "p19" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      // The delete committed; the pinned row stays mounted while the exit
      // animation window runs.
      expect(
        queryClient
          .getQueryData<InfiniteData<SessionPage>>(sessionsKeys.list(true))
          ?.pages[0]?.sessions.map((s) => s.id),
      ).toContain("p19");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SESSION_ROW_ANIMATION_MS);
      });
      expect(result.current.isSuccess).toBe(true);
      expect(
        queryClient
          .getQueryData<InfiniteData<SessionPage>>(sessionsKeys.list(true))
          ?.pages[0]?.sessions.map((s) => s.id),
      ).toEqual(["p18", "p17", "p16"]);
      // The standard list was not holding the row; its cache is untouched.
      expect(
        queryClient
          .getQueryData<InfiniteData<SessionPage>>(sessionsKeys.list(false))
          ?.pages[0]?.sessions.map((s) => s.id),
      ).toEqual(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the selection when a non-active session is deleted", async () => {
    await renderUseSessions();
    useUiStore.setState({ activeSessionId: "n19" });

    const { result: removeResult } = renderHook(() => useDeleteSession(), {
      wrapper: Wrapper,
    });
    removeResult.current.mutate({ sessionId: "n01" });
    await waitFor(() => expect(removeResult.current.isSuccess).toBe(true));
    expect(useUiStore.getState().activeSessionId).toBe("n19");
  });

  it("does not let a late messages read rebuild the deleted session cache", async () => {
    await renderUseSessions();
    useUiStore.setState({ activeSessionId: "n19" });

    let resolveRead: ((page: unknown) => void) | undefined;
    const lateReadSettled = queryClient
      .query({
        queryFn: () =>
          new Promise<unknown>((resolve) => {
            resolveRead = resolve;
          }),
        queryKey: messagesKeys.bySession("n19"),
      })
      .then(
        () => undefined,
        () => undefined,
      );
    const { result: removeResult } = renderHook(() => useDeleteSession(), {
      wrapper: Wrapper,
    });
    removeResult.current.mutate({ sessionId: "n19" });
    await waitFor(() => expect(removeResult.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryData(messagesKeys.bySession("n19")),
    ).toBeUndefined();
    // The cancelled read resolving late must not recreate the cache entry.
    resolveRead?.({ pageParams: [], pages: [] });
    await lateReadSettled;
    expect(
      queryClient.getQueryData(messagesKeys.bySession("n19")),
    ).toBeUndefined();
  });
});
