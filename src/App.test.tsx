import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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

import type {
  ContentBlock,
  CreatedSession,
  Entry,
  Session,
  SessionPage,
} from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";
import { isMacOs } from "@/lib/platform";
import { useUiStore } from "@/stores/ui-store";

import { App } from "./App";

vi.mock("@/features/appearance/use-theme", () => ({ useTheme: () => false }));

const NOW = "2026-09-09T00:00:00.000Z";
// Long enough that the derived 50-code-point title differs from the body.
const FIRST_MESSAGE = `seed-${"x".repeat(80)}`;
const FIRST_TITLE = FIRST_MESSAGE.slice(0, 50);

let queryClient: QueryClient;
let sessions: Session[];
let sessionEntries: Entry[];
let createCalls: number;
let appendCalls: number;
let loadPathCalls: number;

function renderApp(): void {
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </QueryClientProvider>,
    { reactStrictMode: true },
  );
}

async function submitComposer(text: string): Promise<void> {
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { isComposing: false, key: "Enter" });
  await waitFor(() => {
    expect(screen.getByRole("textbox")).toHaveProperty("value", "");
  });
}

beforeAll(initI18n);
beforeEach(() => {
  useUiStore.setState(useUiStore.getInitialState(), true);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  sessions = [];
  sessionEntries = [];
  createCalls = 0;
  appendCalls = 0;
  loadPathCalls = 0;
  mockWindows("main");
  mockIPC((command, payload) => {
    if (
      command === "plugin:window|show" ||
      command === "plugin:window|set_focus"
    ) {
      return;
    }
    switch (command) {
      case "append_message": {
        const { params } = payload as {
          params: { content: ContentBlock[]; sessionId: string };
        };
        appendCalls += 1;
        const appended: Entry = {
          content: params.content,
          createdAt: NOW,
          id: `e-appended-${String(appendCalls)}`,
          parentId: sessionEntries.at(-1)?.id ?? null,
          role: "user",
          type: "message",
        };
        sessionEntries.push(appended);
        return appended;
      }
      case "create_session": {
        const { params } = payload as {
          params: { content: ContentBlock[]; title: string };
        };
        createCalls += 1;
        const session: Session = {
          createdAt: NOW,
          id: "s-created",
          pinned: false,
          title: params.title,
          updatedAt: NOW,
        };
        const entry: Entry = {
          content: params.content,
          createdAt: NOW,
          id: "e-first",
          parentId: null,
          role: "user",
          type: "message",
        };
        sessions.push(session);
        sessionEntries.push(entry);
        const created: CreatedSession = { entry, session };
        return created;
      }
      case "list_sessions": {
        const { params } = payload as {
          params: { pinned: boolean };
        };
        const rows = sessions.filter(
          (session) => session.pinned === params.pinned,
        );
        return { nextCursor: null, sessions: rows } satisfies SessionPage;
      }
      case "load_active_path":
        loadPathCalls += 1;
        return {
          entries: sessionEntries,
          nextCursor: null,
          prevCursor: null,
        };
      default:
        throw new Error(`Unexpected IPC command: ${command}`);
    }
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  clearMocks();
  vi.unstubAllGlobals();
});

describe("send round trip", () => {
  it("persists the first send, then appends into the opened session", async () => {
    renderApp();

    await submitComposer(FIRST_MESSAGE);
    // The DB-committed message renders; the draft cleared after confirmation.
    expect(screen.getAllByText(FIRST_MESSAGE).length).toBeGreaterThan(0);
    expect(createCalls).toBe(1);

    await submitComposer("Second message");
    expect(appendCalls).toBe(1);
    await waitFor(() => {
      expect(screen.getByText("Second message")).toBeTruthy();
    });
  });

  it("restores a session's messages from the cache when switching back", async () => {
    renderApp();
    await submitComposer(FIRST_MESSAGE);
    const cacheReadsAfterCreate = loadPathCalls;

    // New chat: the draft view replaces the session; messages cache stays.
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.queryByText(FIRST_MESSAGE)).toBeNull();
    expect(screen.getByRole("textbox")).toHaveProperty("value", "");

    // The created session's row carries the derived title.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: FIRST_TITLE })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: FIRST_TITLE }));
    await waitFor(() => {
      expect(screen.getByText(FIRST_MESSAGE)).toBeTruthy();
    });
    // Re-entry served the retained cache; no fresh tail read was needed.
    expect(loadPathCalls).toBe(cacheReadsAfterCreate);
  });
});

describe("new chat", () => {
  it.each(["button", "shortcut"])(
    "discards the draft input through the %s",
    (entry) => {
      renderApp();

      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "Unsent draft" } });

      if (entry === "button") {
        fireEvent.click(screen.getByRole("button", { name: "New chat" }));
      } else {
        fireEvent.keyDown(window, {
          ctrlKey: !isMacOs(),
          key: "n",
          metaKey: isMacOs(),
        });
      }

      expect(screen.getByRole("textbox")).toHaveProperty("value", "");
    },
  );
});

describe("empty library", () => {
  it("shows the no-sessions empty state once both list streams settle empty", async () => {
    renderApp();
    // A loading list must never read as an empty library, so the new-chat
    // state shows until the empty pages actually arrive.
    expect(screen.getByText("How can I help you today?")).toBeTruthy();
    expect(await screen.findByText("No conversation open")).toBeTruthy();
  });
});
