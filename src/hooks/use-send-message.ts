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
import { messagesKeys } from "@/lib/query-keys";
import { updateSessionLists } from "@/lib/update-session-lists";
import { useUiStore } from "@/stores/ui-store";

const TITLE_MAX_CODE_POINTS = 50;

export interface SendMessageResult {
  send: (
    target: SendTarget,
    text: string,
    onSettled?: (sessionId: null | string) => void,
  ) => void;
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
  onSettled: ((sessionId: null | string) => void) | undefined;
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
    onSettled: (result, _error, variables) => {
      useUiStore.getState().endSubmit(variables.target.draftKey);
      variables.onSettled?.(
        result?.kind === "create"
          ? result.created.session.id
          : variables.target.sessionId,
      );
    },
    onSuccess: async (result, variables) => {
      // The database commit already succeeded; a later cache read failure
      // surfaces through its query instead of failing this send: the
      // kernel's reset/refetch aggregation swallows fetch errors.
      if (result.kind === "append") {
        await landAppend(result.entry, variables);
        if (variables.target.sessionId !== null) {
          await updateSessionLists(queryClient, {
            kind: "append",
            sessionId: variables.target.sessionId,
            updatedAt: result.entry.createdAt,
          });
        }
      } else {
        await landCreate(result.created, variables);
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
    await queryClient.cancelQueries({ queryKey: key });
    const merged = appendEntryToWindow(
      queryClient.getQueryData<MessageWindow>(key),
      entry,
    );
    if (merged !== null) {
      queryClient.setQueryData(key, merged);
    } else {
      // Missing cache, evicted tail, or parent discontinuity: no gap-free
      // window can be produced, so restart from a fresh tail read.
      await queryClient.resetQueries({ queryKey: key });
    }
  }

  async function landCreate(
    created: CreatedSession,
    variables: SendVariables,
  ): Promise<void> {
    const key = messagesKeys.bySession(created.session.id);
    queryClient.setQueryData(key, createTailWindow(created.entry));
    await updateSessionLists(queryClient, {
      kind: "create",
      session: created.session,
    });
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

  function send(
    target: SendTarget,
    text: string,
    onSettled?: (sessionId: null | string) => void,
  ): void {
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
    mutation.mutate({ onSettled, target, text: trimmed });
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
