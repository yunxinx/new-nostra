import type { InfiniteData } from "@tanstack/react-query";

import type { Entry, PathPage } from "@/types/ipc";

/** Path page size for the message window; the IPC layer caps `limit` at 50. */
export const MESSAGE_PAGE_SIZE = 50;

/** Page cap of the message window; the mounted entry total never exceeds 10 x 50. */
export const MESSAGE_MAX_PAGES = 10;

/** Infinite query cache shape for a session's active-path window. */
export type MessageWindow = InfiniteData<PathPage, PathPageParam>;

/**
 * Page param whose `kind` encodes the fetch direction, so refetch reuses
 * pageParams[0] without guessing cursor semantics.
 * Legal values: { kind: "tail" }, { kind: "before", cursor: "e42" },
 * { kind: "after", cursor: "e42" }
 */
export type PathPageParam =
  | { cursor: string; kind: "after" }
  | { cursor: string; kind: "before" }
  | { kind: "tail" };

/**
 * Merges one freshly persisted entry into the window at its newest end, or
 * returns null when the caller must instead reset the query to a single fresh
 * tail page. Returns the input unchanged when the entry id is already present
 * (duplicate delivery). Constraints: the merge only extends a window whose
 * pages[0] still holds the path tail (nextCursor null) and whose newest entry
 * is the new entry's parent; otherwise the decision is reset because no gap-
 * free cache can be produced.
 */
export function appendEntryToWindow(
  data: MessageWindow | undefined,
  entry: Entry,
): MessageWindow | null {
  if (!data || data.pages.length === 0) {
    return null;
  }
  const first = data.pages[0];
  if (!first) {
    return null;
  }
  if (containsEntry(data.pages, entry.id)) {
    return data;
  }
  if (first.nextCursor !== null) {
    return null;
  }
  const firstNewestId = first.entries.at(-1)?.id ?? null;
  if (first.entries.length === 0) {
    // An empty path only accepts a new root.
    if (entry.parentId !== null) {
      return null;
    }
  } else if (entry.parentId !== firstNewestId) {
    return null;
  }

  let pages: PathPage[];
  if (first.entries.length < MESSAGE_PAGE_SIZE) {
    pages = [
      { ...first, entries: [...first.entries, entry] },
      ...data.pages.slice(1),
    ];
  } else {
    pages = [
      {
        entries: [entry],
        nextCursor: null,
        prevCursor: entry.parentId === null ? null : entry.id,
      },
      { ...first, nextCursor: firstNewestId },
      ...data.pages.slice(1),
    ];
  }
  if (pages.length > MESSAGE_MAX_PAGES) {
    pages = pages.slice(0, MESSAGE_MAX_PAGES);
  }
  const pageParams = rebuildPageParams(pages);
  return pageParams === null ? null : { pageParams, pages };
}

/**
 * Builds the single tail page written via setQueryData after create_session.
 * pages[0] always holds the path tail here; pageParams is exactly [tail].
 */
export function createTailWindow(entry: Entry): MessageWindow {
  return {
    pageParams: [{ kind: "tail" }],
    pages: [
      {
        entries: [entry],
        nextCursor: null,
        prevCursor: entry.parentId === null ? null : entry.id,
      },
    ],
  };
}

function containsEntry(pages: PathPage[], id: string): boolean {
  return pages.some((page) => page.entries.some((entry) => entry.id === id));
}

/**
 * Rebuilds pageParams to mirror the page layout: the first page is the tail,
 * every older page is fetched by `before` with the adjacent newer page's
 * oldest entry id. Returns null when a boundary id is missing, which the
 * caller treats as a reset decision.
 */
function rebuildPageParams(pages: PathPage[]): null | PathPageParam[] {
  const pageParams: PathPageParam[] = [{ kind: "tail" }];
  for (let index = 1; index < pages.length; index += 1) {
    const newer = pages[index - 1];
    const cursor = newer?.entries[0]?.id;
    if (newer === undefined || cursor === undefined) {
      return null;
    }
    pageParams.push({ cursor, kind: "before" });
  }
  return pageParams;
}
