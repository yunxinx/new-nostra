import type { ReactNode } from "react";

import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  AppError,
  ContentBlock,
  CreatedSession,
  Entry,
  PathPage,
  SessionPage,
} from "@/types/ipc";

import { useActivePath } from "@/features/chat/hooks/use-active-path";
import { type MessageWindow } from "@/lib/message-window";
import { messagesKeys, sessionsKeys } from "@/lib/query-keys";
import { type SessionListData } from "@/lib/session-list-cache";
import { draftKeyFor, useUiStore } from "@/stores/ui-store";

import { type SendTarget, useSendMessage } from "./use-send-message";

// These tests drive the real mutation and query kernels against a mockIPC
// command server, validating the submit guard, the conditional activation,
// the cache merge/reset decisions, and the DB-success vs read-failure split.

const NOW = "2026-09-09T00:00:00.000Z";

let queryClient: QueryClient;
let createParams: Array<{ content: ContentBlock[]; title: string }>;
let appendParams: Array<{ content: ContentBlock[]; sessionId: string }>;
let failCreate: boolean;
let failAppend: boolean;
let failTailRead: boolean;
let appendParentId: null | string;
let sessionPath: Entry[];
let createdCount: number;
let appendedCount: number;
let deferNextCreate: boolean;
let resolveCreate: ((value: CreatedSession) => void) | null;
let deferNextAppend: boolean;
let resolveAppend: ((value: Entry) => void) | null;
let deferNextBefore: boolean;
let resolveBefore: ((value: PathPage) => void) | null;

type Harness = {
  path: null | ReturnType<typeof useActivePath>;
  send: ReturnType<typeof useSendMessage>["send"];
};

function draftTarget(): SendTarget {
  const draftId = useUiStore.getState().draftId;
  return { draftId, draftKey: draftKeyFor(draftId), sessionId: null };
}

function entry(id: string, parentId: null | string, text: string): Entry {
  return {
    content: [{ text, type: "text" }],
    createdAt: NOW,
    id,
    parentId,
    role: "user",
    type: "message",
  };
}

function renderSendHarness(sessionId: null | string) {
  return renderHook(
    () => {
      const { send } = useSendMessage();
      return {
        path: sessionId === null ? null : useActivePath(sessionId),
        send,
      } satisfies Harness;
    },
    {
      wrapper: function Wrapper({ children }: { children: ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        );
      },
    },
  );
}

function seedListCaches(): void {
  for (const pinned of [false, true]) {
    queryClient.setQueryData(sessionsKeys.list(pinned), {
      pageParams: [null],
      pages: [{ nextCursor: null, sessions: [] }] satisfies SessionPage[],
    });
  }
}

function seedTailWindow(sessionId: string, count: number): void {
  sessionPath = Array.from({ length: count }, (_, index) =>
    entry(
      `e${String(index)}`,
      index === 0 ? null : `e${String(index - 1)}`,
      `m${String(index)}`,
    ),
  );
  const start = Math.max(0, sessionPath.length - 50);
  queryClient.setQueryData<MessageWindow>(messagesKeys.bySession(sessionId), {
    pageParams: [{ kind: "tail" }],
    pages: [
      {
        entries: sessionPath.slice(start),
        nextCursor: null,
        prevCursor: start > 0 ? (sessionPath[start]?.id ?? null) : null,
      },
    ],
  });
}

function serveTail(): {
  entries: Entry[];
  nextCursor: null;
  prevCursor: null | string;
} {
  if (failTailRead) {
    throwAppError("db", "tail read failed");
  }
  const start = Math.max(0, sessionPath.length - 50);
  return {
    entries: sessionPath.slice(start),
    nextCursor: null,
    prevCursor: start > 0 ? (sessionPath[start]?.id ?? null) : null,
  };
}

function sessionTarget(sessionId: string): SendTarget {
  return {
    draftId: useUiStore.getState().draftId,
    draftKey: sessionId,
    sessionId,
  };
}

