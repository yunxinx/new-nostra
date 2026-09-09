import {
  type InfiniteData,
  infiniteQueryOptions,
  type QueryClient,
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";

import type { AppError, Session, SessionPage } from "@/types/ipc";

import {
  deleteSession,
  type DeleteSessionParams,
  listSessions,
  renameSession,
  type RenameSessionParams,
  setSessionPinned,
  type SetSessionPinnedParams,
} from "@/lib/ipc/sessions";
import { messagesKeys, sessionsKeys } from "@/lib/query-keys";
import {
  removeSessionFromList,
  type SessionListData,
  type SessionPageParam,
} from "@/lib/session-list-cache";
import { useUiStore } from "@/stores/ui-store";

/**
 * Duration of a sidebar row's enter/exit animations (session-row-enter /
 * session-row-exit in index.css). The delete keeps the row in the list
 * caches for this long after the confirm so the collapse finishes before
 * the row unmounts; the enter marker clears on the same window.
 */
export const SESSION_ROW_ANIMATION_MS = 200;

export interface SessionsResult {
  // True while either stream has rows, is still on its first load, or failed;
  // a loading or failed list must never read as an empty library.
  hasSessions: boolean;
  loadMore: (pinned: boolean) => void;
  pinned: SessionListStream;
  standard: SessionListStream;
}

interface DeleteContext {
  deleteStartedAt: number;
}

type SessionListQuery = UseInfiniteQueryResult<
  InfiniteData<SessionPage, SessionPageParam>,
  AppError
>;

// One flattened view of one pinned-filter stream: rows in keyset order plus
// the states the sidebar needs. `isLoading` is true only before the first
// page settles; a failed stream with no rows reports through `error`.
interface SessionListStream {
  error: AppError | null;
  hasNextPage: boolean;
  isFetching: boolean;
  isLoading: boolean;
  retry: () => void;
  sessions: Session[];
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useSessionMutation<DeleteSessionParams, DeleteContext>({
    mutationFn: deleteSession,
    networkMode: "always",
    onMutate: (variables) => {
      // Send/delete mutual exclusion for the same session: the composer
      // reads this flag and refuses to submit while deletion is in flight.
      useUiStore.getState().beginDelete(variables.sessionId);
      // The row's exit animation starts at the confirm click; the context
      // anchors the data-layer removal to the same moment.
      return { deleteStartedAt: Date.now() };
    },
    onSettled: (_result, _error, variables) => {
      useUiStore.getState().endDelete(variables.sessionId);
    },
    onSuccess: async (_result, variables, context) => {
      // Cancel before removing: a late read resolving for the deleted
      // session must not rebuild its messages cache.
      await queryClient.cancelQueries({
        queryKey: messagesKeys.bySession(variables.sessionId),
      });
      queryClient.removeQueries({
        queryKey: messagesKeys.bySession(variables.sessionId),
      });
      // The draft and its submit error are owned by the deleted session.
      useUiStore.getState().discardDraft(variables.sessionId);
      if (useUiStore.getState().activeSessionId === variables.sessionId) {
        useUiStore.getState().setActiveSession(null);
      }
      // The visual layer owns the timing: the row collapses from the confirm
      // click, and the cache removal lands only after the animation window
      // closes. A failed delete never reaches this point, so the row
      // recovers with nothing to undo here.
      await exitDelay(context.deleteStartedAt);
      removeSessionRow(queryClient, variables.sessionId);
      // The delete already committed; a failed list read surfaces as the
      // sidebar streams' error state, not as a failed delete.
    },
    retry: false,
  });
}

export function useRenameSession() {
  const queryClient = useQueryClient();
  return useSessionMutation<RenameSessionParams>({
    mutationFn: renameSession,
    networkMode: "always",
    // Renaming never bumps updatedAt, so the loaded pages stay valid and a
    // plain invalidation refreshes titles in place.
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: sessionsKeys.lists(),
      });
    },
    retry: false,
  });
}

export function useSessions(): SessionsResult {
  const pinnedQuery = useInfiniteQuery(sessionListOptions(true));
  const standardQuery = useInfiniteQuery(sessionListOptions(false));
  // isFetchingNextPage only flips after an observer notification reaches
  // React; this flag closes the synchronous window between the fetch start
  // and that re-render so rapid scroll events cannot stack fetches.
  const pendingLoadMoreRef = useRef({ pinned: false, standard: false });

  function loadMore(pinned: boolean): void {
    const query = pinned ? pinnedQuery : standardQuery;
    const pending = pendingLoadMoreRef.current;
    const key = pinned ? "pinned" : "standard";
    if (!query.hasNextPage || query.isFetchingNextPage || pending[key]) {
      return;
    }
    pending[key] = true;
    void query.fetchNextPage().finally(() => {
      pending[key] = false;
    });
  }

  const pinned = toStream(pinnedQuery);
  const standard = toStream(standardQuery);

  return {
    hasSessions:
      pinned.sessions.length > 0 ||
      standard.sessions.length > 0 ||
      pinned.isLoading ||
      standard.isLoading ||
      pinned.error !== null ||
      standard.error !== null,
    loadMore,
    pinned,
    standard,
  };
}

export function useSetSessionPinned() {
  const queryClient = useQueryClient();
  return useSessionMutation<SetSessionPinnedParams>({
    mutationFn: setSessionPinned,
    networkMode: "always",
    // Pinning moves a session between the two streams, so both lists restart
    // from their first page; a reset clears the old pages and pageParams.
    onSuccess: async () => {
      await queryClient.resetQueries({ queryKey: sessionsKeys.lists() });
    },
    retry: false,
  });
}

// A delete commits instantly while the row still animates; only the leftover
// animation window is waited out, so a slow IPC eats into it.
function exitDelay(startedAt: number): Promise<void> {
  const remaining = SESSION_ROW_ANIMATION_MS - (Date.now() - startedAt);
  if (remaining <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, remaining);
  });
}

function removeSessionRow(queryClient: QueryClient, sessionId: string): void {
  for (const pinned of [false, true]) {
    const key = sessionsKeys.list(pinned);
    const next = removeSessionFromList(
      queryClient.getQueryData<SessionListData>(key),
      sessionId,
    );
    if (next !== null) {
      queryClient.setQueryData(key, next);
    }
  }
}

function sessionListOptions(pinned: boolean) {
  return infiniteQueryOptions<
    SessionPage,
    AppError,
    InfiniteData<SessionPage, SessionPageParam>,
    ReturnType<typeof sessionsKeys.list>,
    SessionPageParam
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // Refetch reuses the stored pageParams, so the direction-agnostic null
    // (first page) must be part of the param type, not just its absence.
    initialPageParam: null,
    networkMode: "always",
    queryFn: ({ pageParam }) =>
      listSessions(
        pageParam === null ? { pinned } : { cursor: pageParam, pinned },
      ),
    queryKey: sessionsKeys.list(pinned),
    staleTime: Infinity,
  });
}

function toStream(query: SessionListQuery): SessionListStream {
  return {
    error: query.error ?? null,
    hasNextPage: query.hasNextPage,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    retry: () => void query.refetch(),
    sessions: query.data?.pages.flatMap((page) => page.sessions) ?? [],
  };
}

// Session mutations succeed with no data and reject with the serialized
// AppError. Call-site type arguments cannot carry a bare void (lint
// no-invalid-void-type), so the options type anchors the generics here.
function useSessionMutation<TVariables, TContext = unknown>(
  options: UseMutationOptions<void, AppError, TVariables, TContext>,
): UseMutationResult<void, AppError, TVariables, TContext> {
  return useMutation(options);
}
