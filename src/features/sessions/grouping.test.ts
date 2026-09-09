import { describe, expect, it } from "vitest";

import type { Session } from "@/types/ipc";

import { groupSessions } from "./grouping";

// 2026-09-09 15:00 local time; bucket boundaries are local calendar days.
const NOW = new Date(2026, 8, 9, 15, 0, 0);

// A timestamp `daysBack` local calendar days before NOW at 10:00 local.
function localIso(daysBack: number): string {
  return new Date(2026, 8, 9 - daysBack, 10, 0, 0).toISOString();
}

function session(overrides: Partial<Session>): Session {
  return {
    createdAt: "2026-09-01T00:00:00.000Z",
    id: "id",
    pinned: false,
    title: "title",
    updatedAt: localIso(0),
    ...overrides,
  };
}

describe("groupSessions", () => {
  it("sorts time buckets into sidebar display order", () => {
    const groups = groupSessions(
      [
        session({ id: "week", updatedAt: localIso(3) }),
        session({ id: "yesterday", updatedAt: localIso(1) }),
        session({ id: "today", updatedAt: localIso(0) }),
        session({ id: "month", updatedAt: localIso(8) }),
        session({ id: "earlier", updatedAt: localIso(12) }),
      ],
      NOW,
    );
    expect(groups.map((group) => group.key)).toEqual([
      "today",
      "yesterday",
      "thisWeek",
      "thisMonth",
      "earlier",
    ]);
  });

  it("keeps keyset order inside a bucket", () => {
    const groups = groupSessions(
      [
        session({ id: "s1", updatedAt: localIso(0) }),
        session({ id: "s2", updatedAt: localIso(0) }),
        session({ id: "s3", updatedAt: localIso(0) }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("buckets by local calendar day, not UTC day", () => {
    // 23:00 local on the previous day is UTC 2026-09-09 in some timezones;
    // the bucket must still be yesterday everywhere.
    const lateLocalPreviousDay = new Date(2026, 8, 8, 23, 0, 0).toISOString();
    const groups = groupSessions(
      [session({ id: "late", updatedAt: lateLocalPreviousDay })],
      NOW,
    );
    expect(groups[0]?.key).toBe("yesterday");
  });

  it("routes 2-7 days back into thisWeek even across a month boundary", () => {
    const groups = groupSessions(
      [session({ id: "edge", updatedAt: localIso(6) })],
      NOW,
    );
    expect(groups[0]?.key).toBe("thisWeek");
  });

  it("keeps same-month sessions older than a week in thisMonth", () => {
    const groups = groupSessions(
      [session({ id: "month", updatedAt: localIso(8) })],
      NOW,
    );
    expect(groups[0]?.key).toBe("thisMonth");
  });

  it("drops older-than-month sessions into earlier", () => {
    const groups = groupSessions(
      [session({ id: "old", updatedAt: localIso(40) })],
      NOW,
    );
    expect(groups[0]?.key).toBe("earlier");
  });

  it("omits empty groups", () => {
    const groups = groupSessions(
      [session({ id: "only", updatedAt: localIso(1) })],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("yesterday");
  });

  it("returns no groups for an empty session list", () => {
    expect(groupSessions([], NOW)).toEqual([]);
  });
});