// The wire protocol rejects with the serialized AppError object, not an
// Error instance; plain throws need the escape hatch.
function throwAppError(code: AppError["code"], message: string): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- mockIPC rejects with the AppError JSON shape the Rust boundary produces; undo when the mocks module types its rejections.
  throw { code, message } satisfies AppError;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  useUiStore.setState(useUiStore.getInitialState(), true);
  createParams = [];
  appendParams = [];
  failCreate = false;
  failAppend = false;
  failTailRead = false;
  appendParentId = null;
  sessionPath = [];
  createdCount = 0;
  appendedCount = 0;
  deferNextCreate = false;
  resolveCreate = null;
  deferNextAppend = false;
  resolveAppend = null;
  deferNextBefore = false;
  resolveBefore = null;
  mockIPC((command, payload) => {
    switch (command) {
      case "append_message": {
        const { params } = payload as {
          params: { content: ContentBlock[]; sessionId: string };
        };
        appendParams.push(params);
        if (failAppend) {
          throwAppError("db", "append failed");
        }
        appendedCount += 1;
        const appended = {
          content: params.content,
          createdAt: NOW,
          id: `appended-${String(appendedCount)}`,
          parentId: appendParentId,
          role: "user" as const,
          type: "message" as const,
        };
        sessionPath.push(appended);
        if (deferNextAppend) {
          return new Promise((resolve) => {
            resolveAppend = resolve;
          });
        }
        return appended;
      }
      case "create_session": {
        const { params } = payload as {
          params: { content: ContentBlock[]; title: string };
        };
        createParams.push(params);
        if (failCreate) {
          throwAppError("db", "create failed");
        }
        createdCount += 1;
        const created: CreatedSession = {
          entry: {
            content: params.content,
            createdAt: NOW,
            id: `first-${String(createdCount)}`,
            parentId: null,
            role: "user",
            type: "message",
          },
          session: {
            createdAt: NOW,
            id: `s-new-${String(createdCount)}`,
            pinned: false,
            title: params.title,
            updatedAt: NOW,
          },
        };
        if (deferNextCreate) {
          return new Promise((resolve) => {
            resolveCreate = resolve;
          });
        }
        return created;
      }
      case "list_sessions":
        return { nextCursor: null, sessions: [] } satisfies SessionPage;
      case "load_active_path":
        return serveTail();
      case "load_active_path_before": {
        // The deferred page simulates an older-direction read still in
        // flight when a send lands.
        if (deferNextBefore) {
          return new Promise((resolve) => {
            resolveBefore = resolve;
          });
        }
        const start = Math.max(0, sessionPath.length - 100);
        return {
          entries: sessionPath.slice(start, start + 50),
          nextCursor: null,
          prevCursor: null,
        };
      }
      default:
        throw new Error(`Unexpected IPC command: ${command}`);
    }
  });
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  clearMocks();
  onlineManager.setOnline(true);
});

