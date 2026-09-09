import { describe, expect, it } from "vitest";

import type { Entry, JsonValue } from "@/types/ipc";

import { entryToMessage, textOfParts } from "./types";

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    content: [{ text: "alpha", type: "text" }],
    createdAt: "2026-09-09T00:00:00.000Z",
    id: "e1",
    parentId: null,
    role: "user",
    type: "message",
    ...overrides,
  };
}

describe("entryToMessage", () => {
  it("projects id, role, and the ordered parts without regenerating identity", () => {
    // The metadata fixture is typed as the provider-owned JSON value: the
    // projection must carry it through verbatim.
    const providerMetadata: JsonValue = { vendor: { opaque: "value" } };
    const parts = [
      { providerMetadata, text: "one", type: "text" },
      { text: "two", type: "text" },
    ] as const;
    const message = entryToMessage(
      makeEntry({ content: [...parts], id: "e9", role: "assistant" }),
    );
    expect(message).toEqual({ id: "e9", parts, role: "assistant" });
    expect(message.parts[0]?.providerMetadata).toEqual({
      vendor: { opaque: "value" },
    });
  });

  it("keeps each entry's id distinct from other projections", () => {
    const a = entryToMessage(makeEntry({ id: "a" }));
    const b = entryToMessage(makeEntry({ id: "b" }));
    expect(a.id).not.toBe(b.id);
  });
});

describe("textOfParts", () => {
  it("joins text parts with a paragraph gap, preserving order", () => {
    expect(
      textOfParts([
        { text: "one", type: "text" },
        { text: "two", type: "text" },
      ]),
    ).toBe("one\n\ntwo");
  });

  it("returns an empty string for an empty parts array", () => {
    expect(textOfParts([])).toBe("");
  });
});
