import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import {
  act,
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

import type { Entry, PathPage } from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";
import { type MessageWindow } from "@/lib/message-window";
import { messagesKeys } from "@/lib/query-keys";
import { useUiStore } from "@/stores/ui-store";

import { MessageList } from "./MessageList";

// jsdom has no layout: this suite drives a virtual layout model. Entry
// elements carry data-entry-id; the patched getBoundingClientRect maps each
// id to a content-space offset shifted by the virtual scrollTop, so the
// component's anchor measurement and compensation run against real numbers.

const ENTRY_HEIGHT = 100;
const SESSION_ID = "s1";
const VIEWPORT_HEIGHT = 200;

class TestResizeObserver implements ResizeObserver {
  static instances: TestResizeObserver[] = [];

  readonly callback: ResizeObserverCallback;
  target: Element | null = null;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    TestResizeObserver.instances.push(this);
  }

  disconnect(): void {
    this.target = null;
  }

  observe(target: Element): void {
    this.target = target;
  }

  resize(height: number): void {
    if (!this.target) {
      throw new Error("ResizeObserver has no target");
    }
    Object.defineProperty(this.target, "offsetHeight", {
      configurable: true,
      value: height,
    });
    this.callback([], this);
  }

  unobserve(): void {
    this.target = null;
  }
}

let queryClient: QueryClient;
let virtualScrollTop: number;
// entry id -> content-space top offset.
let layout: Record<string, number>;
let contentHeightPadding: number;
let failTailRead: boolean;
let rectSpy: ReturnType<typeof spyRect>;

function attachScrollModel(container: HTMLElement): void {
  Object.defineProperties(container, {
    clientHeight: { configurable: true, value: VIEWPORT_HEIGHT },
    scrollHeight: { configurable: true, get: () => contentHeight() },
    scrollTop: {
      configurable: true,
      get: () => virtualScrollTop,
      set: (value: number) => {
        virtualScrollTop = Math.max(
          0,
          Math.min(value, contentHeight() - VIEWPORT_HEIGHT),
        );
      },
    },
  });
}

function buildEntries(count: number, prefix = "e"): Entry[] {
  return Array.from({ length: count }, (_, index) =>
    entry(
      `${prefix}${String(index)}`,
      index === 0 ? null : `${prefix}${String(index - 1)}`,
    ),
  );
}

function contentHeight(): number {
  const tallest = Object.values(layout).reduce(
    (max, top) => Math.max(max, top),
    0,
  );
  return tallest + ENTRY_HEIGHT + contentHeightPadding;
}

function entry(id: string, parentId: null | string): Entry {
  return {
    content: [{ text: `m${id}`, type: "text" }],
    createdAt: "2026-09-09T00:00:00.000Z",
    id,
    parentId,
    role: "user",
    type: "message",
  };
}

function page(entries: Entry[]): PathPage {
  return { entries, nextCursor: null, prevCursor: null };
}

function renderMessageList(sessionId: null | string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MessageList
          composerKey={sessionId ?? "draft:1"}
          hasSessions
          onSend={() => undefined}
          sessionId={sessionId}
        />
      </TooltipProvider>
    </QueryClientProvider>,
    { reactStrictMode: true },
  );
}

async function scrollContainer(): Promise<HTMLElement> {
  const firstRow = await screen.findByText("me5");
  const container = firstRow.closest(".overflow-y-auto");
  if (!(container instanceof HTMLElement)) {
    throw new Error("scroll container missing");
  }
  attachScrollModel(container);
  return container;
}

function setTailWindow(entries: Entry[]): void {
  queryClient.setQueryData<MessageWindow>(messagesKeys.bySession(SESSION_ID), {
    pageParams: [{ kind: "tail" }],
    pages: [page(entries)],
  });
}

function setVirtualScroll(top: number, container: HTMLElement): void {
  container.scrollTop = top;
  fireEvent.scroll(container);
}

function spyRect() {
  return vi
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element): DOMRect {
      const id = this.getAttribute("data-entry-id");
      const top =
        id !== null ? (layout[id] ?? 0) - virtualScrollTop : -virtualScrollTop;
      return {
        bottom: top + ENTRY_HEIGHT,
        height: ENTRY_HEIGHT,
        left: 0,
        right: 0,
        toJSON: () => ({}),
        top,
        width: 0,
        x: 0,
        y: 0,
      };
    });
}

beforeAll(initI18n);
beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  useUiStore.setState(useUiStore.getInitialState(), true);
  virtualScrollTop = 0;
  layout = {};
  contentHeightPadding = 0;
  failTailRead = false;
  TestResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  rectSpy = spyRect();
  mockIPC((command) => {
    if (command === "load_active_path") {
      if (failTailRead) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- mockIPC rejects with the AppError JSON shape the Rust boundary produces; undo when the mocks module types its rejections.
        throw { code: "db", message: "read failed" };
      }
      return page(buildEntries(10));
    }
    throw new Error(`Unexpected IPC command: ${command}`);
  });
});