describe("useSendMessage first send", () => {
  it("commits the draft atomically, seeds the tail cache, and activates the view", async () => {
    useUiStore.setState({
      activeSessionId: null,
      draftId: 1,
      drafts: new Map([[draftKeyFor(1), "Hello world"]]),
    });
    seedListCaches();
    const { result } = renderSendHarness(null);

    await act(async () => {
      result.current.send(draftTarget(), "Hello world");
      // A synchronous repeat must not stack a second submission.
      result.current.send(draftTarget(), "Hello world");
      await Promise.resolve();
    });
    expect(createParams).toHaveLength(1);
    expect(createParams[0]).toEqual({
      content: [{ text: "Hello world", type: "text" }],
      title: "Hello world",
    });

    await waitFor(() => {
      expect(useUiStore.getState().activeSessionId).toBe("s-new-1");
    });
    expect(useUiStore.getState().drafts.get(draftKeyFor(1))).toBeUndefined();
    expect(useUiStore.getState().pendingSubmits.has(draftKeyFor(1))).toBe(
      false,
    );

    const window = queryClient.getQueryData<MessageWindow>(
      messagesKeys.bySession("s-new-1"),
    );
    expect(window?.pages).toHaveLength(1);
    expect(window?.pages[0]?.entries.map((node) => node.id)).toEqual([
      "first-1",
    ]);
    expect(window?.pages[0]?.nextCursor).toBeNull();
    expect(window?.pageParams).toEqual([{ kind: "tail" }]);
    // The sidebar keeps its loaded page structure: the new session joins the
    // standard list's first page at the head, and the new row is marked for
    // its enter animation.
    const standardList = queryClient.getQueryData<SessionListData>(
      sessionsKeys.list(false),
    );
    expect(standardList?.pages[0]?.sessions.map((s) => s.id)).toEqual([
      "s-new-1",
    ]);
    expect(standardList?.pageParams).toEqual([null]);
    expect(
      queryClient.getQueryData<SessionListData>(sessionsKeys.list(true))
        ?.pages[0]?.sessions,
    ).toEqual([]);
    expect(useUiStore.getState().enteringSessionId).toBe("s-new-1");
  });

  it("commits only once when double Enter straddles the guard flip", async () => {
    useUiStore.setState({
      activeSessionId: null,
      draftId: 1,
      drafts: new Map([[draftKeyFor(1), "double enter"]]),
    });
    // The create stays in flight so the pending window is observable.
    deferNextCreate = true;
    const { result } = renderSendHarness(null);

    await act(async () => {
      // The first Enter flips pendingSubmits synchronously inside send();
      // the second Enter lands before onMutate (one microtask later) and must
      // be a no-op.
      result.current.send(draftTarget(), "double enter");
      result.current.send(draftTarget(), "double enter");
      await Promise.resolve();
      // A third Enter while the IPC is still pending hits the same guard.
      result.current.send(draftTarget(), "double enter");
    });
    expect(createParams).toHaveLength(1);
    expect(useUiStore.getState().pendingSubmits.has(draftKeyFor(1))).toBe(true);

    resolveCreate?.({
      entry: entry("first-1", null, "double enter"),
      session: {
        createdAt: NOW,
        id: "s-new-1",
        pinned: false,
        title: "double enter",
        updatedAt: NOW,
      },
    });
    await waitFor(() => {
      expect(useUiStore.getState().activeSessionId).toBe("s-new-1");
    });
    expect(createParams).toHaveLength(1);
    expect(useUiStore.getState().drafts.get(draftKeyFor(1))).toBeUndefined();
  });

  it("derives the title from collapsed whitespace, capped at 50 code points", async () => {
    useUiStore.setState({
      activeSessionId: null,
      draftId: 1,
      drafts: new Map([[draftKeyFor(1), "draft one"]]),
    });
    const { result } = renderSendHarness(null);
    await act(async () => {
      result.current.send(draftTarget(), "alpha   beta\n\ngamma");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(createParams).toHaveLength(1);
    });
    expect(createParams[0]?.title).toBe("alpha beta gamma");

    useUiStore.getState().startNewChat();
    useUiStore.setState({ drafts: new Map([[draftKeyFor(2), "draft two"]]) });
    await act(async () => {
      result.current.send(draftTarget(), "x".repeat(80));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(createParams).toHaveLength(2);
    });
    expect(createParams[1]?.title).toHaveLength(50);
  });

  it("keeps the input and records the error when creation fails", async () => {
    failCreate = true;
    useUiStore.setState({
      activeSessionId: null,
      draftId: 1,
      drafts: new Map([[draftKeyFor(1), "keep me"]]),
    });
    const { result } = renderSendHarness(null);
    await act(async () => {
      result.current.send(draftTarget(), "keep me");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(useUiStore.getState().draftErrors.get(draftKeyFor(1))?.code).toBe(
        "db",
      );
    });
    expect(useUiStore.getState().drafts.get(draftKeyFor(1))).toBe("keep me");
    expect(useUiStore.getState().pendingSubmits.has(draftKeyFor(1))).toBe(
      false,
    );
    expect(useUiStore.getState().activeSessionId).toBeNull();
  });

  it("does not let a late create result steal the selection or clear a newer draft", async () => {
    useUiStore.setState({
      activeSessionId: null,
      draftId: 1,
      drafts: new Map([[draftKeyFor(1), "first draft"]]),
    });
    deferNextCreate = true;
    const { result } = renderSendHarness(null);
    await act(async () => {
      result.current.send(draftTarget(), "first draft");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(resolveCreate).not.toBeNull();
    });

    // The user starts a new draft and types while the create is in flight.
    useUiStore.getState().startNewChat();
    useUiStore.setState({ drafts: new Map([[draftKeyFor(2), "newer draft"]]) });

    resolveCreate?.({
      entry: entry("first-1", null, "first draft"),
      session: {
        createdAt: NOW,
        id: "s-new-1",
        pinned: false,
        title: "first draft",
        updatedAt: NOW,
      },
    });
    await waitFor(() => {
      expect(useUiStore.getState().pendingSubmits.has(draftKeyFor(1))).toBe(
        false,
      );
    });
    expect(useUiStore.getState().activeSessionId).toBeNull();
    expect(useUiStore.getState().drafts.get(draftKeyFor(2))).toBe(
      "newer draft",
    );
    // The late result still seeds the session's cache for the sidebar entry.
    expect(
      queryClient.getQueryData(messagesKeys.bySession("s-new-1")),
    ).toBeDefined();
    // An unloaded list is never fabricated on the late result's behalf.
    expect(queryClient.getQueryData(sessionsKeys.list(false))).toBeUndefined();
    expect(useUiStore.getState().enteringSessionId).toBe("s-new-1");
  });

  it("submits offline (networkMode always)", async () => {
    onlineManager.setOnline(false);
    useUiStore.setState({
      activeSessionId: null,
      draftId: 1,
      drafts: new Map([[draftKeyFor(1), "offline"]]),
    });
    const { result } = renderSendHarness(null);
    await act(async () => {
      result.current.send(draftTarget(), "offline");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(useUiStore.getState().activeSessionId).toBe("s-new-1");
    });
  });
});

