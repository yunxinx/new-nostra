import {
  type InfiniteData,
  infiniteQueryOptions,
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";

import type {
  AppError,
  Session,
  SessionCursor,
  SessionPage,
} from "@/types/ipc";

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
import { useUiStore } from "@/stores/ui-store";

export interface SessionsResult {
  // True while either stream has rows, is still on its first load, or failed;
  // a loading or failed list must never read as an empty library.
  hasSessions: boolean;
  loadMore: (pinned: boolean) => void;
  pinned: SessionListStream;
  standard: SessionListStream;
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

type SessionPageParam = null | SessionCursor;

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useSessionMutation<DeleteSessionParams>({
    mutationFn: deleteSession,
    networkMode: "always",
    onMutate: (variables) => {
      // Send/delete mutual exclusion for the same session: the composer
      // reads this flag and refuses to submit while deletion is in flight.
      useUiStore.getState().beginDelete(variables.sessionId);
    },
    onSettled: (_result, _error, variables) => {
      useUiStore.getState().endDelete(variables.sessionId);
    },
    onSuccess: async (_result, variables) => {
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
      // The delete already committed; a failed list read surfaces as the
      // sidebar streams' error state, not as a failed delete.
      await queryClient.resetQueries({ queryKey: sessionsKeys.lists() });
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
function useSessionMutation<TVariables>(
  options: UseMutationOptions<void, AppError, TVariables>,
): UseMutationResult<void, AppError, TVariables> {
  return useMutation(options);
}