afterEach(() => {
  cleanup();
  rectSpy.mockRestore();
  vi.unstubAllGlobals();
  queryClient.clear();
  clearMocks();
});

describe("MessageList scroll anchoring", () => {
  it("compensates a prepend by the visible entry's remaining displacement", async () => {
    const entries = buildEntries(10);
    for (const node of entries) {
      layout[node.id] = Number(node.id.slice(1)) * ENTRY_HEIGHT;
    }
    setTailWindow(entries);
    renderMessageList(SESSION_ID);
    const container = await scrollContainer();

    // 1000 content, 200 viewport: 600 leaves 200px below the fold.
    setVirtualScroll(600, container);

    // Prepend five older entries; everything shifts down by 500.
    const older = buildEntries(5, "p");
    for (const node of entries) {
      layout[node.id] = Number(node.id.slice(1)) * ENTRY_HEIGHT + 500;
    }
    for (const node of older) {
      layout[node.id] = Number(node.id.slice(1)) * ENTRY_HEIGHT;
    }
    act(() => {
      queryClient.setQueryData<MessageWindow>(
        messagesKeys.bySession(SESSION_ID),
        {
          pageParams: [{ kind: "tail" }, { cursor: "e0", kind: "before" }],
          pages: [page(entries), page(older)],
        },
      );
    });
    // Observer notifications flush on a macrotask, so the compensation lands
    // within waitFor rather than synchronously after setQueryData.
    await waitFor(() => {
      expect(screen.getByText("mp0")).toBeTruthy();
    });

    // e6 was the top visible entry; it must stay at the same viewport spot.
    expect(virtualScrollTop).toBe(1100);
  });

  it("follows the bottom when new content lands while near it", async () => {
    const entries = buildEntries(10);
    for (const node of entries) {
      layout[node.id] = Number(node.id.slice(1)) * ENTRY_HEIGHT;
    }
    setTailWindow(entries);
    renderMessageList(SESSION_ID);
    const container = await scrollContainer();

    // Start glued to the bottom (1000 - 200).
    setVirtualScroll(800, container);

    const appended = entry("a0", "e9");
    layout[appended.id] = 10 * ENTRY_HEIGHT;
    act(() => {
      queryClient.setQueryData<MessageWindow>(
        messagesKeys.bySession(SESSION_ID),
        {
          pageParams: [{ kind: "tail" }],
          pages: [page([...entries, appended])],
        },
      );
    });
    await waitFor(() => {
      expect(screen.getByText("ma0")).toBeTruthy();
    });

    expect(virtualScrollTop).toBe(900);
  });

  it("shows the jump button after scrolling away and returns to the bottom", async () => {
    const entries = buildEntries(10);
    for (const node of entries) {
      layout[node.id] = Number(node.id.slice(1)) * ENTRY_HEIGHT;
    }
    setTailWindow(entries);
    renderMessageList(SESSION_ID);
    const container = await scrollContainer();

    expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();
    setVirtualScroll(600, container);
    const jump = screen.getByRole("button", { name: "Jump to latest" });
    fireEvent.click(jump);
    expect(virtualScrollTop).toBe(800);
  });
});

describe("MessageList read failure", () => {
  it("shows a read error with a retry that recovers the messages", async () => {
    failTailRead = true;
    renderMessageList(SESSION_ID);
    expect(await screen.findByText("Database error")).toBeTruthy();
    // The write-free read failure surfaces a retry, not an empty library.
    expect(screen.queryByText("How can I help you today?")).toBeNull();

    failTailRead = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(screen.getByText("me5")).toBeTruthy();
    });
    expect(screen.queryByText("Database error")).toBeNull();
  });
});

describe("MessageList composer resize", () => {
  it("preserves scroll intent when the composer height changes", () => {
    const { container: root, unmount } = renderMessageList(null);
    const input = screen.getByRole("textbox");
    const scroll = root.querySelector(".overflow-y-auto");
    if (!(scroll instanceof HTMLElement)) {
      throw new Error("Message list scroll region missing");
    }
    const observer = TestResizeObserver.instances.find((instance) =>
      instance.target?.contains(input),
    );
    if (!observer) {
      throw new Error("composer observer missing");
    }

    // Draft pane content is empty; model 1200px of scrollable space.
    contentHeightPadding = 1200 - ENTRY_HEIGHT;
    attachScrollModel(scroll);
    act(() => observer.resize(92));
    // Reading history: 1200 - 120 - 200 = 880 from the bottom.
    setVirtualScroll(120, scroll);

    contentHeightPadding += 128;
    act(() => observer.resize(220));

    expect(virtualScrollTop).toBe(120);
    unmount();
    expect(
      TestResizeObserver.instances.every(
        (instance) => instance.target === null,
      ),
    ).toBe(true);
  });
});
