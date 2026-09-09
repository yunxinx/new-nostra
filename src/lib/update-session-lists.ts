import type { QueryClient, QueryState } from "@tanstack/react-query";

import type { Session } from "@/types/ipc";

import { sessionsKeys } from "./query-keys";
import {
  insertSessionInList,
  removeSessionFromList,
  type SessionListData,
  updateSessionActivity,
} from "./session-list-cache";

// A committed write affecting list membership or activity, e.g.
// { kind: "delete", sessionId: "s42" }.
type SessionListChange =
  | { kind: "append"; sessionId: string; updatedAt: string }
  | { kind: "create"; session: Session }
  | { kind: "delete"; sessionId: string };

export async function updateSessionLists(
  queryClient: QueryClient,
  change: SessionListChange,
): Promise<void> {
  const filters = change.kind === "create" ? [false] : [false, true];
  // Cancellation reverts fetch metadata; setQueryData clears invalidation.
  // Neither may erase a read still needed to complete the cached view.
  const lists = filters.map((pinned) => {
    const queryKey = sessionsKeys.list(pinned);
    return {
      queryKey,
      shouldRefresh: needsListRefresh(
        queryClient.getQueryState<SessionListData>(queryKey),
      ),
    };
  });
  await queryClient.cancelQueries({
    queryKey:
      change.kind === "create"
        ? sessionsKeys.list(false)
        : sessionsKeys.lists(),
  });

  let hasMerged = false;
  for (const list of lists) {
    const current = queryClient.getQueryState<SessionListData>(list.queryKey);
    list.shouldRefresh ||= needsListRefresh(current);
    const next = applyChange(current?.data, change);
    if (next !== null) {
      queryClient.setQueryData(list.queryKey, next);
      hasMerged = true;
    }
  }

  const shouldRefreshAll = !hasMerged && change.kind !== "delete";
  await Promise.all(
    lists
      .filter((list) => list.shouldRefresh || shouldRefreshAll)
      .map((list) =>
        queryClient.invalidateQueries({ exact: true, queryKey: list.queryKey }),
      ),
  );
}

function applyChange(
  data: SessionListData | undefined,
  change: SessionListChange,
): null | SessionListData {
  switch (change.kind) {
    case "append":
      return updateSessionActivity(data, change.sessionId, change.updatedAt);
    case "create":
      return insertSessionInList(data, change.session);
    case "delete":
      return removeSessionFromList(data, change.sessionId);
  }
}

function needsListRefresh(
  state: QueryState<SessionListData> | undefined,
): boolean {
  return (
    state !== undefined &&
    (state.data === undefined ||
      state.isInvalidated ||
      (state.fetchStatus === "fetching" &&
        state.fetchMeta?.fetchMore === undefined))
  );
}
