import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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

import type { Provider, UnifiedModel, UnifiedModelListItem } from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";
import {
  createUnifiedModel,
  deleteUnifiedModel,
  listProviderPresets,
  listProviders,
  listUnifiedModels,
  updateUnifiedModel,
} from "@/lib/ipc/providers";

import { UnifiedModelsPage } from "./UnifiedModelsPage";

vi.mock("@/lib/ipc/providers", () => ({
  createUnifiedModel: vi.fn(),
  deleteUnifiedModel: vi.fn(),
  listProviderPresets: vi.fn(),
  listProviders: vi.fn(),
  listUnifiedModels: vi.fn(),
  updateUnifiedModel: vi.fn(),
}));

const createUnifiedModelMock = vi.mocked(createUnifiedModel);
const deleteUnifiedModelMock = vi.mocked(deleteUnifiedModel);
const listProvidersMock = vi.mocked(listProviders);
const listUnifiedModelsMock = vi.mocked(listUnifiedModels);
const updateUnifiedModelMock = vi.mocked(updateUnifiedModel);

// Radix Switch measures its thumb through a ResizeObserver, which jsdom does
// not implement.
class StubResizeObserver implements ResizeObserver {
  target: Element | null = null;

  disconnect(): void {
    this.target = null;
  }

  observe(target: Element): void {
    this.target = target;
  }

  unobserve(): void {
    this.target = null;
  }
}

const GATEWAY: Provider = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "",
  baseUrl: "https://gateway.example",
  enabled: true,
  id: "p1",
  maxRetries: 2,
  models: [
    { apis: ["openai-completions"], id: "gpt-4o", reasoning: false },
    { apis: ["openai-completions"], id: "gpt-4o-mini", reasoning: false },
  ],
  name: "Gateway",
  reasoningOutput: "auto",
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 120_000,
};

const ANTHROPIC: Provider = {
  ...GATEWAY,
  id: "p2",
  models: [
    { apis: ["anthropic-messages"], id: "claude-sonnet", reasoning: true },
  ],
  name: "Anthropic",
};

const STORED: UnifiedModel = {
  id: "fast",
  members: [
    { model: "gpt-4o-mini", providerId: "p1" },
    { model: "claude-sonnet", providerId: "p2" },
  ],
};

let queryClient: QueryClient;
// The catalogue the mocked read serves; a write mock updates it, so a refetch
// that follows a write reflects what the database would hold.
let storedRows: UnifiedModelListItem[] = [];
/** The row a drag is over: jsdom has no hit testing of its own. */
const elementFromPoint = vi.fn<() => Element | null>(() => null);

beforeAll(() => {
  initI18n();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.setPointerCapture = () => undefined;
});
beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.resetAllMocks();
  vi.mocked(listProviderPresets).mockResolvedValue([]);
  listProvidersMock.mockResolvedValue({
    providers: [GATEWAY, ANTHROPIC],
  });
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  document.elementFromPoint = elementFromPoint;
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

/** Row cells of the rendered table, header row excluded. */
function bodyRows(): Array<Array<null | string>> {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent),
    );
}

/**
 * The candidate row a checkbox with this accessible name sits in. The box
 * swallows its own click before it reaches the row, so a test aiming at the
 * row's own target has to click the row itself.
 */
function candidateRow(name: string): HTMLTableRowElement {
  const row = screen.getByRole("checkbox", { name }).closest("tr");
  if (row === null) {
    throw new Error(`No candidate row for ${name}`);
  }
  return row;
}

/**
 * The grip of one member item of a route order: the only part of the item a
 * drag starts from. Both surfaces of the page carry buttons named after the
 * moves, so every lookup is scoped to the item it belongs to.
 */
function gripOf(item: HTMLElement): HTMLElement {
  return within(item).getByRole("button", { name: "Drag to reorder" });
}

/**
 * The ordered member rows of the editor's left pane. The table marks them for
 * the drag that reorders them, which is also how a test reads them in order.
 */
