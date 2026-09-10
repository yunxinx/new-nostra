import { invoke } from "@tauri-apps/api/core";

import type {
  ContentBlock,
  CreatedSession,
  SessionCursor,
  SessionPage,
} from "@/types/ipc";

/** create_session request: the first-send title and content, committed atomically. */
export interface CreateSessionParams {
  content: ContentBlock[];
  title: string;
}

/** delete_session request: removes the session and its whole entry forest. */
export interface DeleteSessionParams {
  sessionId: string;
}

/** list_sessions request: the pinned filter must also be part of the query key. */
export interface ListSessionsParams {
  cursor?: SessionCursor;
  limit?: number;
  pinned: boolean;
}

/** rename_session request: an empty or whitespace-only title is rejected. */
export interface RenameSessionParams {
  sessionId: string;
  title: string;
}

/** set_session_pinned request: changes group membership, not updatedAt. */
export interface SetSessionPinnedParams {
  pinned: boolean;
  sessionId: string;
}

/**
 * Creates the session and its first entry in one transaction; the caller keeps
 * the draft until this resolves. Rejects with AppError on blank content or
 * database failure, leaving no session row behind.
 */
export function createSession(
  params: CreateSessionParams,
): Promise<CreatedSession> {
  return invoke("create_session", { params });
}

/**
 * Deletes the session and its whole entry forest. Rejects with AppError when
 * the session is missing; a rejection leaves data and the active leaf intact.
 */
export function deleteSession(params: DeleteSessionParams): Promise<void> {
  return invoke("delete_session", { params });
}

/**
 * Lists one keyset page of sessions for a pinned filter. Rejects with AppError
 * on database failure.
 */
export function listSessions(params: ListSessionsParams): Promise<SessionPage> {
  return invoke("list_sessions", { params });
}

/**
 * Renames a session without touching updatedAt. Rejects with AppError when the
 * session is missing or the title is blank.
 */
export function renameSession(params: RenameSessionParams): Promise<void> {
  return invoke("rename_session", { params });
}

/**
 * Pins or unpins a session; grouping changes, activity order does not. Rejects
 * with AppError when the session is missing.
 */
export function setSessionPinned(
  params: SetSessionPinnedParams,
): Promise<void> {
  return invoke("set_session_pinned", { params });
}
