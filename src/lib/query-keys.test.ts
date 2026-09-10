import { describe, expect, it } from "vitest";

import { messagesKeys, sessionsKeys } from "./query-keys";

describe("query key factories", () => {
  it("builds the session list keys with the pinned filter in the key", () => {
    expect(sessionsKeys.all).toEqual(["sessions"]);
    expect(sessionsKeys.lists()).toEqual(["sessions", "list"]);
    expect(sessionsKeys.list(true)).toEqual([
      "sessions",
      "list",
      { pinned: true },
    ]);
    expect(sessionsKeys.list(false)).toEqual([
      "sessions",
      "list",
      { pinned: false },
    ]);
  });

  it("keeps both pinned lists under the shared list prefix", () => {
    for (const pinned of [true, false]) {
      expect(sessionsKeys.list(pinned).slice(0, 2)).toEqual(
        sessionsKeys.lists(),
      );
    }
  });

  it("scopes each session's message query to its own key", () => {
    expect(messagesKeys.bySession("s1")).toEqual(["messages", "s1"]);
    expect(messagesKeys.bySession("s2")).not.toEqual(
      messagesKeys.bySession("s1"),
    );
  });
});
