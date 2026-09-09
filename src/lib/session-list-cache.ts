import type { InfiniteData } from "@tanstack/react-query";

import type { Session, SessionCursor, SessionPage } from "@/types/ipc";

/** Infinite query cache shape for one pinned-filter sessions list. */
export type SessionListData = InfiniteData<SessionPage, SessionPageParam>;

/**
 * Keyset page param for the sessions lists: null fetches the first page, a
 * later page echoes the cursor back to list_sessions unchanged.
 * Legal values: null, { id: "s42", updatedAt: "2026-09-09T00:00:00.000Z" }
 */
export type SessionPageParam = null | SessionCursor;

/**
 * Bumps one loaded row's updatedAt and moves it to the head of the first
 * page — the sidebar's activity ordering after an append. The append
 * timestamp is the session's new updatedAt: both are the write
 * transaction's single timestamp. Returns null when the row is not in the
 * loaded pages; the caller then falls back to invalidation.
 */
export function moveSessionToHead(
  data: SessionListData | undefined,
  sessionId: string,
  updatedAt: string,
): null | SessionListData {
  if (!data || data.pages.length === 0) {
    return null;
  }
  let moved: Session | undefined;
  const stripped = data.pages.map((page) => {
    const target = page.sessions.find((session) => session.id === sessionId);
    if (target === undefined) {
      return page;
    }
    moved = { ...target, updatedAt };
    return {
      ...page,
      sessions: page.sessions.filter((session) => session.id !== sessionId),
    };
  });
  if (moved === undefined) {
    return null;
  }
  const first = stripped[0];
  if (!first) {
    return null;
  }
  const pages = [
    { ...first, sessions: [moved, ...first.sessions] },
    ...stripped.slice(1),
  ];
  return { pageParams: data.pageParams, pages };
}

/**
 * Prepends a freshly created session to the head of the standard list's
 * first page. The new session carries the newest updatedAt, so the head
 * position matches the keyset order and the page-boundary cursors stay
 * untouched. The first page may temporarily hold one row above the page
 * limit: a display-only tradeoff accepted over spilling into a new page,
 * which would have to invent a cursor. Returns null when the cache is
 * absent (never fabricate a list the UI has not loaded) or the row already
 * exists (duplicate delivery).
 */
export function prependSessionToFirstPage(
  data: SessionListData | undefined,
  session: Session,
): null | SessionListData {
  if (
    !data ||
    data.pages.length === 0 ||
    containsSession(data.pages, session.id)
  ) {
    return null;
  }
  const first = data.pages[0];
  if (!first) {
    return null;
  }
  const pages = [
    { ...first, sessions: [session, ...first.sessions] },
    ...data.pages.slice(1),
  ];
  return { pageParams: data.pageParams, pages };
}

/**
 * Removes one session row from the loaded pages. Pages and pageParams keep
 * their count and boundaries — an emptied page stays in place. Removal cannot
 * strand a stale cursor: a refetch reuses only page 0's param and re-derives
 * every later page's param from the previous fresh page's nextCursor. Keyset
 * boundaries survive row removal because pagination compares
 * (updatedAt, id) tuples, not row membership. Returns null when the row is
 * not in the loaded pages.
 */
export function removeSessionFromList(
  data: SessionListData | undefined,
  sessionId: string,
): null | SessionListData {
  if (!data || !containsSession(data.pages, sessionId)) {
    return null;
  }
  const pages = data.pages.map((page) => ({
    ...page,
    sessions: page.sessions.filter((session) => session.id !== sessionId),
  }));
  return { pageParams: data.pageParams, pages };
}

function containsSession(pages: SessionPage[], sessionId: string): boolean {
  return pages.some((page) => page.sessions.some((s) => s.id === sessionId));
}
