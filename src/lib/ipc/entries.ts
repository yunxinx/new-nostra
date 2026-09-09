import { invoke } from "@tauri-apps/api/core";

import type { ContentBlock, Entry, PathPage } from "@/types/ipc";

/**
 * append_message request: appends to the session's current active leaf; the
 * backend owns the parent, role, and id — neither is submittable here.
 */
export interface AppendMessageParams {
  content: ContentBlock[];
  sessionId: string;
}

/**
 * load_active_path_before/after request: the cursor must be an entry id on the
 * session's current active path; a stale or foreign cursor is rejected.
 */
export interface LoadActivePathCursorParams {
  cursor: string;
  limit?: number;
  sessionId: string;
}

/**
 * load_active_path request: reads the newest window of the active path. `limit`
 * defaults to 50 and is capped at 50 by the backend.
 */
export interface LoadActivePathParams {
  limit?: number;
  sessionId: string;
}

/**
 * Appends one user message to the session's active leaf and advances the
 * pointer in the same transaction. Rejects with AppError on blank content, a
 * missing session, or database failure.
 */
export function appendMessage(params: AppendMessageParams): Promise<Entry> {
  return invoke("append_message", { params });
}

/**
 * Reads the newest window of the active path, entries oldest-to-newest.
 * Rejects with AppError when the session is missing.
 */
export function loadActivePath(
  params: LoadActivePathParams,
): Promise<PathPage> {
  return invoke("load_active_path", { params });
}

/**
 * Reads the page immediately newer than the cursor (cursor excluded) while
 * staying on the active path. Rejects with AppError on a missing session or an
 * invalid cursor.
 */
export function loadActivePathAfter(
  params: LoadActivePathCursorParams,
): Promise<PathPage> {
  return invoke("load_active_path_after", { params });
}

/**
 * Reads the page immediately older than the cursor (cursor excluded) on the
 * active path. Rejects with AppError on a missing session or an invalid cursor.
 */
export function loadActivePathBefore(
  params: LoadActivePathCursorParams,
): Promise<PathPage> {
  return invoke("load_active_path_before", { params });
}
