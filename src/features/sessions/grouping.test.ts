import { describe, expect, it } from "vitest";

import type { MockSession } from "./mock";

import { groupSessions } from "./grouping";

function session(overrides: Partial<MockSession>): MockSession {
  return {
    group: "today",
    id: "id",
    messages: [],
    starred: false,
    title: "title",
    ...overrides,
  };
}

describe("groupSessions", () => {
  it("sorts groups into sidebar display order", () => {
    const groups = groupSessions([
      session({ group: "thisWeek", id: "week" }),
      session({ group: "yesterday", id: "yesterday" }),
      session({ group: "today", id: "today" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual([
      "today",
      "yesterday",
      "thisWeek",
    ]);
  });

  it("routes starred sessions into favorites ahead of time groups", () => {
    const groups = groupSessions([
      session({ group: "thisWeek", id: "starred", starred: true }),
      session({ group: "today", id: "plain" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["favorites", "today"]);
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(["starred"]);
  });

  it("omits empty groups", () => {
    const groups = groupSessions([session({ group: "yesterday", id: "only" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("yesterday");
  });

  it("returns no groups for an empty session list", () => {
    expect(groupSessions([])).toEqual([]);
  });
});
