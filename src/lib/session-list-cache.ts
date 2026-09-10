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
 * Inserts within the existing keyset boundaries without shifting their cursors.
 * Returns null for absent caches, duplicates, or rows beyond the loaded range.
 */
export function insertSessionInList(
  data: SessionListData | undefined,
  session: Session,
): null | SessionListData {
  if (!data || containsSession(data.pages, session.id)) {
    return null;
  }
  const index = data.pages.findIndex(
    (page) =>
      page.nextCursor === null ||
      compareActivity(session, page.nextCursor) <= 0,
  );
  if (index < 0) {
    return null;
  }
  return {
    pageParams: data.pageParams,
    pages: data.pages.map((page, pageIndex) =>
      pageIndex === index
        ? {
            ...page,
            sessions: [...page.sessions, session].sort(compareActivity),
          }
        : page,
    ),
  };
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

/** Updates a loaded row's activity and restores descending keyset order. */
export function updateSessionActivity(
  data: SessionListData | undefined,
  sessionId: string,
  updatedAt: string,
): null | SessionListData {
  const session = data?.pages
    .flatMap((page) => page.sessions)
    .find((row) => row.id === sessionId);
  if (!data || !session) {
    return null;
  }
  const next = removeSessionFromList(data, sessionId);
  return next === null
    ? null
    : insertSessionInList(next, {
        ...session,
        updatedAt:
          updatedAt > session.updatedAt ? updatedAt : session.updatedAt,
      });
}

function compareActivity(a: SessionCursor, b: SessionCursor): number {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? -1 : 1;
  }
  return a.id === b.id ? 0 : a.id > b.id ? -1 : 1;
}

function containsSession(pages: SessionPage[], sessionId: string): boolean {
  return pages.some((page) => page.sessions.some((s) => s.id === sessionId));
}