function orderedMembers(): Array<null | string> {
  return Array.from(document.querySelectorAll("[data-member-row]")).map(
    (row) => row.textContent,
  );
}

/**
 * Renders the page and waits for `settled` to appear. An empty library and a
 * library still being read both show exactly one body row, so the row count
 * cannot be the settle signal.
 */
async function renderPage(
  unified: UnifiedModelListItem[],
  settled: string,
): Promise<void> {
  storedRows = unified;
  listUnifiedModelsMock.mockImplementation(() => Promise.resolve(storedRows));
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <UnifiedModelsPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await screen.findByText(settled);
}

describe("unified model list", () => {
  it("selects rows and shows each member in attempt order", async () => {
    await renderPage([STORED], "fast");

    const row = bodyRows()[0] ?? [];
    expect(screen.getByRole("checkbox", { name: "fast" })).toBeTruthy();
    expect(row[1]).toContain("fast");
    // Order number, model, and the provider it belongs to as a badge.
    expect(row[2]).toBe("1gpt-4o-miniGateway2claude-sonnetAnthropic");
  });

  it("says the aggregate has no members rather than leaving the cell blank", async () => {
    await renderPage([{ id: "empty", members: [] }], "empty");

    expect(bodyRows()[0]?.[2]).toBe("No members yet");
  });

  it("fills the route order down one column before starting the next", async () => {
    const six = Array.from({ length: 6 }, (_, index) => ({
      model: `m${String(index)}`,
      providerId: "p1",
    }));
    await renderPage(
      [
        { id: "six", members: six },
        { id: "two", members: STORED.members ?? [] },
      ],
      "six",
    );

    const orderList = (id: string) =>
      screen.getByText(id).closest("tr")?.querySelector("ol");
    // Six members are a block to skim: two columns, each read to its end, so
    // the first three run down the left one.
    expect(orderList("six")?.className).toContain("grid-flow-col");
    expect(orderList("six")?.getAttribute("style")).toBe(
      "grid-template-rows: repeat(3, auto);",
    );
    // Two members stay a single column, read top to bottom anyway.
    expect(orderList("two")?.className).not.toContain("grid-flow-col");
  });

  it("ignores a drag that ends over another aggregate's order", async () => {
    await renderPage(
      [
        STORED,
        { id: "other", members: [{ model: "gpt-4o", providerId: "p1" }] },
      ],
      "fast",
    );
    const items = Array.from(
      document.querySelectorAll<HTMLElement>("[data-route-index]"),
    );
    // The first two items belong to the first aggregate, the third to the next
    // one: its position means nothing to the list the drag started in.
    elementFromPoint.mockReturnValue(items[2] ?? null);
    const drag = gripOf(items[0] ?? document.body);
    fireEvent.pointerDown(drag, { button: 0, pointerId: 7 });
    fireEvent.pointerMove(drag, { clientX: 20, clientY: 20, pointerId: 7 });

    // The drag is running — the item it started on is dimmed — and it still
    // stores nothing.
    expect(items[0]?.className).toContain("opacity-60");
    fireEvent.pointerUp(drag, { pointerId: 7 });

    expect(updateUnifiedModelMock).not.toHaveBeenCalled();
  });

  it("draws the line a dragged member would land on", async () => {
    await renderPage([STORED], "fast");
    const items = Array.from(
      document.querySelectorAll<HTMLElement>("[data-route-index]"),
    );
    const [first, second] = items;
    const drag = gripOf(first ?? document.body);

    // The drag runs from the first member down onto the second.
    elementFromPoint.mockReturnValue(second ?? null);
    fireEvent.pointerDown(drag, { button: 0, pointerId: 7 });
    fireEvent.pointerMove(drag, { clientX: 20, clientY: 20, pointerId: 7 });

    // The dragged member travels down, so it lands after the one it is over:
    // the line is drawn on that member's lower edge, and the member itself is
    // dimmed to show which one is moving.
    expect(second?.className).toContain("inset_0_-2px_0_0_var(--primary)");
    expect(first?.className).toContain("opacity-60");

    fireEvent.pointerUp(drag, { pointerId: 7 });
    expect(second?.className).not.toContain("inset_0_");
  });

  it("ends the drag when another element takes the pointer's capture", async () => {
    await renderPage([STORED], "fast");
    const items = Array.from(
      document.querySelectorAll<HTMLElement>("[data-route-index]"),
    );
    const [first, second] = items;
    const drag = gripOf(first ?? document.body);

    elementFromPoint.mockReturnValue(second ?? null);
    fireEvent.pointerDown(drag, { button: 0, pointerId: 7 });
    fireEvent.pointerMove(drag, { clientX: 20, clientY: 20, pointerId: 7 });
    expect(second?.className).toContain("inset_0_-2px_0_0_var(--primary)");

    // A capture the drag did not give up itself — another element claiming the
    // same pointer's capture, the loss no `pointercancel` announces — ends the
    // drag as a release would. The event still arrives only because the handle
    // is mounted: React listens at the root container, and a handle detached
    // mid-drag gets the loss fired on the node that left the document, where
    // no listener of the page can hear it.
    fireEvent.lostPointerCapture(drag, { pointerId: 7 });

    expect(second?.className).not.toContain("inset_0_");
    expect(first?.className).not.toContain("opacity-60");
    fireEvent.pointerUp(drag, { pointerId: 7 });
    expect(updateUnifiedModelMock).not.toHaveBeenCalled();
  });

  it("shows no landing line for a point that is over another aggregate", async () => {
    await renderPage(
      [
        STORED,
        { id: "other", members: [{ model: "gpt-4o", providerId: "p1" }] },
      ],
      "fast",
    );
    const items = Array.from(
      document.querySelectorAll<HTMLElement>("[data-route-index]"),
    );
    const [first, , other] = items;
    const drag = gripOf(first ?? document.body);

    elementFromPoint.mockReturnValue(other ?? null);
    fireEvent.pointerDown(drag, { button: 0, pointerId: 7 });
    fireEvent.pointerMove(drag, { clientX: 20, clientY: 20, pointerId: 7 });

    // A position means nothing across two lists, so the aggregate the drag
    // wandered into shows nothing — and neither does the one it left, running
    // all the while.
    expect(first?.className).toContain("opacity-60");
    expect(other?.className).not.toContain("inset_0_");
    expect(first?.className).not.toContain("inset_0_");
    fireEvent.pointerUp(drag, { pointerId: 7 });
    expect(updateUnifiedModelMock).not.toHaveBeenCalled();
  });

  it("stores the order a member is dropped into", async () => {
    updateUnifiedModelMock.mockImplementation(({ id, unified }) => {
      storedRows = storedRows.map((item) =>
        !("corrupted" in item) && item.id === id ? unified : item,
      );
      return Promise.resolve(unified);
    });
    await renderPage([STORED], "fast");
    const items = Array.from(
      document.querySelectorAll<HTMLElement>("[data-route-index]"),
    );
    const [first, second] = items;
    const drag = gripOf(first ?? document.body);

    // The drag starts on the first member and ends over the second.
    elementFromPoint.mockReturnValue(second ?? null);
    fireEvent.pointerDown(drag, { button: 0, pointerId: 7 });
    fireEvent.pointerMove(drag, { clientX: 20, clientY: 20, pointerId: 7 });
    fireEvent.pointerUp(drag, { pointerId: 7 });

    await waitFor(() =>
      expect(updateUnifiedModelMock).toHaveBeenCalledTimes(1),
    );
    expect(updateUnifiedModelMock.mock.calls[0]?.[0]).toEqual({
      id: "fast",
      unified: {
        id: "fast",
        members: [
          { model: "claude-sonnet", providerId: "p2" },
          { model: "gpt-4o-mini", providerId: "p1" },
        ],
      },
    });
    // The stored order is what the row shows, without waiting for a re-read.
    await waitFor(() => {
      expect(bodyRows()[0]?.[2]).toBe(
        "1claude-sonnetAnthropic2gpt-4o-miniGateway",
      );
    });
  });

  it("reorders members from the keyboard through the row's move buttons", async () => {
    updateUnifiedModelMock.mockImplementation(({ id, unified }) => {
      storedRows = storedRows.map((item) =>
        !("corrupted" in item) && item.id === id ? unified : item,
      );
      return Promise.resolve(unified);
    });
    await renderPage([STORED], "fast");
    const items = () =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-route-index]"));
    const moveButton = (item: HTMLElement | undefined, name: string) =>
      within(item ?? document.body).getByRole("button", { name });

    // The ends are where the moves run out: nothing above the first item,
    // nothing below the last.
    expect(moveButton(items()[0], "Move member up")).toHaveProperty(
      "disabled",
      true,
    );
    expect(moveButton(items()[1], "Move member down")).toHaveProperty(
      "disabled",
      true,
    );
    expect(moveButton(items()[0], "Move member down")).toHaveProperty(
      "disabled",
      false,
    );

    fireEvent.click(moveButton(items()[0], "Move member down"));

    await waitFor(() =>
      expect(updateUnifiedModelMock).toHaveBeenCalledTimes(1),
    );
    // The button writes the very order a drop writes: the whole member list,
    // in the order it now stands in.
    expect(updateUnifiedModelMock.mock.calls[0]?.[0]).toEqual({
      id: "fast",
      unified: {
        id: "fast",
        members: [
          { model: "claude-sonnet", providerId: "p2" },
          { model: "gpt-4o-mini", providerId: "p1" },
        ],
      },
    });
    await waitFor(() => {
      expect(bodyRows()[0]?.[2]).toBe(
        "1claude-sonnetAnthropic2gpt-4o-miniGateway",
      );
    });

    // The other direction walks the order back.
    fireEvent.click(moveButton(items()[1], "Move member up"));

    await waitFor(() =>
      expect(updateUnifiedModelMock).toHaveBeenCalledTimes(2),
    );
    expect(updateUnifiedModelMock.mock.calls[1]?.[0]).toEqual({
      id: "fast",
      unified: {
        id: "fast",
        members: [
          { model: "gpt-4o-mini", providerId: "p1" },
          { model: "claude-sonnet", providerId: "p2" },
        ],
      },
    });
    await waitFor(() => {
      expect(bodyRows()[0]?.[2]).toBe(
        "1gpt-4o-miniGateway2claude-sonnetAnthropic",
      );
    });
  });

  it("leaves the pointer drag on the grip so the item still scrolls", async () => {
    await renderPage([STORED], "fast");
    const items = Array.from(
      document.querySelectorAll<HTMLElement>("[data-route-index]"),
    );
    const item = items[0] ?? document.body;
    const grip = gripOf(item);

    // The grip alone holds the pointer: the item and the text in it keep the
    // touch scrolling that a `touch-none` stretch of the row would take away.
    expect(grip.className).toContain("touch-none");
    expect(grip.className).toContain("cursor-grab");
    expect(item.className).not.toContain("touch-none");
    expect(within(item).getByText("gpt-4o-mini").className).not.toContain(
      "touch-none",
    );
  });

  it("offers only a delete on a corrupted aggregate", async () => {
    await renderPage(
      [{ corrupted: true, id: "broken" }],
      "Corrupted unified model",
    );

    expect(screen.getByText("Corrupted unified model")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Edit unified model" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Delete unified model" }),
    ).toBeTruthy();
  });

  it("deletes an aggregate through the confirmation", async () => {
    deleteUnifiedModelMock.mockResolvedValue();
    await renderPage([STORED], "fast");

    fireEvent.click(
      screen.getByRole("button", { name: "Delete unified model" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteUnifiedModelMock).toHaveBeenCalledWith(
        { id: "fast" },
        expect.anything(),
      );
    });
  });

  it("says the library is empty instead of showing an empty table", async () => {
    await renderPage([], "No unified models yet");

    expect(screen.getByText("No unified models yet")).toBeTruthy();
  });
});

