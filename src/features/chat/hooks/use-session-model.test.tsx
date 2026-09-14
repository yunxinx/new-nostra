import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError, Session, SessionModel } from "@/types/ipc";

import { setSessionModel } from "@/lib/ipc/sessions";
import { sessionsKeys } from "@/lib/query-keys";
import { type SessionListData } from "@/lib/session-list-cache";

import { useSessionModel, useSetSessionModel } from "./use-session-model";

// The selection lives on the session row, so these tests drive the real query
// kernel against a mocked IPC boundary: what the composer reads is what the
// loaded page holds, and a write is judged by the pages it leaves behind.

vi.mock("@/lib/ipc/sessions", () => ({
  setSessionModel: vi.fn(),
}));

const setSessionModelMock = vi.mocked(setSessionModel);

const TIMESTAMP = "2026-09-09T00:00:00.000Z";

const PROVIDER_SELECTION: SessionModel = {
  kind: "provider",
  modelId: "m1",
  providerId: "p1",
};

const UNIFIED_SELECTION: SessionModel = {
  kind: "unified",
  modelId: "fast",
};

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.resetAllMocks();
  setSessionModelMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  queryClient.clear();
});

function readSelection(sessionId: string): null | SessionModel {
  const pages = [false, true].flatMap(
    (pinned) =>
      queryClient.getQueryData<SessionListData>(sessionsKeys.list(pinned))
        ?.pages ?? [],
  );
  return (
    pages.flatMap((page) => page.sessions).find((row) => row.id === sessionId)
      ?.model ?? null
  );
}

