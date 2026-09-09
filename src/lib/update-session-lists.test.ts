import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Session, SessionPage } from "@/types/ipc";

import type { SessionListData } from "./session-list-cache";

import { sessionsKeys } from "./query-keys";
import { updateSessionLists } from "./update-session-lists";

const TIMESTAMP = "2026-09-09T00:00:00.000Z";
const LATER_TIMESTAMP = "2026-09-09T00:00:01.000Z";
const ORIGINAL = session("s2", "Old title");
const RENAMED = { ...ORIGINAL, title: "Fresh title" };
const OTHER = session("s1", "Other session");
const CREATED = { ...session("s3", "Created"), updatedAt: LATER_TIMESTAMP };
const CHANGES: {
  change: Parameters<typeof updateSessionLists>[1];
  expected: Session[];
}[] = [
  {
    change: { kind: "create", session: CREATED },
    expected: [CREATED, RENAMED, OTHER],
  },
  {
    change: {
      kind: "append",
      sessionId: ORIGINAL.id,
      updatedAt: LATER_TIMESTAMP,
    },
    expected: [{ ...RENAMED, updatedAt: LATER_TIMESTAMP }, OTHER],
  },
  {
    change: { kind: "delete", sessionId: OTHER.id },
    expected: [RENAMED],
  },
];

let queryClient: QueryClient;
let unsubscribers: (() => void)[];

function deferredPage() {
  let resolve: (value: SessionPage) => void = () => undefined;
  const promise = new Promise<SessionPage>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function observe(pinned: boolean, queryFn: () => Promise<SessionPage>) {
  const observer = new InfiniteQueryObserver(queryClient, {
    getNextPageParam: (lastPage: SessionPage) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: null,
    queryFn,
    queryKey: sessionsKeys.list(pinned),
  });
  unsubscribers.push(observer.subscribe(() => undefined));
  return observer;
}

function page(sessions: Session[]): SessionPage {
  return { nextCursor: null, sessions };
}

function seed(pinned: boolean, sessions: Session[]): void {
  queryClient.setQueryData<SessionListData>(sessionsKeys.list(pinned), {
    pageParams: [null],
    pages: [page(sessions)],
  });
}

function session(id: string, title: string): Session {
  return {
    createdAt: TIMESTAMP,
    id,
    pinned: false,
    title,
    updatedAt: TIMESTAMP,
  };
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        networkMode: "always",
        retry: false,
        staleTime: Infinity,
      },
    },
  });
  unsubscribers = [];
});

afterEach(() => {
  for (const unsubscribe of unsubscribers) unsubscribe();
  queryClient.clear();
});

describe("committed session list updates", () => {
  it.each(["append", "delete"] as const)(
    "completes the other stream's first read after %s",
    async (kind) => {
      seed(false, [ORIGINAL]);
      const first = deferredPage();
      const favorite = { ...session("p1", "Current favorite"), pinned: true };
      const queryFn = vi
        .fn<() => Promise<SessionPage>>()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(page([favorite]));
      const observer = observe(true, queryFn);

      await updateSessionLists(
        queryClient,
        kind === "append"
          ? { kind, sessionId: ORIGINAL.id, updatedAt: LATER_TIMESTAMP }
          : { kind, sessionId: ORIGINAL.id },
      );
      first.resolve(page([{ ...favorite, title: "Stale favorite" }]));
      await first.promise;

      expect(observer.getCurrentResult().data?.pages).toEqual([
        page([favorite]),
      ]);
      expect(observer.getCurrentResult().isSuccess).toBe(true);
      expect(observer.getCurrentResult().isFetching).toBe(false);
    },
  );

  it.each(CHANGES)(
    "preserves a pending rename refresh across $change.kind",
    async ({ change, expected }) => {
      seed(false, [ORIGINAL, OTHER]);
      seed(true, []);
      const first = deferredPage();
      const queryFn = vi
        .fn<() => Promise<SessionPage>>()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(page(expected));
      const observer = observe(false, queryFn);
      const refresh = queryClient.invalidateQueries({
        queryKey: sessionsKeys.list(false),
      });
      expect(observer.getCurrentResult().isFetching).toBe(true);

      await updateSessionLists(queryClient, change);
      first.resolve(page([RENAMED, OTHER]));
      await refresh;

      expect(observer.getCurrentResult().data?.pages).toEqual([page(expected)]);
      expect(observer.getCurrentResult().error).toBeNull();
    },
  );

  it.each(CHANGES)(
    "keeps loaded page boundaries when $change.kind cancels pagination",
    async ({ change, expected }) => {
      const firstCursor = { id: ORIGINAL.id, updatedAt: TIMESTAMP };
      const lastCursor = { id: OTHER.id, updatedAt: TIMESTAMP };
      const pageParams = [null, firstCursor];
      queryClient.setQueryData<SessionListData>(sessionsKeys.list(false), {
        pageParams,
        pages: [
          { nextCursor: firstCursor, sessions: [RENAMED] },
          { nextCursor: lastCursor, sessions: [OTHER] },
        ],
      });
      seed(true, []);
      const nextPage = deferredPage();
      const queryFn = vi.fn<() => Promise<SessionPage>>(() => nextPage.promise);
      const observer = observe(false, queryFn);
      const pagination = observer.fetchNextPage();
      expect(observer.getCurrentResult().isFetchingNextPage).toBe(true);

      await updateSessionLists(queryClient, change);
      nextPage.resolve(page([session("s0", "Older session")]));
      await pagination;

      const data = queryClient.getQueryData<SessionListData>(
        sessionsKeys.list(false),
      );
      expect(data?.pages.flatMap((page) => page.sessions)).toEqual(expected);
      expect(data?.pages.map((page) => page.nextCursor)).toEqual([
        firstCursor,
        lastCursor,
      ]);
      expect(data?.pageParams).toBe(pageParams);
      expect(queryFn).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps a failed recovery read separate from the committed write", async () => {
    seed(false, [ORIGINAL]);
    seed(true, []);
    const first = deferredPage();
    const readError = new Error("read failed");
    const queryFn = vi
      .fn<() => Promise<SessionPage>>()
      .mockReturnValueOnce(first.promise)
      .mockRejectedValue(readError);
    const observer = observe(false, queryFn);
    const refresh = queryClient.invalidateQueries({
      queryKey: sessionsKeys.list(false),
    });

    await expect(
      updateSessionLists(queryClient, {
        kind: "append",
        sessionId: ORIGINAL.id,
        updatedAt: LATER_TIMESTAMP,
      }),
    ).resolves.toBeUndefined();
    first.resolve(page([RENAMED]));
    await refresh;

    expect(observer.getCurrentResult().error).toBe(readError);
    expect(observer.getCurrentResult().data?.pages).toEqual([
      page([{ ...ORIGINAL, updatedAt: LATER_TIMESTAMP }]),
    ]);
  });

  it("retains invalidation until an inactive list can refresh", async () => {
    seed(false, [ORIGINAL]);
    seed(true, []);
    await queryClient.invalidateQueries({
      queryKey: sessionsKeys.list(false),
      refetchType: "none",
    });

    await updateSessionLists(queryClient, {
      kind: "append",
      sessionId: ORIGINAL.id,
      updatedAt: LATER_TIMESTAMP,
    });

    expect(
      queryClient.getQueryState(sessionsKeys.list(false))?.isInvalidated,
    ).toBe(true);
  });
});
