import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Entry, PathPage } from "@/types/ipc";

import {
  appendEntryToWindow,
  MESSAGE_MAX_PAGES,
  MESSAGE_PAGE_SIZE,
  type MessageWindow,
  type PathPageParam,
} from "@/lib/message-window";
import { messagesKeys } from "@/lib/query-keys";

// These tests drive the real @tanstack/react-query kernel (InfiniteQueryObserver
// with maxPages) against an in-memory active path, so the window functions are
// validated against actual infinite-query pagination behavior, not a fake cache.

const SESSION_ID = "s1";
const INITIAL_PAGE_PARAM: PathPageParam = { kind: "tail" };

let client: QueryClient;
let path: Entry[];
const unsubscribers: Array<() => void> = [];

type MessageWindowObserver = InfiniteQueryObserver<
  PathPage,
  Error,
  MessageWindow,
  ReturnType<typeof messagesKeys.bySession>,
  PathPageParam
>;

function buildPath(count: number): Entry[] {
  return Array.from({ length: count }, (_, index) =>
    entry(`e${String(index)}`, index === 0 ? null : `e${String(index - 1)}`),
  );
}

function cachedData(): MessageWindow | undefined {
  return client.getQueryData<MessageWindow>(messagesKeys.bySession(SESSION_ID));
}

function createObserver(): MessageWindowObserver {
  const observer: MessageWindowObserver = new InfiniteQueryObserver(client, {
    getNextPageParam: (lastPage) =>
      lastPage.prevCursor === null
        ? undefined
        : { cursor: lastPage.prevCursor, kind: "before" },
    getPreviousPageParam: (firstPage) =>
      firstPage.nextCursor === null
        ? undefined
        : { cursor: firstPage.nextCursor, kind: "after" },
    initialPageParam: INITIAL_PAGE_PARAM,
    maxPages: MESSAGE_MAX_PAGES,
    networkMode: "always",
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    queryKey: messagesKeys.bySession(SESSION_ID),
    staleTime: Infinity,
  });
  unsubscribers.push(observer.subscribe(() => {}));
  return observer;
}

