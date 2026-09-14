import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

import type { SessionModel } from "@/types/ipc";

import { useCommandMutation } from "@/hooks/use-command-mutation";
import {
  setSessionModel,
  type SetSessionModelParams,
} from "@/lib/ipc/sessions";
import { sessionsKeys } from "@/lib/query-keys";
import { type SessionListData, sessionModelIn } from "@/lib/session-list-cache";
import { updateSessionLists } from "@/lib/update-session-lists";

/** Both pinned filters: a loaded row sits in exactly one of them. */
const PINNED_FILTERS = [true, false] as const;

/** What one failed selection write puts back: the row's previous selection. */
type SessionModelContext = { previous: null | SessionModel };

/**
 * The model one stored session speaks to, or null while none is selected (or
 * the row is not among the loaded pages). The session row is the only copy:
 * the selection is read out of the session list cache and subscribed to, so a
 * write anywhere reaches the composer through the value the sidebar holds.
 *
 * The snapshot is the stored object itself rather than a copy: an unchanged
 * selection must compare equal, or every cache event would look like a change.
 */
export function useSessionModel(sessionId: null | string): null | SessionModel {
  const client = useQueryClient();
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      client.getQueryCache().subscribe(onStoreChange),
    [client],
  );
  return useSyncExternalStore(subscribe, () =>
    sessionId === null ? null : selectedModel(client, sessionId),
  );
}

/**
 * Sets the model a stored session speaks to. The pick lands in the loaded page
 * holding the row before the write resolves; a row no loaded page holds has
 * its lists re-read instead, so a pick the cache cannot show does not stay
 * invisible. A rejected write puts the row's previous selection back, unless a
 * later pick has taken the row over.
 */
export function useSetSessionModel() {
  const client = useQueryClient();
  return useCommandMutation<SetSessionModelParams, SessionModelContext>({
    mutationFn: setSessionModel,
    networkMode: "always",
    onError: async (_error, { model, sessionId }, context) => {
      // The cache has to be showing the selection this write set, or a later
      // pick owns the row and rolling its value back would undo that pick.
      if (
        context === undefined ||
        !isSameSelection(selectedModel(client, sessionId), model)
      ) {
        return;
      }
      await updateSessionLists(client, {
        kind: "model",
        model: context.previous,
        sessionId,
      });
      // The rollback target is only what onMutate read, so it can itself be
      // another write's optimistic value that no server has confirmed. The
      // lists are read again so the stored selection lands; the invalidation
      // inside updateSessionLists cannot stand in, as it only reaches lists
      // that still need a read.
      await client.invalidateQueries({ queryKey: sessionsKeys.lists() });
    },
    onMutate: async ({ model, sessionId }) => {
      const previous = selectedModel(client, sessionId);
      await updateSessionLists(client, { kind: "model", model, sessionId });
      return { previous };
    },
    retry: false,
  });
}

/** Whether two selections name the same model: the cache rebuilds the rows it
 *  merges, so what it holds is equal to the written selection, not the same
 *  object. */
function isSameSelection(
  a: null | SessionModel,
  b: null | SessionModel,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.kind === "provider" && b.kind === "provider") {
    return a.modelId === b.modelId && a.providerId === b.providerId;
  }
  if (a.kind === "unified" && b.kind === "unified") {
    return a.modelId === b.modelId;
  }
  return false;
}

function selectedModel(
  client: QueryClient,
  sessionId: string,
): null | SessionModel {
  for (const pinned of PINNED_FILTERS) {
    const model = sessionModelIn(
      client.getQueryData<SessionListData>(sessionsKeys.list(pinned)),
      sessionId,
    );
    if (model !== null) {
      return model;
    }
  }
  return null;
}
