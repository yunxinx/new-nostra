import {
  type InfiniteData,
  infiniteQueryOptions,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import type { AppError, PathPage } from "@/types/ipc";

import {
  loadActivePath,
  loadActivePathAfter,
  loadActivePathBefore,
} from "@/lib/ipc/entries";
import {
  MESSAGE_MAX_PAGES,
  MESSAGE_PAGE_SIZE,
  type MessageWindow,
  type PathPageParam,
} from "@/lib/message-window";
import { messagesKeys } from "@/lib/query-keys";

import { type ChatMessage, entryToMessage } from "../types";

export interface ActivePathResult {
  /** Read failure of the newest (or latest attempted) page fetch. */
  error: AppError | null;
  /** True while the window's newest page is not the path tail. */
  hasNewerPages: boolean;
  /** True while older path history exists past the window's oldest page. */
  hasOlderPages: boolean;
  /** True only before the first page settles; never reads as an empty path. */
  isLoading: boolean;
  loadNewer: () => void;
  loadOlder: () => void;
  /** Oldest-to-newest projection of the windowed active path. */
  messages: ChatMessage[];
  /** Restores the window to a single fresh tail page. */
  resetToTail: () => Promise<void>;
  retryRead: () => void;
}

export function useActivePath(sessionId: string): ActivePathResult {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery(activePathOptions(sessionId));

  // One directional page fetch at a time: an in-flight fetch in either
  // direction blocks the other, so opposite directions never cancel or
  // overwrite each other's results. The ref closes the synchronous window
  // between the fetch start and the observer's re-render.
  const directionFetchRef = useRef(false);

  function loadOlder(): void {
    if (directionFetchRef.current || query.isFetching || !query.hasNextPage) {
      return;
    }
    directionFetchRef.current = true;
    void query.fetchNextPage().finally(() => {
      directionFetchRef.current = false;
    });
  }

  function loadNewer(): void {
    if (
      directionFetchRef.current ||
      query.isFetching ||
      !query.hasPreviousPage
    ) {
      return;
    }
    directionFetchRef.current = true;
    void query.fetchPreviousPage().finally(() => {
      directionFetchRef.current = false;
    });
  }

  const messages = useMemo(() => {
    const pages = query.data?.pages ?? [];
    // Pages are stored newest-to-oldest; render order is oldest-to-newest.
    // The copy keeps the cached array order untouched.
    return [...pages]
      .reverse()
      .flatMap((page) => page.entries.map(entryToMessage));
  }, [query.data]);

  useEffect(() => {
    const key = messagesKeys.bySession(sessionId);
    const data = queryClient.getQueryData<MessageWindow>(key);
    // Re-entering a session is not a cache reset: only a cached window whose
    // newest page no longer holds the tail is reset, so the latest page shows
    // instead of a stale history window.
    if (data && data.pages.length > 0 && data.pages[0]?.nextCursor !== null) {
      void queryClient.resetQueries({ queryKey: key });
    }
  }, [queryClient, sessionId]);

  // A stale path cursor breaks the window's boundaries. Reset once to tail;
  // if the tail read itself then fails, the error surfaces (the flag stays
  // spent) instead of looping resets. Any later success re-arms recovery.
  const cursorRecoverySpentRef = useRef(false);
  useEffect(() => {
    if (query.error === null) {
      if (query.isSuccess) {
        cursorRecoverySpentRef.current = false;
      }
      return;
    }
    if (
      query.error.code !== "invalid_input" ||
      cursorRecoverySpentRef.current
    ) {
      return;
    }
    cursorRecoverySpentRef.current = true;
    void queryClient.resetQueries({
      queryKey: messagesKeys.bySession(sessionId),
    });
  }, [query.error, query.isSuccess, queryClient, sessionId]);

  async function resetToTail(): Promise<void> {
    await queryClient.resetQueries({
      queryKey: messagesKeys.bySession(sessionId),
    });
  }

  return {
    error: query.error ?? null,
    hasNewerPages: query.hasPreviousPage,
    hasOlderPages: query.hasNextPage,
    isLoading: query.isLoading,
    loadNewer,
    loadOlder,
    messages,
    resetToTail,
    retryRead: () => void query.refetch(),
  };
}

function activePathOptions(sessionId: string) {
  return infiniteQueryOptions<
    PathPage,
    AppError,
    InfiniteData<PathPage, PathPageParam>,
    ReturnType<typeof messagesKeys.bySession>,
    PathPageParam
  >({
    getNextPageParam: (lastPage) =>
      lastPage.prevCursor === null
        ? undefined
        : { cursor: lastPage.prevCursor, kind: "before" },
    getPreviousPageParam: (firstPage) =>
      firstPage.nextCursor === null
        ? undefined
        : { cursor: firstPage.nextCursor, kind: "after" },
    initialPageParam: { kind: "tail" },
    maxPages: MESSAGE_MAX_PAGES,
    networkMode: "always",
    queryFn: ({ pageParam }) => {
      // The fetch direction is encoded in the param, so a refetch reusing
      // pageParams[0] repeats the same direction instead of guessing.
      switch (pageParam.kind) {
        case "after":
          return loadActivePathAfter({
            cursor: pageParam.cursor,
            limit: MESSAGE_PAGE_SIZE,
            sessionId,
          });
        case "before":
          return loadActivePathBefore({
            cursor: pageParam.cursor,
            limit: MESSAGE_PAGE_SIZE,
            sessionId,
          });
        case "tail":
          return loadActivePath({ limit: MESSAGE_PAGE_SIZE, sessionId });
      }
    },
    queryKey: messagesKeys.bySession(sessionId),
    staleTime: Infinity,
  });
}
