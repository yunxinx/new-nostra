import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { SessionPage } from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";
import { isMacOs } from "@/lib/platform";
import { useUiStore } from "@/stores/ui-store";

import { App } from "./App";

vi.mock("@/features/appearance/use-theme", () => ({ useTheme: () => false }));

let queryClient: QueryClient;

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

beforeAll(initI18n);
beforeEach(() => {
  useUiStore.setState(useUiStore.getInitialState(), true);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mockWindows("main");
  mockIPC((command) => {
    if (
      command === "plugin:window|show" ||
      command === "plugin:window|set_focus"
    ) {
      return;
    }
    if (command === "list_sessions") {
      const page: SessionPage = { nextCursor: null, sessions: [] };
      return page;
    }
    throw new Error(`Unexpected IPC command: ${command}`);
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

describe("new chat", () => {
  it.each(["button", "shortcut"])(
    "discards sent messages and input through the %s",
    (entry) => {
      renderApp();

      for (let index = 0; index < 2; index += 1) {
        const message = `Message ${String(index)}`;
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: message } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(screen.getByText(message)).toBeTruthy();
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

        expect(screen.queryByText(message)).toBeNull();
        expect(screen.getByRole("textbox")).toHaveProperty("value", "");
      }
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
