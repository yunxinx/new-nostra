import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { Profiler } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { AppError, Session } from "@/types/ipc";

import { initI18n } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";

import { SESSION_ROW_ANIMATION_MS } from "../hooks/use-sessions";
import { SessionRow } from "./SessionRow";

const TIMESTAMP = "2026-09-09T00:00:00.000Z";

type ResolveCommand = (value: unknown) => void;

let queryClient: QueryClient;
let calls: Array<{ command: string; params: unknown }>;
let failCommand: null | string;
let deferred: ((resolve: ResolveCommand) => void) | null;

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    createdAt: TIMESTAMP,
    id: "s1",
    pinned: false,
    title: "Original title",
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function renderRow(session: Session, onSelect = vi.fn()): void {
  render(
    <QueryClientProvider client={queryClient}>
      <SessionRow isActive={false} onSelect={onSelect} session={session} />
    </QueryClientProvider>,
  );
}

beforeAll(initI18n);
beforeEach(() => {
  useUiStore.setState(useUiStore.getInitialState(), true);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  calls = [];
  failCommand = null;
  deferred = null;
  mockIPC((command, payload) => {
    calls.push({
      command,
      params: (payload as { params?: unknown }).params,
    });
    if (failCommand === command) {
      // The wire protocol rejects with the serialized AppError object, not
      // an Error instance; plain throws need the escape hatch.
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- mockIPC rejects with the AppError JSON shape the Rust boundary produces; undo when the mocks module types its rejections.
      throw { code: "db", message: "command failed" } satisfies AppError;
    }
    if (deferred && command !== "list_sessions") {
      const pending = deferred;
      return new Promise<unknown>((resolve) => {
        pending(resolve);
      });
    }
    return undefined;
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  clearMocks();
});

describe("SessionRow", () => {
  it("selects the session from the row surface but not from action buttons", () => {
    const onSelect = vi.fn();
    renderRow(makeSession(), onSelect);
    fireEvent.click(screen.getByRole("button", { name: "Original title" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("s1");

    fireEvent.click(screen.getByRole("button", { name: "Favorite" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("toggles the pinned state through set_session_pinned", async () => {
    renderRow(makeSession());
    fireEvent.click(screen.getByRole("button", { name: "Favorite" }));
    await act(async () => {});
    expect(calls).toEqual([
      {
        command: "set_session_pinned",
        params: { pinned: true, sessionId: "s1" },
      },
    ]);
  });

  it("opens inline edit from a double-click anywhere on the row", async () => {
    renderRow(makeSession());
    // The row itself, not just the title span, is the double-click target;
    // the button cluster stays excluded.
    const row = screen.getByText("Original title").closest("div");
    expect(row).not.toBeNull();
    fireEvent.doubleClick(row as HTMLElement);
    expect(await screen.findByLabelText("Title")).toHaveProperty(
      "value",
      "Original title",
    );
  });

  it("renames through double-click inline edit with blur and Enter", async () => {
    renderRow(makeSession());
    fireEvent.doubleClick(screen.getByText("Original title"));
    const input = await screen.findByLabelText("Title");
    expect(input).toHaveProperty("value", "Original title");
    fireEvent.change(input, { target: { value: "  Renamed  " } });
    fireEvent.blur(input);
    await act(async () => {});
    expect(calls).toEqual([
      {
        command: "rename_session",
        params: { sessionId: "s1", title: "Renamed" },
      },
    ]);
    // A committed edit closes the editor.
    expect(screen.queryByLabelText("Title")).toBeNull();

    // Enter commits as well.
    fireEvent.doubleClick(screen.getByText("Original title"));
    const nextInput = await screen.findByLabelText("Title");
    fireEvent.change(nextInput, { target: { value: "Via enter" } });
    fireEvent.keyDown(nextInput, { key: "Enter" });
    await act(async () => {});
    expect(calls.at(-1)).toEqual({
      command: "rename_session",
      params: { sessionId: "s1", title: "Via enter" },
    });
  });

  it("closes the editor without a mutation when the title is unchanged", async () => {
    renderRow(makeSession());
    fireEvent.doubleClick(screen.getByText("Original title"));
    const input = await screen.findByLabelText("Title");
    // Same text, no mutation and the original title renders again.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(0);
    expect(screen.getByText("Original title")).toBeTruthy();
    expect(screen.queryByLabelText("Title")).toBeNull();

    // Trimmed-equal text is still unchanged.
    fireEvent.doubleClick(screen.getByText("Original title"));
    const nextInput = await screen.findByLabelText("Title");
    fireEvent.change(nextInput, { target: { value: " Original title " } });
    fireEvent.blur(nextInput);
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(0);
    expect(screen.getByText("Original title")).toBeTruthy();
  });

  it("treats a blank title as unsaved and restores the original", async () => {
    renderRow(makeSession());
    fireEvent.doubleClick(screen.getByText("Original title"));
    const input = await screen.findByLabelText("Title");

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await act(async () => {});
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(0);
    expect(screen.getByText("Original title")).toBeTruthy();
    expect(screen.queryByLabelText("Title")).toBeNull();
  });

  it("does not submit the rename while IME composition is confirming", async () => {
    renderRow(makeSession());
    fireEvent.doubleClick(screen.getByText("Original title"));
    const input = await screen.findByLabelText("Title");
    fireEvent.change(input, { target: { value: "Composing" } });

    fireEvent.keyDown(input, { isComposing: true, key: "Enter" });
    // WebKit can report the confirming Enter after compositionend with
    // isComposing already false but keyCode 229.
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    await act(async () => {});
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(0);
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });

  it("cancels the edit via Escape without submitting", async () => {
    renderRow(makeSession());
    fireEvent.doubleClick(screen.getByText("Original title"));
    const input = await screen.findByLabelText("Title");
    fireEvent.change(input, { target: { value: "Edited" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(0);
    expect(screen.getByText("Original title")).toBeTruthy();
    expect(screen.queryByLabelText("Title")).toBeNull();
  });

  it("keeps the inline input and shows the error when renaming fails", async () => {
    failCommand = "rename_session";
    renderRow(makeSession());
    fireEvent.doubleClick(screen.getByText("Original title"));
    const input = await screen.findByLabelText("Title");
    fireEvent.change(input, { target: { value: "Kept draft" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("Database error")).toBeTruthy();
    expect(input).toHaveProperty("value", "Kept draft");
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });

  it("disables the inline input while the submission is in flight", async () => {
    let resolveRename: ResolveCommand = () => {};
    deferred = (resolve) => {
      resolveRename = resolve;
    };
    renderRow(makeSession());
    fireEvent.doubleClick(screen.getByText("Original title"));
    const input = await screen.findByLabelText("Title");
    fireEvent.change(input, { target: { value: "Pending title" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // The pending state reaches React via notifyManager's setTimeout(0), so
    // it needs the real-timer wait, not just an act microtask flush.
    await vi.waitFor(() => {
      expect(screen.getByLabelText("Title")).toHaveProperty("disabled", true);
    });

    resolveRename(undefined);
    await act(async () => {});
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(1);
  });

  it("does not submit a second time when blur follows the Enter commit", async () => {
    let resolveRename: ResolveCommand = () => {};
    deferred = (resolve) => {
      resolveRename = resolve;
    };
    renderRow(makeSession());
    fireEvent.doubleClick(screen.getByText("Original title"));
    const input = await screen.findByLabelText("Title");
    fireEvent.change(input, { target: { value: "Once only" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => {
      expect(screen.getByLabelText("Title")).toHaveProperty("disabled", true);
    });
    // Disabling the focused input fires blur; the Enter-initiated exit must
    // swallow it.
    fireEvent.blur(input);
    resolveRename(undefined);
    await act(async () => {});
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(1);
  });

  it("retries the rename via blur after a failure", async () => {
    failCommand = "rename_session";
    renderRow(makeSession());
    fireEvent.doubleClick(screen.getByText("Original title"));
    const input = await screen.findByLabelText("Title");
    fireEvent.change(input, { target: { value: "Retry me" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("Database error")).toBeTruthy();

    // The failed exit resets: a blur commits the retry instead of being
    // swallowed.
    fireEvent.blur(input);
    await act(async () => {});
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(2);
  });

  it("deletes after confirmation and cancels without invoking", async () => {
    const onSelect = vi.fn();
    renderRow(makeSession(), onSelect);
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    await screen.findByRole("dialog");
    expect(
      screen.getByText("Delete this chat? This cannot be undone."),
    ).toBeTruthy();

    // Clicks inside the portaled popover must never reach the row's onClick
    // through React's portal event propagation.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      calls.filter((call) => call.command === "delete_session"),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    await screen.findByRole("dialog");
    // The confirm button shares its label with the row trigger, so scope the
    // lookup to the open dialog.
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete chat",
      }),
    );
    // The popover closes at the confirm click and the row starts exiting:
    // neither further actions nor row selection target it.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Favorite" })).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    // The exit window holds the cache removal; let it settle.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(calls.filter((call) => call.command === "delete_session")).toEqual([
      { command: "delete_session", params: { sessionId: "s1" } },
    ]);
  });

  it("keeps the action cluster hidden while the delete exit is in flight", async () => {
    let resolveDelete: ResolveCommand = () => {};
    deferred = (resolve) => {
      resolveDelete = resolve;
    };
    const onSelect = vi.fn();
    renderRow(makeSession(), onSelect);
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    await screen.findByRole("dialog");
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete chat",
      }),
    );
    await act(async () => {});
    // The row is collapsing; no operation can target it anymore.
    expect(screen.queryByRole("button", { name: "Favorite" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete chat" })).toBeNull();
    // The keyboard path stays closed along with the mouse one.
    fireEvent.keyDown(screen.getByRole("button", { name: "Original title" }), {
      key: "Enter",
    });
    expect(onSelect).not.toHaveBeenCalled();

    resolveDelete(undefined);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
  });

  it("recovers the row with the error code when the delete fails", async () => {
    failCommand = "delete_session";
    renderRow(makeSession());
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    await screen.findByRole("dialog");
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete chat",
      }),
    );
    // The failed exit hands the row back intact and operable.
    expect(await screen.findByText("Database error")).toBeTruthy();
    expect(screen.getByText("Original title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Favorite" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete chat" })).toBeTruthy();
  });

  it("hides the action buttons and hover ramp while the title edit is open", async () => {
    renderRow(makeSession());
    fireEvent.doubleClick(screen.getByText("Original title"));
    await screen.findByLabelText("Title");
    expect(screen.queryByRole("button", { name: "Favorite" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete chat" })).toBeNull();
  });

  it("clears the enter marker after the enter animation duration", () => {
    vi.useFakeTimers();
    try {
      useUiStore.setState({ enteringSessionId: "s1" });
      renderRow(makeSession());
      act(() => {
        vi.advanceTimersByTime(SESSION_ROW_ANIMATION_MS);
      });
      expect(useUiStore.getState().enteringSessionId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("mounts cleanly under StrictMode double-mount", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SessionRow
          isActive={false}
          onSelect={vi.fn()}
          session={makeSession()}
        />
      </QueryClientProvider>,
      { reactStrictMode: true },
    );
    expect(screen.getByText("Original title")).toBeTruthy();
  });

  it("skips re-rendering when the parent re-renders with unchanged props", () => {
    const rowRenders = vi.fn();
    // Unchanged prop identities across a parent re-render are what the
    // React Compiler's automatic memoization keys on; this guards the
    // sidebar against row-wide re-render cascades when the list-level
    // state (selection, cache merges) changes.
    const onSelect = vi.fn();
    const session = makeSession();
    function Host() {
      return (
        <QueryClientProvider client={queryClient}>
          <Profiler id="row" onRender={rowRenders}>
            <SessionRow
              isActive={false}
              onSelect={onSelect}
              session={session}
            />
          </Profiler>
        </QueryClientProvider>
      );
    }
    const { rerender } = render(<Host />);
    // The mount itself lands two commits (the store subscription's
    // post-mount snapshot check re-renders once); a parent re-render with
    // unchanged row inputs must not add any further commit.
    const mountedRenders = rowRenders.mock.calls.length;
    expect(mountedRenders).toBeGreaterThan(0);
    rerender(<Host />);
    expect(rowRenders).toHaveBeenCalledTimes(mountedRenders);
  });

  it("re-renders only the target row when the enter marker flips", () => {
    const targetRenders = vi.fn();
    const otherRenders = vi.fn();
    function Host() {
      return (
        <QueryClientProvider client={queryClient}>
          <Profiler id="target" onRender={targetRenders}>
            <SessionRow
              isActive={false}
              onSelect={vi.fn()}
              session={makeSession()}
            />
          </Profiler>
          <Profiler id="other" onRender={otherRenders}>
            <SessionRow
              isActive={false}
              onSelect={vi.fn()}
              session={makeSession({ id: "s2", title: "Other title" })}
            />
          </Profiler>
        </QueryClientProvider>
      );
    }
    render(<Host />);
    const targetBaseline = targetRenders.mock.calls.length;
    const otherBaseline = otherRenders.mock.calls.length;
    // The store update reaches rows through their individual selectors; the
    // non-target row's selector result is unchanged, so it must not commit.
    act(() => {
      useUiStore.setState({ enteringSessionId: "s1" });
    });
    expect(targetRenders.mock.calls.length).toBeGreaterThan(targetBaseline);
    expect(otherRenders).toHaveBeenCalledTimes(otherBaseline);
  });
});