function renderModel(sessionId: null | string) {
  return renderHook(
    ({ id }: { id: null | string }) => ({
      model: useSessionModel(id),
      save: useSetSessionModel(),
    }),
    {
      initialProps: { id: sessionId },
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

function seed(sessions: Session[]): void {
  for (const pinned of [false, true]) {
    queryClient.setQueryData<SessionListData>(sessionsKeys.list(pinned), {
      pageParams: [null],
      pages: [
        {
          nextCursor: null,
          sessions: sessions.filter((row) => row.pinned === pinned),
        },
      ],
    });
  }
}

function session(id: string, model: null | SessionModel): Session {
  return {
    createdAt: TIMESTAMP,
    id,
    model,
    pinned: id.startsWith("p"),
    title: id,
    updatedAt: TIMESTAMP,
  };
}

describe("session model selection", () => {
  it("reads the selection a loaded row carries, whichever list holds it", () => {
    seed([session("p1", UNIFIED_SELECTION), session("s1", PROVIDER_SELECTION)]);

    const pinned = renderModel("p1");
    const plain = renderModel("s1");
    const unloaded = renderModel("s9");

    expect(pinned.result.current.model).toEqual(UNIFIED_SELECTION);
    expect(plain.result.current.model).toEqual(PROVIDER_SELECTION);
    expect(unloaded.result.current.model).toBeNull();
  });

  it("shows the pick in the loaded pages before the write resolves", async () => {
    seed([session("s1", null)]);
    // A write that never settles: what the pages hold can only come from the
    // pick itself, not from a response.
    setSessionModelMock.mockReturnValue(new Promise<void>(() => undefined));
    const { result } = renderModel("s1");

    act(() => {
      result.current.save.mutate({
        model: PROVIDER_SELECTION,
        sessionId: "s1",
      });
    });

    await waitFor(() => {
      expect(readSelection("s1")).toEqual(PROVIDER_SELECTION);
    });
    // TanStack hands every mutationFn a trailing mutation-context object.
    expect(setSessionModelMock).toHaveBeenCalledWith(
      { model: PROVIDER_SELECTION, sessionId: "s1" },
      expect.anything(),
    );
  });

  it("puts the row's previous selection back when the write is rejected", async () => {
    seed([session("s1", UNIFIED_SELECTION)]);
    setSessionModelMock.mockRejectedValue({
      code: "not_found",
      message: "session not found",
    } satisfies AppError);
    const { result } = renderModel("s1");

    act(() => {
      result.current.save.mutate({
        model: PROVIDER_SELECTION,
        sessionId: "s1",
      });
    });

    await waitFor(() => {
      expect(result.current.save.error?.code).toBe("not_found");
    });
    expect(readSelection("s1")).toEqual(UNIFIED_SELECTION);
  });

  it("keeps a later pick when an earlier write is rejected", async () => {
    const FIRST_SELECTION: SessionModel = {
      kind: "provider",
      modelId: "m2",
      providerId: "p1",
    };
    seed([session("s1", PROVIDER_SELECTION)]);
    let rejectFirst: (error: AppError) => void = () => undefined;
    setSessionModelMock
      .mockReturnValueOnce(
        new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        }),
      )
      .mockReturnValue(new Promise<void>(() => undefined));
    const { result } = renderModel("s1");

    let firstSettled: Promise<unknown> = Promise.resolve();
    act(() => {
      firstSettled = result.current.save
        .mutateAsync({ model: FIRST_SELECTION, sessionId: "s1" })
        .catch(() => undefined);
    });
    await waitFor(() => {
      expect(readSelection("s1")).toEqual(FIRST_SELECTION);
    });

    act(() => {
      result.current.save.mutate({ model: UNIFIED_SELECTION, sessionId: "s1" });
    });
    await waitFor(() => {
      expect(readSelection("s1")).toEqual(UNIFIED_SELECTION);
    });

    // The first write no longer owns the row, so its failure — waiting for it
    // proves the error path ran — may not roll the selection back over the pick
    // that came after it.
    await act(async () => {
      rejectFirst({ code: "internal", message: "boom" } satisfies AppError);
      await firstSettled;
    });
    expect(readSelection("s1")).toEqual(UNIFIED_SELECTION);
  });

  it("re-reads the lists when a rollback lands on an unconfirmed value", async () => {
    const FIRST_SELECTION: SessionModel = {
      kind: "provider",
      modelId: "m2",
      providerId: "p1",
    };
    seed([session("s1", PROVIDER_SELECTION)]);
    let rejectFirst: (error: AppError) => void = () => undefined;
    let rejectSecond: (error: AppError) => void = () => undefined;
    setSessionModelMock
      .mockReturnValueOnce(
        new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        }),
      )
      .mockReturnValueOnce(
        new Promise<void>((_resolve, reject) => {
          rejectSecond = reject;
        }),
      );
    const { result } = renderModel("s1");

    let firstSettled: Promise<unknown> = Promise.resolve();
    act(() => {
      firstSettled = result.current.save
        .mutateAsync({ model: FIRST_SELECTION, sessionId: "s1" })
        .catch(() => undefined);
    });
    await waitFor(() => {
      expect(readSelection("s1")).toEqual(FIRST_SELECTION);
    });
    let secondSettled: Promise<unknown> = Promise.resolve();
    act(() => {
      secondSettled = result.current.save
        .mutateAsync({ model: UNIFIED_SELECTION, sessionId: "s1" })
        .catch(() => undefined);
    });
    await waitFor(() => {
      expect(readSelection("s1")).toEqual(UNIFIED_SELECTION);
    });

    // Both writes fail, the earlier rejection first. The first one no longer
    // owns the row, so it rolls nothing back; the second one then rolls back
    // to what its own onMutate read — the first write's selection, which no
    // server ever stored.
    await act(async () => {
      rejectFirst({ code: "internal", message: "boom" } satisfies AppError);
      await firstSettled;
    });
    await act(async () => {
      rejectSecond({ code: "internal", message: "boom" } satisfies AppError);
      await secondSettled;
    });

    // Whatever the rollback wrote may be that unconfirmed value, so the lists
    // must be reading again: the cache is never left showing a selection with
    // no pending read to correct it.
    for (const pinned of [false, true]) {
      expect(
        queryClient.getQueryState(sessionsKeys.list(pinned))?.isInvalidated,
      ).toBe(true);
    }
  });

  it("reads the lists again when no loaded page holds the row", async () => {
    seed([session("s1", null)]);
    setSessionModelMock.mockReturnValue(new Promise<void>(() => undefined));
    const { result } = renderModel("s9");

    act(() => {
      result.current.save.mutate({
        model: PROVIDER_SELECTION,
        sessionId: "s9",
      });
    });

    // Nothing the cache holds may show this pick, so the write asks for the
    // read that can; the cached page must not be the only answer.
    await waitFor(() => {
      for (const pinned of [false, true]) {
        expect(
          queryClient.getQueryState(sessionsKeys.list(pinned))?.isInvalidated,
        ).toBe(true);
      }
    });
  });

  it("reports the new selection to a reader already subscribed", async () => {
    seed([session("s1", null)]);
    const { result } = renderModel("s1");

    act(() => {
      result.current.save.mutate({ model: UNIFIED_SELECTION, sessionId: "s1" });
    });

    await waitFor(() => {
      expect(result.current.model).toEqual(UNIFIED_SELECTION);
    });
  });

  it("keeps a page's other rows untouched", async () => {
    seed([session("s1", null), session("s2", UNIFIED_SELECTION)]);
    setSessionModelMock.mockReturnValue(new Promise<void>(() => undefined));
    const { result } = renderModel("s1");

    act(() => {
      result.current.save.mutate({
        model: PROVIDER_SELECTION,
        sessionId: "s1",
      });
    });

    await waitFor(() => {
      expect(readSelection("s1")).toEqual(PROVIDER_SELECTION);
    });
    expect(readSelection("s2")).toEqual(UNIFIED_SELECTION);
  });

  it("reads no selection for a draft composer or a row no page holds", () => {
    seed([session("s1", UNIFIED_SELECTION)]);

    expect(renderModel(null).result.current.model).toBeNull();
    expect(renderModel("s9").result.current.model).toBeNull();
  });
});
