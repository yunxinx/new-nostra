import { describe, expect, it } from "vitest";

import type {
  AppError,
  ContentBlock,
  CreatedSession,
  Entry,
  MessageRole,
  PathPage,
  Session,
  SessionPage,
} from "./ipc";

// The fixed JSON below is the design §3.2 protocol sample, the same fixture the
// Rust side decodes in src-tauri/src/types.rs tests; field names here must
// match that serde output exactly (AC-10).

const TEXT_BLOCK_WITH_METADATA =
  '{ "type": "text", "text": "hello", "providerMetadata": { "vendor": { "opaque": "value" } } }';
const TEXT_BLOCK_WITHOUT_METADATA = '{ "type": "text", "text": "hi" }';

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("fixture is not an object");
  }
  return (value as Record<string, unknown>)[key];
}

describe("ContentBlock JSON contract", () => {
  it("keeps the kebab-case tag and the camelCase metadata field name", () => {
    const block: ContentBlock = {
      providerMetadata: { vendor: { opaque: "value" } },
      text: "hello",
      type: "text",
    };
    const parsed: unknown = JSON.parse(TEXT_BLOCK_WITH_METADATA);
    expect(field(parsed, "type")).toBe("text");
    expect(field(parsed, "text")).toBe("hello");
    expect(field(parsed, "providerMetadata")).toEqual({
      vendor: { opaque: "value" },
    });
    expect(field(parsed, "provider_metadata")).toBeUndefined();
    expect(JSON.parse(JSON.stringify(block))).toEqual(parsed);
  });

  it("omits providerMetadata when absent, never null", () => {
    const parsed: unknown = JSON.parse(TEXT_BLOCK_WITHOUT_METADATA);
    expect(field(parsed, "providerMetadata")).toBeUndefined();
    expect(field(parsed, "provider_metadata")).toBeUndefined();
  });
});

describe("MessageRole values", () => {
  it("accepts exactly the persisted role strings", () => {
    const roles: MessageRole[] = ["assistant", "user"];
    expect(roles).toEqual(["assistant", "user"]);
  });
});

describe("Entry mirror", () => {
  it("fits a fully populated node with non-null parent and metadata", () => {
    const entry: Entry = {
      content: [
        {
          providerMetadata: { vendor: { opaque: "value" } },
          text: "hello",
          type: "text",
        },
      ],
      createdAt: "2026-09-09T00:00:00.000Z",
      id: "e1",
      parentId: "e0",
      role: "user",
      type: "message",
    };
    expect(entry.parentId).toBe("e0");
    expect(entry.role).toBe("user");
    expect(entry.content).toHaveLength(1);
  });

  it("keeps a root's parentId null and ordered multiple blocks", () => {
    const entry: Entry = {
      content: [
        { text: "first", type: "text" },
        { text: "second", type: "text" },
      ],
      createdAt: "2026-09-09T00:00:00.000Z",
      id: "root",
      parentId: null,
      role: "assistant",
      type: "message",
    };
    expect(entry.parentId).toBeNull();
    expect(entry.content.map((block) => block.text)).toEqual([
      "first",
      "second",
    ]);
  });
});

describe("session and page mirrors", () => {
  it("fits an atomic create result", () => {
    const created: CreatedSession = {
      entry: {
        content: [{ text: "hello", type: "text" }],
        createdAt: "2026-09-09T00:00:00.000Z",
        id: "e1",
        parentId: null,
        role: "user",
        type: "message",
      },
      session: {
        createdAt: "2026-09-09T00:00:00.000Z",
        id: "s1",
        pinned: false,
        title: "hello",
        updatedAt: "2026-09-09T00:00:00.000Z",
      },
    };
    expect(created.session.id).toBe("s1");
    expect(created.entry.id).toBe("e1");
  });

  it("fits session and path pages with explicit null cursors", () => {
    const session: Session = {
      createdAt: "2026-09-09T00:00:00.000Z",
      id: "s1",
      pinned: false,
      title: "hello",
      updatedAt: "2026-09-09T00:00:00.000Z",
    };
    const page: SessionPage = {
      nextCursor: { id: "s0", updatedAt: "2026-09-09T00:00:00.000Z" },
      sessions: [session],
    };
    const path: PathPage = { entries: [], nextCursor: null, prevCursor: null };
    expect(page.nextCursor?.id).toBe("s0");
    expect(path.nextCursor).toBeNull();
    expect(path.prevCursor).toBeNull();
  });
});

describe("AppError mirror", () => {
  it("fits every serialized error code with camelCase fields", () => {
    const codes = [
      "config",
      "db",
      "internal",
      "invalid_input",
      "network",
      "not_found",
      "protocol",
    ] as const;
    for (const code of codes) {
      const error: AppError = { code, message: "diagnostics" };
      expect(error.message).toBe("diagnostics");
    }
  });
});
