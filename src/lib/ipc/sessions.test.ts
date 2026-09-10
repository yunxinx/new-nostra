import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError, SessionPage } from "@/types/ipc";

import {
  createSession,
  deleteSession,
  listSessions,
  renameSession,
  setSessionPinned,
} from "./sessions";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("sessions IPC wrappers", () => {
  it("listSessions forwards one params DTO under the command name", async () => {
    const page: SessionPage = { nextCursor: null, sessions: [] };
    mockInvoke.mockResolvedValue(page);
    await expect(listSessions({ pinned: true })).resolves.toEqual(page);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("list_sessions", {
      params: { pinned: true },
    });
  });

  it("listSessions echoes the cursor and limit inside params", async () => {
    mockInvoke.mockResolvedValue({ nextCursor: null, sessions: [] });
    await listSessions({
      cursor: { id: "s0", updatedAt: "2026-09-09T00:00:00.000Z" },
      limit: 25,
      pinned: false,
    });
    expect(mockInvoke).toHaveBeenCalledWith("list_sessions", {
      params: {
        cursor: { id: "s0", updatedAt: "2026-09-09T00:00:00.000Z" },
        limit: 25,
        pinned: false,
      },
    });
  });

  it("createSession sends title and content blocks in one params DTO", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await createSession({
      content: [{ text: "hello", type: "text" }],
      title: "hello",
    });
    expect(mockInvoke).toHaveBeenCalledWith("create_session", {
      params: { content: [{ text: "hello", type: "text" }], title: "hello" },
    });
  });

  it("renameSession and setSessionPinned use camelCase session ids", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await renameSession({ sessionId: "s1", title: "renamed" });
    await setSessionPinned({ pinned: true, sessionId: "s1" });
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "rename_session", {
      params: { sessionId: "s1", title: "renamed" },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "set_session_pinned", {
      params: { pinned: true, sessionId: "s1" },
    });
  });

  it("deleteSession surfaces the serialized AppError rejection", async () => {
    const failure: AppError = { code: "not_found", message: "session gone" };
    mockInvoke.mockRejectedValue(failure);
    await expect(deleteSession({ sessionId: "s1" })).rejects.toEqual(failure);
  });
});
