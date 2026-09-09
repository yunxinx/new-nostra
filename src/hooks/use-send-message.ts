import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type {
  AppError,
  ContentBlock,
  CreatedSession,
  Entry,
} from "@/types/ipc";

import { appendMessage } from "@/lib/ipc/entries";
import { createSession } from "@/lib/ipc/sessions";
import {
  appendEntryToWindow,
  createTailWindow,
  type MessageWindow,
} from "@/lib/message-window";
import { messagesKeys, sessionsKeys } from "@/lib/query-keys";
import {
  moveSessionToHead,
  prependSessionToFirstPage,
  type SessionListData,
} from "@/lib/session-list-cache";
import { useUiStore } from "@/stores/ui-store";

const TITLE_MAX_CODE_POINTS = 50;

export interface SendMessageResult {
  send: (target: SendTarget, text: string) => void;
}

/**
 * Submit-time snapshot of the target the write belongs to. `draftKey` locates
 * the composer draft to clear on success; a draft capture also records the
 * draftId so a late result only activates the view while that draft is still
 * current.
 */
export interface SendTarget {
  draftId: number;
  draftKey: string;
  sessionId: null | string;
}

type SendResult =
  | { created: CreatedSession; kind: "create" }
  | { entry: Entry; kind: "append" };

interface SendVariables {
  target: SendTarget;
  text: string;
}

export function useSendMessage(): SendMessageResult {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation<SendResult, AppError, SendVariables>({
    mutationFn: async (variables: SendVariables): Promise<SendResult> => {
      if (variables.target.sessionId === null) {
        const created = await createSession({
          content: textToContent(variables.text),
          title: deriveTitle(variables.text, t("app.newChat")),
        });
        return { created, kind: "create" };
      }
      const entry = await appendMessage({
        content: textToContent(variables.text),
        sessionId: variables.target.sessionId,
      });
      return { entry, kind: "append" };
    },
    networkMode: "always",
    onError: (error, variables) => {
      // The write failed; the input stays for a manual retry in its original
      // context.
      useUiStore.getState().setDraftError(variables.target.draftKey, error);
    },
    onMutate: async (variables) => {
      // Stop in-flight window reads so a late page cannot overwrite the
      // merged result. Drafts have no messages cache yet. The pending flag
      // itself flips synchronously in send(): onMutate runs one microtask
      // later, too late to close the double-submit window.
      if (variables.target.sessionId !== null) {
        await queryClient.cancelQueries({
          queryKey: messagesKeys.bySession(variables.target.sessionId),
        });
      }
    },
    onSettled: (_result, _error, variables) => {
      useUiStore.getState().endSubmit(variables.target.draftKey);
    },
    onSuccess: async (result, variables) => {
      // The database commit already succeeded; a later cache read failure
      // surfaces through the messages query error instead of failing this
      // send: the kernel's reset/refetch aggregation swallows fetch errors.
      if (result.kind === "append") {
        await landAppend(result.entry, variables);
        await reflectAppendInLists(
          variables.target.sessionId,
          result.entry.createdAt,
        );
      } else {
        landCreate(result.created, variables);
      }
      useUiStore
        .getState()
        .resolveSubmit(variables.target.draftKey, variables.text);
    },
    retry: false,
  });

  async function landAppend(
    entry: Entry,
    variables: SendVariables,
  ): Promise<void> {
    const sessionId = variables.target.sessionId;
    if (sessionId === null) {
      return;
    }
    const key = messagesKeys.bySession(sessionId);
    const merged = appendEntryToWindow(
      queryClient.getQueryData<MessageWindow>(key),
      entry,
    );
    if (merged !== null) {
      // A page read that started while the write was in flight is cancelled
      // (revert) before the merge: the kernel drops a cancelled read's late
      // resolution, so no stale page lands on the merged window.
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, merged);
    } else {
      // Missing cache, evicted tail, or parent discontinuity: no gap-free
      // window can be produced, so restart from a fresh tail read.
      await queryClient.resetQueries({ queryKey: key });
    }
  }

  function landCreate(created: CreatedSession, variables: SendVariables): void {
    const key = messagesKeys.bySession(created.session.id);
    queryClient.setQueryData(key, createTailWindow(created.entry));
    // The sidebar keeps its loaded page structure: the new session joins the
    // standard list's first page at the head (its updatedAt is the newest);
    // a list the UI has not loaded yet reads it on its next mount. The new
    // row announces itself with the enter animation.
    const listKey = sessionsKeys.list(false);
    const prepended = prependSessionToFirstPage(
      queryClient.getQueryData<SessionListData>(listKey),
      created.session,
    );
    if (prepended !== null) {
      queryClient.setQueryData(listKey, prepended);
    }
    useUiStore.getState().setEnteringSession(created.session.id);
    const store = useUiStore.getState();
    // The new session takes over the view only while the user still sits on
    // the same draft; otherwise it just appears in the sidebar and the
    // current selection stays untouched.
    if (
      store.activeSessionId === null &&
      store.draftId === variables.target.draftId
    ) {
      store.setActiveSession(created.session.id);
    }
  }

  // Reflects the append's activity bump in the sidebar: the row moves to the
  // head of whichever loaded list holds it. A row outside the loaded pages
  // cannot be positioned without inventing data, so the lists fall back to
  // invalidation and the active observers refetch with their stored pages.
  async function reflectAppendInLists(
    sessionId: null | string,
    updatedAt: string,
  ): Promise<void> {
    if (sessionId === null) {
      return;
    }
    let moved = false;
    for (const pinned of [false, true]) {
      const key = sessionsKeys.list(pinned);
      const next = moveSessionToHead(
        queryClient.getQueryData<SessionListData>(key),
        sessionId,
        updatedAt,
      );
      if (next !== null) {
        queryClient.setQueryData(key, next);
        moved = true;
      }
    }
    if (!moved) {
      await queryClient.invalidateQueries({ queryKey: sessionsKeys.lists() });
    }
  }

  function send(target: SendTarget, text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    const store = useUiStore.getState();
    // Synchronous same-target guard: the store flag flips before mutate()
    // returns (onMutate runs a microtask later), so a double Enter cannot
    // stack a second submission.
    if (store.pendingSubmits.has(target.draftKey)) {
      return;
    }
    // Sends and deletes of the same session are mutually exclusive.
    if (
      target.sessionId !== null &&
      store.pendingDeletes.has(target.sessionId)
    ) {
      return;
    }
    store.beginSubmit(target.draftKey);
    store.setDraftError(target.draftKey, null);
    mutation.mutate({ target, text: trimmed });
  }

  return { send };
}

function deriveTitle(text: string, fallback: string): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  const title = Array.from(collapsed).slice(0, TITLE_MAX_CODE_POINTS).join("");
  return title.length > 0 ? title : fallback;
}

function textToContent(text: string): ContentBlock[] {
  return [{ text, type: "text" }];
}
