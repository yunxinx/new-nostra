import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

import type { SessionListData } from "@/lib/session-list-cache";
import type { AppError, Session } from "@/types/ipc";

import { initI18n } from "@/lib/i18n";
import { listSessions } from "@/lib/ipc/sessions";
import { sessionsKeys } from "@/lib/query-keys";
import { useUiStore } from "@/stores/ui-store";

import { SessionList } from "./SessionList";

vi.mock(import("@/lib/ipc/sessions"), async (importOriginal) => ({
  ...(await importOriginal()),
  listSessions: vi.fn(),
}));

const TIMESTAMP = "2026-09-09T00:00:00.000Z";
const READ_ERROR: AppError = { code: "db", message: "read failed" };
let queryClient: QueryClient;

function renderList(): void {
  render(
    <QueryClientProvider client={queryClient}>
      <SessionList />
    </QueryClientProvider>,
  );
}

function seed(pinned: boolean, rows: Session[], hasNextPage: boolean): void {
  queryClient.setQueryData<SessionListData>(sessionsKeys.list(pinned), {
    pageParams: [null],
    pages: [
      {
        nextCursor: hasNextPage
          ? { id: "boundary", updatedAt: TIMESTAMP }
          : null,
        sessions: rows,
      },
    ],
  });
}

function session(pinned: boolean): Session {
  return {
    createdAt: TIMESTAMP,
    id: pinned ? "p1" : "s1",
    pinned,
    title: pinned ? "Pinned chat" : "Standard chat",
    updatedAt: TIMESTAMP,
  };
}

beforeAll(initI18n);
beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  useUiStore.setState(useUiStore.getInitialState(), true);
  vi.mocked(listSessions).mockReset();
  vi.mocked(listSessions).mockResolvedValue({ nextCursor: null, sessions: [] });
  seed(true, [], false);
  seed(false, [], false);
});
afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe("SessionList pagination and errors", () => {
  it.each([true, false])(
    "keeps an emptied loaded stream reachable (pinned=%s)",
    async (pinned) => {
      seed(pinned, [], true);
      vi.mocked(listSessions).mockResolvedValue({
        nextCursor: null,
        sessions: [session(pinned)],
      });
      renderList();
      expect(screen.queryByText("No conversations yet")).toBeNull();
      if (pinned)
        expect(screen.getByRole("button", { name: "Favorites" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(
        await screen.findByRole("button", { name: session(pinned).title }),
      ).toBeTruthy();
      expect(listSessions).toHaveBeenCalledWith({
        cursor: { id: "boundary", updatedAt: TIMESTAMP },
        pinned,
      });
    },
  );

  it.each([true, false])(
    "preserves cached rows and offers retry after a refetch failure (pinned=%s)",
    async (pinned) => {
      seed(pinned, [session(pinned)], false);
      renderList();
      vi.mocked(listSessions).mockRejectedValue(READ_ERROR);
      await act(async () => {
        await queryClient.invalidateQueries({
          queryKey: sessionsKeys.list(pinned),
        });
      });
      expect(await screen.findByText("Database error")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: session(pinned).title }),
      ).toBeTruthy();
      vi.mocked(listSessions).mockResolvedValue({
        nextCursor: null,
        sessions: [{ ...session(pinned), title: "Fresh title" }],
      });
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(
        await screen.findByRole("button", { name: "Fresh title" }),
      ).toBeTruthy();
      await waitFor(() =>
        expect(screen.queryByText("Database error")).toBeNull(),
      );
    },
  );

  it("keeps rows and the retry entrance after next-page failure", async () => {
    seed(false, [session(false)], true);
    renderList();
    vi.mocked(listSessions).mockRejectedValue(READ_ERROR);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Database error")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Standard chat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
