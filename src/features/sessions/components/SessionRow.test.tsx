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

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
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

  it("renames through the popover with save, Enter, and trimmed titles", async () => {
    renderRow(makeSession());
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = await screen.findByLabelText("Title");
    expect(input).toHaveProperty("value", "Original title");

    fireEvent.change(input, { target: { value: "  Renamed  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {});
    expect(calls).toEqual([
      {
        command: "rename_session",
        params: { sessionId: "s1", title: "Renamed" },
      },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();

    // Enter submits the form as well.
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const nextInput = await screen.findByLabelText("Title");
    fireEvent.change(nextInput, { target: { value: "Via enter" } });
    fireEvent.keyDown(nextInput, { key: "Enter" });
    await act(async () => {});
    expect(calls.at(-1)).toEqual({
      command: "rename_session",
      params: { sessionId: "s1", title: "Via enter" },
    });
  });

  it("blocks rename submission while the title is blank", async () => {
    renderRow(makeSession());
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = await screen.findByLabelText("Title");
    const save = screen.getByRole("button", { name: "Save" });

    fireEvent.change(input, { target: { value: "   " } });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.keyDown(input, { key: "Enter" });
    await act(async () => {});
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(0);
  });

  it("does not submit rename while IME composition is confirming", async () => {
    renderRow(makeSession());
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
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
  });

  it("closes the rename popover via cancel and Escape without submitting", async () => {
    renderRow(makeSession());
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = await screen.findByLabelText("Title");
    fireEvent.change(input, { target: { value: "Edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const reopened = await screen.findByRole("dialog");
    fireEvent.keyDown(reopened, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(0);
  });

  it("keeps the rename input and shows the error when renaming fails", async () => {
    failCommand = "rename_session";
    renderRow(makeSession());
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = await screen.findByLabelText("Title");
    fireEvent.change(input, { target: { value: "Kept draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Database error")).toBeTruthy();
    expect(input).toHaveProperty("value", "Kept draft");
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveProperty(
      "disabled",
      true,
    );
  });

  it("disables the rename controls while the submission is in flight", async () => {
    let resolveRename: ResolveCommand = () => {};
    deferred = (resolve) => {
      resolveRename = resolve;
    };
    renderRow(makeSession());
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = await screen.findByLabelText("Title");
    fireEvent.change(input, { target: { value: "Pending title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // The pending state reaches React via notifyManager's setTimeout(0), so
    // it needs the real-timer wait, not just an act microtask flush.
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
        "disabled",
        true,
      );
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
      "disabled",
      true,
    );

    resolveRename(undefined);
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      calls.filter((call) => call.command === "rename_session"),
    ).toHaveLength(1);
  });

  it("deletes after confirmation and cancels without invoking", async () => {
    renderRow(makeSession());
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    await screen.findByRole("dialog");
    expect(
      screen.getByText("Delete this chat? This cannot be undone."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
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
    await act(async () => {});
    expect(calls.filter((call) => call.command === "delete_session")).toEqual([
      { command: "delete_session", params: { sessionId: "s1" } },
    ]);
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
});