describe("useSendMessage append", () => {
  it("merges the appended entry into the intact tail window", async () => {
    seedTailWindow("s1", 30);
    seedListCaches();
    // The standard list has s1 loaded on a page that another session heads;
    // the append moves s1 to the head with the write's timestamp as its
    // new updatedAt.
    queryClient.setQueryData<SessionListData>(sessionsKeys.list(false), {
      pageParams: [null],
      pages: [
        {
          nextCursor: null,
          sessions: [
            {
              createdAt: NOW,
              id: "s-other",
              pinned: false,
              title: "Other",
              updatedAt: NOW,
            },
            {
              createdAt: "2000-01-01T00:00:00.000Z",
              id: "s1",
              pinned: false,
              title: "Target",
              updatedAt: "2000-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    });
    useUiStore.setState({
      activeSessionId: "s1",
      draftId: 1,
      drafts: new Map([["s1", "appended text"]]),
    });
    appendParentId = "e29";
    const { result } = renderSendHarness("s1");

    await act(async () => {
      result.current.send(sessionTarget("s1"), "appended text");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.path?.messages.at(-1)?.id).toBe("appended-1");
    });
    expect(appendParams).toEqual([
      { content: [{ text: "appended text", type: "text" }], sessionId: "s1" },
    ]);
    const window = queryClient.getQueryData<MessageWindow>(
      messagesKeys.bySession("s1"),
    );
    expect(window?.pages[0]?.entries.at(-1)?.id).toBe("appended-1");
    expect(window?.pages[0]?.nextCursor).toBeNull();
    expect(window?.pageParams).toEqual([{ kind: "tail" }]);
    expect(useUiStore.getState().drafts.get("s1")).toBeUndefined();
    const standardList = queryClient.getQueryData<SessionListData>(
      sessionsKeys.list(false),
    );
    expect(standardList?.pages[0]?.sessions.map((s) => s.id)).toEqual([
      "s1",
      "s-other",
    ]);
    expect(standardList?.pages[0]?.sessions[0]?.updatedAt).toBe(NOW);
    expect(standardList?.pageParams).toEqual([null]);
  });

  it("leaves the loaded lists alone when the appended row is not on them", async () => {
    seedTailWindow("s1", 30);
    seedListCaches();
    useUiStore.setState({
      activeSessionId: "s1",
      draftId: 1,
      drafts: new Map([["s1", "from a long list"]]),
    });
    appendParentId = "e29";
    const { result } = renderSendHarness("s1");

    await act(async () => {
      result.current.send(sessionTarget("s1"), "from a long list");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.path?.messages.at(-1)?.id).toBe("appended-1");
    });
    // No page holds s1, so no position is fabricated: the lists are marked
    // stale for the active observers instead.
    const standardList = queryClient.getQueryData<SessionListData>(
      sessionsKeys.list(false),
    );
    expect(standardList?.pages[0]?.sessions).toEqual([]);
    expect(
      queryClient.getQueryState(sessionsKeys.list(false))?.isInvalidated,
    ).toBe(true);
  });

  it("resets the window to the fresh tail after sending from a history window", async () => {
    seedTailWindow("s1", 120);
    useUiStore.setState({
      activeSessionId: "s1",
      draftId: 1,
      drafts: new Map([["s1", "from history"]]),
    });
    appendParentId = "e119";
    const { result } = renderSendHarness("s1");
    await waitFor(() => {
      expect(result.current.path?.messages).toHaveLength(50);
    });
    // Paging toward history evicted the tail: the window's newest page no
    // longer holds the path end.
    queryClient.setQueryData<MessageWindow>(messagesKeys.bySession("s1"), {
      pageParams: [{ cursor: "e49", kind: "after" }],
      pages: [
        {
          entries: sessionPath.slice(50, 100),
          nextCursor: "e99",
          prevCursor: "e50",
        },
      ],
    });

    await act(async () => {
      result.current.send(sessionTarget("s1"), "from history");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.path?.messages.at(-1)?.id).toBe("appended-1");
    });
    const window = queryClient.getQueryData<MessageWindow>(
      messagesKeys.bySession("s1"),
    );
    expect(window?.pages).toHaveLength(1);
    expect(window?.pages[0]?.nextCursor).toBeNull();
  });

  it("keeps a read failure separate from the send result", async () => {
    seedTailWindow("s1", 30);
    useUiStore.setState({
      activeSessionId: "s1",
      draftId: 1,
      drafts: new Map([["s1", "sent ok"]]),
    });
    // The appended entry lands on a different branch, so no gap-free window
    // can be merged: the hook resets and the tail re-read fails.
    appendParentId = "e0";
    failTailRead = true;
    const { result } = renderSendHarness("s1");

    await act(async () => {
      result.current.send(sessionTarget("s1"), "sent ok");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.path?.error?.code).toBe("db");
    });
    // The IPC write succeeded: the draft cleared and no submit error exists.
    expect(useUiStore.getState().drafts.get("s1")).toBeUndefined();
    expect(useUiStore.getState().draftErrors.get("s1")).toBeUndefined();
    expect(useUiStore.getState().pendingSubmits.has("s1")).toBe(false);
    expect(appendParams).toHaveLength(1);

    // Retrying the read (not the write) recovers the message.
    failTailRead = false;
    await act(async () => {
      result.current.path?.retryRead();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.path?.messages.at(-1)?.id).toBe("appended-1");
    });
  });

  it("clears only the submitted version of the draft", async () => {
    seedTailWindow("s1", 30);
    useUiStore.setState({
      activeSessionId: "s1",
      draftId: 1,
      drafts: new Map([["s1", "submitted"]]),
    });
    appendParentId = "e29";
    deferNextAppend = true;
    const { result } = renderSendHarness("s1");
    await act(async () => {
      result.current.send(sessionTarget("s1"), "submitted");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(resolveAppend).not.toBeNull();
    });
    // Text typed after the submit (in another reachable context) survives.
    useUiStore.getState().setDraft("s1", "typed later");
    resolveAppend?.(entry("appended-1", "e29", "submitted"));
    await waitFor(() => {
      expect(useUiStore.getState().pendingSubmits.has("s1")).toBe(false);
    });
    expect(useUiStore.getState().drafts.get("s1")).toBe("typed later");
  });

  it("refuses to send while a delete of the same session is pending", async () => {
    seedTailWindow("s1", 30);
    useUiStore.setState({
      activeSessionId: "s1",
      draftId: 1,
      drafts: new Map([["s1", "blocked"]]),
    });
    useUiStore.getState().beginDelete("s1");
    const { result } = renderSendHarness("s1");
    await act(async () => {
      result.current.send(sessionTarget("s1"), "blocked");
      await Promise.resolve();
    });
    expect(appendParams).toHaveLength(0);
    expect(useUiStore.getState().pendingSubmits.has("s1")).toBe(false);
  });

  it("does not let a stale in-flight page read overwrite the merged window", async () => {
    seedTailWindow("s1", 100);
    useUiStore.setState({
      activeSessionId: "s1",
      draftId: 1,
      drafts: new Map([["s1", "fresh send"]]),
    });
    appendParentId = "e99";
    deferNextBefore = true;
    const { result } = renderSendHarness("s1");
    await waitFor(() => {
      expect(result.current.path?.messages).toHaveLength(50);
    });

    // An older-direction page read is now in flight.
    act(() => result.current.path?.loadOlder());
    await waitFor(() => {
      expect(resolveBefore).not.toBeNull();
    });

    await act(async () => {
      result.current.send(sessionTarget("s1"), "fresh send");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(
        queryClient
          .getQueryData<MessageWindow>(messagesKeys.bySession("s1"))
          ?.pages[0]?.entries.at(-1)?.id,
      ).toBe("appended-1");
    });

    // The full tail page splits per the merge contract: the new entry opens
    // a one-entry newest page above the former tail page.
    await waitFor(() => {
      const window = queryClient.getQueryData<MessageWindow>(
        messagesKeys.bySession("s1"),
      );
      expect(window?.pages[0]?.entries.map((node) => node.id)).toEqual([
        "appended-1",
      ]);
      expect(window?.pages[0]?.nextCursor).toBeNull();
      expect(window?.pages[1]?.entries.at(-1)?.id).toBe("e99");
      expect(window?.pageParams).toEqual([
        { kind: "tail" },
        { cursor: "appended-1", kind: "before" },
      ]);
    });

    // The cancelled read resolves late; the merged window must stand.
    resolveBefore?.({
      entries: sessionPath.slice(0, 50),
      nextCursor: null,
      prevCursor: null,
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const window = queryClient.getQueryData<MessageWindow>(
      messagesKeys.bySession("s1"),
    );
    // No older-direction page landed, and no re-fetch re-added one: the
    // stale read had no target after the cache entry was replaced.
    expect(
      window?.pages.flatMap((page) => page.entries.map((node) => node.id)),
    ).toEqual(["appended-1", ...sessionPath.slice(50, 100).map((n) => n.id)]);
    await waitFor(() => {
      expect(result.current.path?.messages.at(-1)?.id).toBe("appended-1");
    });
    expect(result.current.path?.messages.at(0)?.id).toBe("e50");
  });
});
