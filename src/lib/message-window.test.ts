import { describe, expect, it } from "vitest";

import type { Entry, PathPage } from "@/types/ipc";

import {
  appendEntryToWindow,
  createTailWindow,
  MESSAGE_MAX_PAGES,
  MESSAGE_PAGE_SIZE,
  type MessageWindow,
  type PathPageParam,
} from "./message-window";

function chain(count: number): Entry[] {
  return Array.from({ length: count }, (_, index) => entry(index));
}

// Synthetic fixtures: chain(n) is a single-root path e0 -> e1 -> ... whose
// ids are the only contract the window functions rely on.
function entry(index: number): Entry {
  return {
    content: [{ text: `m${String(index)}`, type: "text" }],
    createdAt: "2026-09-09T00:00:00.000Z",
    id: `e${String(index)}`,
    parentId: index === 0 ? null : `e${String(index - 1)}`,
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
  expect(new Set(entries.map((node) => node.id)).size).toBe(entries.length);
  for (let index = 1; index < entries.length; index += 1) {
    expect(entries[index]?.parentId).toBe(entries[index - 1]?.id);
  }
  expect(data.pages[0]?.nextCursor).toBeNull();
  for (let index = 1; index < data.pages.length; index += 1) {
    expect(data.pageParams[index]).toEqual({
      cursor: data.pages[index - 1]?.entries[0]?.id,
      kind: "before",
    });
  }
}

function oldestToNewest(data: MessageWindow): Entry[] {
  return [...data.pages].reverse().flatMap((page) => page.entries);
}

function pageOf(
  entries: Entry[],
  hasOlder: boolean,
  hasNewer: boolean,
): PathPage {
  return {
    entries,
    nextCursor: hasNewer ? (entries.at(-1)?.id ?? null) : null,
    prevCursor: hasOlder ? (entries[0]?.id ?? null) : null,
  };
}

function paramsFor(pages: PathPage[]): PathPageParam[] {
  return pages.map((_, index) =>
    index === 0
      ? { kind: "tail" }
      : { cursor: pages[index - 1]?.entries[0]?.id ?? "", kind: "before" },
  );
}

// A well-formed window over chain(pageCount * MESSAGE_PAGE_SIZE): full pages,
// newest page first, tail present.
function windowOf(pageCount: number): MessageWindow {
  const total = pageCount * MESSAGE_PAGE_SIZE;
  const pages: PathPage[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const end = total - index * MESSAGE_PAGE_SIZE;
    const start = end - MESSAGE_PAGE_SIZE;
    pages.push(pageOf(chain(end).slice(start), start > 0, index > 0));
  }
  return { pageParams: paramsFor(pages), pages };
}

describe("createTailWindow", () => {
  it("builds a single tail page for a root entry", () => {
    const window = createTailWindow(entry(0));
    expect(window.pages[0]?.entries.map((node) => node.id)).toEqual(["e0"]);
    expect(window.pages[0]?.nextCursor).toBeNull();
    expect(window.pages[0]?.prevCursor).toBeNull();
    expect(window.pageParams).toEqual([{ kind: "tail" }]);
  });

  it("links a non-root first entry to its older parent", () => {
    const window = createTailWindow(entry(3));
    expect(window.pages[0]?.prevCursor).toBe("e3");
    expect(window.pages[0]?.nextCursor).toBeNull();
  });
});

describe("appendEntryToWindow merge rules", () => {
  it("appends into a non-full first page and keeps the tail param", () => {
    const partial: MessageWindow = {
      pageParams: [{ kind: "tail" }],
      pages: [pageOf(chain(49), true, false)],
    };
    const next = appendEntryToWindow(partial, entry(49));
    expect(next).not.toBeNull();
    if (!next) return;
    expectWindowInvariants(next);
    expect(next.pages[0]?.entries.map((node) => node.id)).toHaveLength(50);
    expect(next.pages[0]?.entries.at(-1)?.id).toBe("e49");
    expect(next.pages[0]?.prevCursor).toBe("e0");
    expect(next.pageParams).toEqual([{ kind: "tail" }]);
  });

  it("returns the input unchanged for a duplicate delivery", () => {
    const window = windowOf(2);
    // e99 is the newest entry of the tail page.
    expect(appendEntryToWindow(window, entry(99))).toBe(window);
  });

  it("opens a new one-entry page when the first page is full", () => {
    const window = windowOf(3);
    const next = appendEntryToWindow(window, entry(150));
    expect(next).not.toBeNull();
    if (!next) return;
    expectWindowInvariants(next);
    expect(next.pages).toHaveLength(4);
    expect(next.pages[0]?.entries.map((node) => node.id)).toEqual(["e150"]);
    // The former tail page's nextCursor becomes its own newest entry id.
    expect(next.pages[1]?.nextCursor).toBe("e149");
    expect(next.pageParams).toEqual([
      { kind: "tail" },
      { cursor: "e150", kind: "before" },
      { cursor: "e100", kind: "before" },
      { cursor: "e50", kind: "before" },
    ]);
  });

  it("evicts the oldest whole page past the cap and rebuilds pageParams", () => {
    const window = windowOf(MESSAGE_MAX_PAGES);
    const next = appendEntryToWindow(
      window,
      entry(MESSAGE_MAX_PAGES * MESSAGE_PAGE_SIZE),
    );
    expect(next).not.toBeNull();
    if (!next) return;
    expectWindowInvariants(next);
    expect(next.pages).toHaveLength(MESSAGE_MAX_PAGES);
    const ids = oldestToNewest(next).map((node) => node.id);
    expect(ids).not.toContain("e0");
    expect(ids[0]).toBe(`e${String(MESSAGE_PAGE_SIZE)}`);
    expect(next.pageParams.at(-1)).toEqual({
      cursor: `e${String(MESSAGE_PAGE_SIZE * 2)}`,
      kind: "before",
    });
  });

  it("fills an empty-path window only with a new root", () => {
    const emptyPath: MessageWindow = {
      pageParams: [{ kind: "tail" }],
      pages: [pageOf([], false, false)],
    };
    expect(appendEntryToWindow(emptyPath, entry(5))).toBeNull();
    const next = appendEntryToWindow(emptyPath, entry(0));
    expect(next).not.toBeNull();
    if (!next) return;
    expectWindowInvariants(next);
    expect(next.pages[0]?.entries.map((node) => node.id)).toEqual(["e0"]);
    expect(next.pages[0]?.prevCursor).toBeNull();
  });
});

describe("appendEntryToWindow reset decisions", () => {
  it("resets when the cache is missing or empty", () => {
    expect(appendEntryToWindow(undefined, entry(150))).toBeNull();
    expect(
      appendEntryToWindow({ pageParams: [], pages: [] }, entry(150)),
    ).toBeNull();
  });

  it("resets when the newest page no longer holds the path tail", () => {
    const window = windowOf(2);
    const first = window.pages[0];
    expect(first).toBeDefined();
    if (!first) return;
    first.nextCursor = "e99";
    // The parent matches the newest entry, so the only reset reason is the
    // evicted tail.
    expect(appendEntryToWindow(window, entry(100))).toBeNull();
  });

  it("resets when the new entry's parent is not the window's newest entry", () => {
    const window = windowOf(3);
    const mismatch = { ...entry(150), parentId: "e50" };
    expect(appendEntryToWindow(window, mismatch)).toBeNull();
    const secondRoot = { ...entry(150), parentId: null };
    expect(appendEntryToWindow(window, secondRoot)).toBeNull();
  });
});
