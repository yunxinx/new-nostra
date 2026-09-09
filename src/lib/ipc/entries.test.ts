import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError, PathPage } from "@/types/ipc";

import {
  appendMessage,
  loadActivePath,
  loadActivePathAfter,
  loadActivePathBefore,
} from "./entries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("entries IPC wrappers", () => {
  it("appendMessage sends the session id and content blocks", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await appendMessage({
      content: [{ text: "hello", type: "text" }],
      sessionId: "s1",
    });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("append_message", {
      params: { content: [{ text: "hello", type: "text" }], sessionId: "s1" },
    });
  });

  it("loadActivePath defaults to no explicit limit inside params", async () => {
    const page: PathPage = { entries: [], nextCursor: null, prevCursor: null };
    mockInvoke.mockResolvedValue(page);
    await expect(loadActivePath({ sessionId: "s1" })).resolves.toEqual(page);
    expect(mockInvoke).toHaveBeenCalledWith("load_active_path", {
      params: { sessionId: "s1" },
    });
  });

  it("before and after reads carry the cursor under its own command name", async () => {
    mockInvoke.mockResolvedValue({
      entries: [],
      nextCursor: null,
      prevCursor: null,
    });
    await loadActivePathBefore({ cursor: "e9", limit: 50, sessionId: "s1" });
    await loadActivePathAfter({ cursor: "e9", sessionId: "s1" });
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "load_active_path_before", {
      params: { cursor: "e9", limit: 50, sessionId: "s1" },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "load_active_path_after", {
      params: { cursor: "e9", sessionId: "s1" },
    });
  });

  it("appendMessage surfaces the serialized AppError rejection", async () => {
    const failure: AppError = {
      code: "invalid_input",
      message: "blank content",
    };
    mockInvoke.mockRejectedValue(failure);
    await expect(
      appendMessage({ content: [], sessionId: "s1" }),
    ).rejects.toEqual(failure);
  });
});
