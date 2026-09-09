// Mirror of the Rust command DTOs. The JSON contract is owned by
// src-tauri/src/commands/{sessions,entries}.rs and src-tauri/src/types.rs;
// every change there must update this file in the same batch.

/**
 * Mirrors src-tauri/src/error.rs AppError: the shape every command rejects
 * with. User-facing copy comes from i18n `errors.<code>`; `message` is
 * developer diagnostics only.
 * Legal value: { code: "not_found", message: "session gone" }
 */
export interface AppError {
  code:
    | "config"
    | "db"
    | "internal"
    | "invalid_input"
    | "network"
    | "not_found"
    | "protocol";
  message: string;
}

/**
 * Mirrors src-tauri/src/types.rs ContentBlock: the ordered storage and render
 * unit. The tag is the kebab-case variant name, variant fields are camelCase;
 * a provider's own JSON keys stay verbatim. Absent metadata serializes with the
 * field omitted.
 * Legal value: { "type": "text", "text": "hi", "providerMetadata": { "vendor": { "k": 1 } } }
 */
export type ContentBlock = {
  providerMetadata?: JsonValue;
  text: string;
  type: "text";
};

/**
 * Mirrors src-tauri/src/commands/sessions.rs CreatedSessionDto: the atomic
 * first-send result — the new session and its first entry in one commit.
 */
export interface CreatedSession {
  entry: Entry;
  session: Session;
}

/**
 * Mirrors src-tauri/src/commands/sessions.rs EntryDto: a message tree node.
 * `parentId` is null for roots and immutable after write; `role` comes from the
 * stored payload; `type` is "message" in M1.
 */
export interface Entry {
  content: ContentBlock[];
  createdAt: string;
  id: string;
  parentId: null | string;
  role: MessageRole;
  type: "message";
}

/**
 * serde_json::Value equivalent: provider-owned JSON that crosses the boundary
 * verbatim. `providerMetadata` accepts any JSON value; null decodes as absent.
 */
export type JsonValue =
  boolean | JsonValue[] | null | number | string | { [key: string]: JsonValue };

/**
 * Mirrors src-tauri/src/types.rs MessageRole: the persisted role, decoded from
 * the stored payload and never inferred from an entry's type or render branch.
 * Legal values: "assistant" | "user"
 */
export type MessageRole = "assistant" | "user";

/**
 * Mirrors src-tauri/src/commands/entries.rs PathPageDto: one window of the
 * active path. `entries` are always ordered oldest-to-newest; each cursor
 * carries the page's boundary entry id and is non-null only when the path
 * continues past that boundary (an empty path returns both null).
 */
export interface PathPage {
  entries: Entry[];
  nextCursor: null | string;
  prevCursor: null | string;
}

/**
 * Mirrors src-tauri/src/commands/sessions.rs SessionDto. RFC 3339 UTC
 * timestamps with fixed millisecond precision.
 */
export interface Session {
  createdAt: string;
  id: string;
  pinned: boolean;
  title: string;
  updatedAt: string;
}

/**
 * Mirrors src-tauri/src/commands/sessions.rs SessionCursorDto: keyset cursor
 * over (updatedAt, id). Opaque to the frontend except that it is echoed back
 * to list_sessions unchanged.
 */
export interface SessionCursor {
  id: string;
  updatedAt: string;
}

/**
 * Mirrors src-tauri/src/commands/sessions.rs SessionPageDto: one keyset page
 * ordered newest-to-oldest; `nextCursor` is null on the last page.
 */
export interface SessionPage {
  nextCursor: null | SessionCursor;
  sessions: Session[];
}