describe("unified model editor", () => {
  it("creates an aggregate from the members picked in the right pane", async () => {
    createUnifiedModelMock.mockImplementation(({ unified }) =>
      Promise.resolve(unified),
    );
    await renderPage([], "No unified models yet");

    fireEvent.click(screen.getByRole("button", { name: "New unified model" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "fast" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Gateway · gpt-4o-mini" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Anthropic · claude-sonnet" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createUnifiedModelMock).toHaveBeenCalledTimes(1);
    });
    expect(createUnifiedModelMock).toHaveBeenCalledWith(
      {
        unified: {
          id: "fast",
          members: [
            { model: "gpt-4o-mini", providerId: "p1" },
            { model: "claude-sonnet", providerId: "p2" },
          ],
        },
      },
      expect.anything(),
    );
  });

  it("picks in one pane and arranges the order in the other", async () => {
    await renderPage([], "No unified models yet");
    fireEvent.click(screen.getByRole("button", { name: "New unified model" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Gateway · gpt-4o" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Anthropic · claude-sonnet" }),
    );
    expect(orderedMembers()[0]).toContain("gpt-4oGateway");

    fireEvent.click(
      screen.getAllByRole("button", { name: "Move member up" })[1] ??
        document.body,
    );

    expect(orderedMembers()[0]).toContain("claude-sonnetAnthropic");
    expect(orderedMembers()[1]).toContain("gpt-4oGateway");
  });

  it("unchecking a candidate removes it from the order", async () => {
    await renderPage([], "No unified models yet");
    fireEvent.click(screen.getByRole("button", { name: "New unified model" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Gateway · gpt-4o" }));
    expect(orderedMembers()).toHaveLength(1);

    fireEvent.click(screen.getByRole("checkbox", { name: "Gateway · gpt-4o" }));

    expect(screen.getByText("No members yet")).toBeTruthy();
  });

  it("narrows the candidate pane without touching the order", async () => {
    await renderPage([], "No unified models yet");
    fireEvent.click(screen.getByRole("button", { name: "New unified model" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Gateway · gpt-4o" }));

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search candidates" }),
      { target: { value: "claude" } },
    );

    // One candidate left, plus the header's add-all box.
    expect(screen.getAllByRole("checkbox", { name: /Anthropic/ })).toHaveLength(
      1,
    );
    expect(orderedMembers()).toHaveLength(1);
  });

  it("refuses a blank name and an empty member list before writing", async () => {
    await renderPage([], "No unified models yet");
    fireEvent.click(screen.getByRole("button", { name: "New unified model" }));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getAllByText("Invalid input").length).toBeGreaterThan(0);
    expect(createUnifiedModelMock).not.toHaveBeenCalled();
  });

  it("prefills a stored aggregate and submits it under its own id", async () => {
    updateUnifiedModelMock.mockImplementation(({ unified }) =>
      Promise.resolve(unified),
    );
    await renderPage([STORED], "fast");

    fireEvent.click(screen.getByRole("button", { name: "Edit unified model" }));

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveProperty(
      "value",
      "fast",
    );
    expect(orderedMembers()).toHaveLength(2);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateUnifiedModelMock).toHaveBeenCalledTimes(1);
    });
    expect(updateUnifiedModelMock).toHaveBeenCalledWith(
      { id: "fast", unified: { ...STORED, id: "renamed" } },
      expect.anything(),
    );
  });

  it("restores the stored draft when the editor is reset", async () => {
    await renderPage([STORED], "fast");
    fireEvent.click(screen.getByRole("button", { name: "Edit unified model" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "edited" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveProperty(
      "value",
      "fast",
    );
  });

  it("returns to the list without writing anything", async () => {
    await renderPage([STORED], "fast");
    fireEvent.click(screen.getByRole("button", { name: "Edit unified model" }));

    fireEvent.click(screen.getByRole("button", { name: "Unified models" }));

    expect(
      screen.getByRole("button", { name: "New unified model" }),
    ).toBeTruthy();
    expect(updateUnifiedModelMock).not.toHaveBeenCalled();
  });

  it("freezes the candidate rows while a save is in flight", async () => {
    let refuseSave: () => void = () => undefined;
    const pending = new Promise<UnifiedModel>((_resolve, reject) => {
      refuseSave = () =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the command rejects with the serialized AppError; falls away when the mock signature types its rejections.
        reject({ code: "network", message: "offline" });
    });
    updateUnifiedModelMock.mockReturnValue(pending);
    await renderPage([STORED], "fast");
    fireEvent.click(screen.getByRole("button", { name: "Edit unified model" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(updateUnifiedModelMock).toHaveBeenCalledTimes(1);
    });

    const row = candidateRow("Gateway · gpt-4o");
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.className).toContain("hover:bg-transparent");
    expect(row.className).not.toContain("cursor-pointer");
    // The checkbox rides on the fieldset's own disabled state: the row guard
    // covers what the fieldset cannot reach.
    expect(row.closest("fieldset")).toHaveProperty("disabled", true);
    fireEvent.click(row);
    // A click that cannot reach the draft moves neither the order on screen
    // nor the members the save already captured.
    expect(orderedMembers()).toHaveLength(2);
    expect(updateUnifiedModelMock).toHaveBeenCalledWith(
      {
        id: "fast",
        unified: {
          id: "renamed",
          members: [
            { model: "gpt-4o-mini", providerId: "p1" },
            { model: "claude-sonnet", providerId: "p2" },
          ],
        },
      },
      expect.anything(),
    );

    await act(async () => {
      refuseSave();
      await pending.catch(() => undefined);
    });
    await screen.findByText("Network error");
    await waitFor(() => {
      expect(row.getAttribute("aria-disabled")).toBeNull();
    });
    expect(row.className).toContain("cursor-pointer");

    fireEvent.click(row);
    expect(orderedMembers()).toHaveLength(3);
    expect(orderedMembers()[2]).toContain("gpt-4oGateway");
  });
});

it("finds a candidate by id when it also has a display name", async () => {
  listProvidersMock.mockResolvedValue({
    providers: [
      {
        ...GATEWAY,
        models: [{ id: "request-id", name: "Friendly", reasoning: false }],
      },
    ],
  });
  await renderPage([], "No unified models yet");
  fireEvent.click(screen.getByRole("button", { name: "New unified model" }));
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search candidates" }),
    { target: { value: "request-id" } },
  );
  expect(
    screen.getByRole("checkbox", { name: "Gateway · request-id" }),
  ).toBeTruthy();
  // The two columns part: the name a reader chose, then the name the request
  // goes out under.
  const cells = Array.from(
    screen.getAllByRole("row").at(-1)?.querySelectorAll("td") ?? [],
  );
  expect(cells[1]?.textContent).toBe("Friendly");
  expect(cells[2]?.textContent).toBe("request-id");
});

it("keeps a changed draft until leaving is confirmed", async () => {
  await renderPage([STORED], "fast");
  fireEvent.click(screen.getByRole("button", { name: "Edit unified model" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "unsaved" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Unified models" }));
  // The guard is a modal dialog, so Radix marks the page behind it
  // `aria-hidden` and the field has to be read through that.
  expect(
    screen.getByRole("textbox", { hidden: true, name: "Name" }),
  ).toHaveProperty("value", "unsaved");
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(
    screen.getByRole("button", { name: "New unified model" }),
  ).toBeTruthy();
});
