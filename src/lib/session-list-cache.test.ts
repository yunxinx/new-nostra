import { describe, expect, it } from "vitest";

import type { Session, SessionPage } from "@/types/ipc";

import {
  insertSessionInList,
  type SessionListData,
  updateSessionActivity,
} from "./session-list-cache";

function list(pages: SessionPage[]): SessionListData {
  return { pageParams: pages.map(() => null), pages };
}

function session(id: string, updatedAt: string): Session {
  return {
    createdAt: updatedAt,
    id,
    pinned: false,
    title: id,
    updatedAt,
  };
}

describe("session list cache", () => {
  it("places late rows within cursor boundaries and rejects unloaded positions", () => {
    const timestamp = "2026-09-09T00:00:00.000Z";
    const cursor = { id: "m", updatedAt: timestamp };
    const olderCursor = { id: "b", updatedAt: timestamp };
    const data: SessionListData = {
      pageParams: [null, cursor],
      pages: [
        {
          nextCursor: cursor,
          sessions: [session("z", timestamp), session("m", timestamp)],
        },
        { nextCursor: olderCursor, sessions: [session("b", timestamp)] },
      ],
    };
    const result = insertSessionInList(data, session("f", timestamp));
    expect(
      result?.pages.map((page) => page.sessions.map((row) => row.id)),
    ).toEqual([
      ["z", "m"],
      ["f", "b"],
    ]);
    expect(result?.pages.map((page) => page.nextCursor)).toEqual([
      cursor,
      olderCursor,
    ]);
    expect(result?.pageParams).toBe(data.pageParams);
    expect(insertSessionInList(data, session("a", timestamp))).toBeNull();
  });

  it("places a late create after a newer completed session", () => {
    const result = insertSessionInList(
      list([
        {
          nextCursor: null,
          sessions: [session("new", "2026-09-09T00:00:02.000Z")],
        },
      ]),
      session("old", "2026-09-09T00:00:01.000Z"),
    );

    expect(result?.pages[0]?.sessions.map((row) => row.id)).toEqual([
      "new",
      "old",
    ]);
  });

  it("uses the id tiebreak when timestamps match", () => {
    const result = insertSessionInList(
      list([
        {
          nextCursor: null,
          sessions: [session("a", "2026-09-09T00:00:01.000Z")],
        },
      ]),
      session("z", "2026-09-09T00:00:01.000Z"),
    );

    expect(result?.pages[0]?.sessions.map((row) => row.id)).toEqual(["z", "a"]);
  });

  it("keeps a newer activity result when an older callback resolves late", () => {
    const initial = list([
      {
        nextCursor: null,
        sessions: [
          session("other", "2026-09-09T00:00:03.000Z"),
          session("target", "2026-09-09T00:00:00.000Z"),
        ],
      },
    ]);
    const newer = updateSessionActivity(
      initial,
      "target",
      "2026-09-09T00:00:02.000Z",
    );
    const result = updateSessionActivity(
      newer ?? undefined,
      "target",
      "2026-09-09T00:00:01.000Z",
    );

    expect(result?.pages[0]?.sessions.map((row) => row.id)).toEqual([
      "other",
      "target",
    ]);
    expect(result?.pages[0]?.sessions[1]?.updatedAt).toBe(
      "2026-09-09T00:00:02.000Z",
    );
  });
});