function currentData(observer: MessageWindowObserver): MessageWindow {
  const data = observer.getCurrentResult().data;
  if (!data) {
    throw new Error("expected the observer window to be loaded");
  }
  return data;
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

function expectWindowInvariants(data: MessageWindow): void {
  expect(data.pageParams).toHaveLength(data.pages.length);
  expect(data.pages.length).toBeLessThanOrEqual(MESSAGE_MAX_PAGES);
  for (const page of data.pages) {
    expect(page.entries.length).toBeLessThanOrEqual(MESSAGE_PAGE_SIZE);
  }
  const entries = oldestToNewest(data);
  expect(entries.length).toBeLessThanOrEqual(
    MESSAGE_MAX_PAGES * MESSAGE_PAGE_SIZE,
  );
  expect(new Set(entries.map((node) => node.id)).size).toBe(entries.length);
  for (let index = 1; index < entries.length; index += 1) {
    expect(entries[index]?.parentId).toBe(entries[index - 1]?.id);
  }
}

// Serves the PathPage contract of the real commands: tail reads the newest
// window, before/after read the adjacent page excluding the cursor, entries
// stay oldest-to-newest, cursors are the page's own boundary entry ids.
function fetchPage(param: PathPageParam): PathPage {
  switch (param.kind) {
    case "after": {
      const index = path.findIndex((node) => node.id === param.cursor);
      if (index < 0 || index === path.length - 1) {
        throw new Error(`invalid after cursor ${param.cursor}`);
      }
      const start = index + 1;
      const end = Math.min(path.length, start + MESSAGE_PAGE_SIZE);
      return {
        entries: path.slice(start, end),
        nextCursor: end < path.length ? (path[end - 1]?.id ?? null) : null,
        prevCursor: path[start]?.id ?? null,
      };
    }
    case "before": {
      const index = path.findIndex((node) => node.id === param.cursor);
      if (index < 1) {
        throw new Error(`invalid before cursor ${param.cursor}`);
      }
      const end = index;
      const start = Math.max(0, end - MESSAGE_PAGE_SIZE);
      return {
        entries: path.slice(start, end),
        nextCursor: path[end - 1]?.id ?? null,
        prevCursor: start > 0 ? (path[start]?.id ?? null) : null,
      };
    }
    case "tail": {
      const start = Math.max(0, path.length - MESSAGE_PAGE_SIZE);
      return {
        entries: path.slice(start),
        nextCursor: null,
        prevCursor: start > 0 ? (path[start]?.id ?? null) : null,
      };
    }
  }
}

function oldestToNewest(data: MessageWindow): Entry[] {
  return [...data.pages].reverse().flatMap((page) => page.entries);
}

async function settle(observer: MessageWindowObserver): Promise<void> {
  await vi.waitFor(() => {
    const result = observer.getCurrentResult();
    expect(result.isFetching).toBe(false);
    expect(result.status).toBe("success");
  });
}

beforeEach(() => {
  client = new QueryClient();
});

afterEach(() => {
  for (const unsubscribe of unsubscribers.splice(0)) {
    unsubscribe();
  }
  client.clear();
});

describe("message window over the real infinite-query kernel", () => {
  it("mounts a single tail page", async () => {
    path = buildPath(1500);
    const observer = createObserver();
    await settle(observer);
    const data = currentData(observer);
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0]?.entries).toHaveLength(MESSAGE_PAGE_SIZE);
    expect(data.pages[0]?.entries.at(-1)?.id).toBe("e1499");
    expect(data.pages[0]?.nextCursor).toBeNull();
    expect(data.pageParams).toEqual([{ kind: "tail" }]);
  });

  it("evicts the newest end while paging toward history and restores the tail on the way back", async () => {
    path = buildPath(1500);
    const observer = createObserver();
    await settle(observer);
    // Initial tail page plus 9 older fills the 10-page window.
    for (let round = 0; round < 9; round += 1) {
      await observer.fetchNextPage();
      await settle(observer);
    }
    expectWindowInvariants(currentData(observer));
    expect(currentData(observer).pages).toHaveLength(MESSAGE_MAX_PAGES);
    expect(currentData(observer).pages[0]?.nextCursor).toBeNull();
    // The 10th older page evicts the newest end: the tail leaves the window.
    await observer.fetchNextPage();
    await settle(observer);
    const evicted = currentData(observer);
    expectWindowInvariants(evicted);
    expect(evicted.pages).toHaveLength(MESSAGE_MAX_PAGES);
    expect(evicted.pages[0]?.nextCursor).not.toBeNull();
    expect(oldestToNewest(evicted).at(-1)?.id).toBe("e1449");
    // Paging back re-prepends the tail page and evicts the oldest end.
    await observer.fetchPreviousPage();
    await settle(observer);
    const restored = currentData(observer);
    expectWindowInvariants(restored);
    expect(restored.pages[0]?.nextCursor).toBeNull();
    expect(oldestToNewest(restored).at(-1)?.id).toBe("e1499");
    const restoredIds = oldestToNewest(restored).map((node) => node.id);
    // At the newest end, further previous fetches are no-ops.
    await observer.fetchPreviousPage();
    await settle(observer);
    expect(
      oldestToNewest(currentData(observer)).map((node) => node.id),
    ).toEqual(restoredIds);
  });

  it("reuses the after pageParam as the first param on refetch", async () => {
    path = buildPath(1500);
    const observer = createObserver();
    await settle(observer);
    for (let round = 0; round < 10; round += 1) {
      await observer.fetchNextPage();
      await settle(observer);
    }
    await observer.fetchPreviousPage();
    await settle(observer);
    const before = currentData(observer);
    expect(before.pageParams[0]?.kind).toBe("after");
    await observer.refetch();
    await settle(observer);
    const after = currentData(observer);
    expectWindowInvariants(after);
    expect(
      after.pages.map((page) => page.entries.map((node) => node.id)),
    ).toEqual(before.pages.map((page) => page.entries.map((node) => node.id)));
    expect(after.pageParams).toEqual(before.pageParams);
  });

  it("resets to a fresh tail page when a send lands while the tail is evicted", async () => {
    path = buildPath(1500);
    const observer = createObserver();
    await settle(observer);
    for (let round = 0; round < 10; round += 1) {
      await observer.fetchNextPage();
      await settle(observer);
    }
    expect(currentData(observer).pages[0]?.nextCursor).not.toBeNull();
    const appended = entry("n0", "e1499");
    path.push(appended);
    expect(appendEntryToWindow(cachedData(), appended)).toBeNull();
    await client.resetQueries({ queryKey: messagesKeys.bySession(SESSION_ID) });
    await settle(observer);
    const data = currentData(observer);
    expectWindowInvariants(data);
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0]?.entries.at(-1)?.id).toBe("n0");
    expect(data.pages[0]?.nextCursor).toBeNull();
  });

  it("keeps the window bounded across 600 sequential appends", async () => {
    path = buildPath(1500);
    const observer = createObserver();
    await settle(observer);
    expect(currentData(observer).pages[0]?.entries).toHaveLength(
      MESSAGE_PAGE_SIZE,
    );

    let lastId = "e1499";
    for (let round = 0; round < 600; round += 1) {
      const appended = entry(`n${String(round)}`, lastId);
      path.push(appended);
      const next = appendEntryToWindow(cachedData(), appended);
      expect(next, `append round ${String(round)}`).not.toBeNull();
      if (!next) {
        return;
      }
      client.setQueryData<MessageWindow>(
        messagesKeys.bySession(SESSION_ID),
        next,
      );
      lastId = `n${String(round)}`;
      expectWindowInvariants(next);
      // Every merge leaves the window's newest page holding the path tail.
      expect(next.pages[0]?.nextCursor).toBeNull();
      if (round === 0) {
        // The tail page was full, so the send opened a one-entry page.
        const merged = cachedData();
        expect(merged?.pages[0]?.entries).toHaveLength(1);
        expect(merged?.pages[1]?.nextCursor).toBe("e1499");
      }
    }

    const final = cachedData();
    expect(final).toBeDefined();
    if (!final) {
      return;
    }
    expect(final.pages).toHaveLength(MESSAGE_MAX_PAGES);
    expect(oldestToNewest(final).map((node) => node.id)).toEqual(
      path.slice(-MESSAGE_MAX_PAGES * MESSAGE_PAGE_SIZE).map((node) => node.id),
    );
    expect(final.pages[0]?.entries.at(-1)?.id).toBe("n599");
    expect(final.pages[0]?.nextCursor).toBeNull();
    // A duplicate delivery of the newest entry leaves the cache untouched.
    expect(appendEntryToWindow(final, entry("n599", "n598"))).toBe(final);
  });

  it("merges the first root send into an empty-path window", async () => {
    path = [];
    const observer = createObserver();
    await settle(observer);
    const empty = currentData(observer);
    expect(empty.pages).toHaveLength(1);
    expect(empty.pages[0]?.entries).toHaveLength(0);
    expect(empty.pages[0]?.nextCursor).toBeNull();

    const root = entry("r0", null);
    path.push(root);
    const next = appendEntryToWindow(currentData(observer), root);
    expect(next).not.toBeNull();
    if (!next) {
      return;
    }
    client.setQueryData<MessageWindow>(
      messagesKeys.bySession(SESSION_ID),
      next,
    );
    const merged = currentData(observer);
    expect(merged.pages[0]?.entries.map((node) => node.id)).toEqual(["r0"]);
    expect(merged.pages[0]?.nextCursor).toBeNull();
    expect(merged.pages[0]?.prevCursor).toBeNull();
    expect(merged.pageParams).toEqual([{ kind: "tail" }]);
  });
});
