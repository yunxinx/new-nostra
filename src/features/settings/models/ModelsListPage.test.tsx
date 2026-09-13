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

import type {
  Provider,
  ProviderListItem,
  Providers,
  ResolvedCompat,
} from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";
import {
  listProviderPresets,
  listProviders,
  resolveCompat,
  updateProvider,
} from "@/lib/ipc/providers";

import { ModelsListPage } from "./ModelsListPage";

vi.mock("@/lib/ipc/providers", () => ({
  listProviderPresets: vi.fn(),
  listProviders: vi.fn(),
  resolveCompat: vi.fn(),
  updateProvider: vi.fn(),
}));

const listProviderPresetsMock = vi.mocked(listProviderPresets);
const listProvidersMock = vi.mocked(listProviders);
const resolveCompatMock = vi.mocked(resolveCompat);
const updateProviderMock = vi.mocked(updateProvider);

// Radix Select measures its panel through a ResizeObserver and consults
// pointer capture while tracking the trigger; jsdom implements neither.
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
    {
      apis: ["openai-completions", "openai-responses"],
      id: "gpt-4o",
      name: "GPT-4o",
      reasoning: false,
    },
    { id: "draft-model", reasoning: false },
  ],
  name: "Gateway",
  reasoningOutput: "auto",
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 120_000,
};

const SECOND: Provider = {
  ...GATEWAY,
  id: "p2",
  models: [
    { apis: ["anthropic-messages"], id: "claude-sonnet", reasoning: true },
  ],
  name: "Second",
};

/** A switched-off provider: reachable nowhere, so absent from the catalogue. */
const OFFLINE: Provider = {
  ...SECOND,
  enabled: false,
  id: "p4",
  name: "Offline",
};

const PRICED: Provider = {
  ...GATEWAY,
  id: "p3",
  models: [
    {
      apis: ["openai-completions"],
      cost: {
        cacheRead: 0.5,
        cacheWrite: 1,
        input: 3,
        output: 15,
        tiers: [
          {
            cacheRead: 0.25,
            cacheWrite: 0.5,
            input: 1.5,
            inputTokensAbove: 128_000,
            output: 7.5,
          },
        ],
      },
      id: "priced-model",
      reasoning: false,
    },
  ],
  name: "Priced",
};

let queryClient: QueryClient;

beforeAll(() => {
  initI18n();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.setPointerCapture = () => undefined;
});
beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.resetAllMocks();
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

/**
 * Row cells of the rendered table, header row excluded. A protocol badge draws
 * the family's mark, whose own `<title>` is decoration the cell's text should
 * not be read through, so the titles come off before the text is taken.
 */
function bodyRows(): Array<Array<null | string>> {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) => {
        const content = cell.cloneNode(true) as HTMLElement;
        for (const title of content.querySelectorAll("svg title")) {
          title.remove();
        }
        return content.textContent;
      }),
    );
}

/** The group rows, one per provider with a visible model. */
function groupNames(): Array<null | string> {
  return bodyRows()
    .filter((cells) => cells.length === 1)
    .map((cells) => cells[0] ?? null);
}

/** The model rows: a group row carries one cell spanning every column. */
function modelRows(): Array<Array<null | string>> {
  return bodyRows().filter((cells) => cells.length > 1);
}

/**
 * Renders the page and waits for the provider read to land: the model-row
 * count is the settle signal, and an empty library still has the one row that
 * says so, which is not a model row.
 */
async function renderPage(
  providers: ProviderListItem[],
  models: number,
): Promise<void> {
  listProvidersMock.mockResolvedValue({ providers });
  listProviderPresetsMock.mockResolvedValue([]);
  resolveCompatMock.mockResolvedValue({ sources: {}, values: {} });
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ModelsListPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(modelRows()).toHaveLength(models);
  });
}

describe("aggregate model list", () => {
  it("clears a model's inherited switch edit after a round trip", async () => {
    await renderPage([GATEWAY], 2);
    fireEvent.click(screen.getByRole("button", { name: "Edit GPT-4o" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Compatibility" }), {
      button: 0,
    });
    const control = screen.getAllByRole("switch")[0];
    if (control === undefined) throw new Error("Missing compat switch");
    fireEvent.click(control);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      false,
    );
    fireEvent.click(control);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.queryByRole("button", { name: "Restore the saved value" }),
    ).toBeNull();
  });

  it("guards invalid model JSON and retains it while changing tabs", async () => {
    await renderPage([GATEWAY], 2);
    fireEvent.click(screen.getByRole("button", { name: "Edit GPT-4o" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Compatibility" }), {
      button: 0,
    });
    const input = screen.getByRole("textbox", { name: /priority/i });
    fireEvent.change(input, { target: { value: "oops" } });
    fireEvent.blur(input);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Identity" }), {
      button: 0,
    });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Compatibility" }), {
      button: 0,
    });
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "oops",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
  });

  it("restores only model compatibility to its inherited provider values", async () => {
    const provider: Provider = {
      ...GATEWAY,
      compat: { "openai-completions": { vllmPriority: 3 } },
      models: (GATEWAY.models ?? []).map((model) => ({
        ...model,
        compat: { "openai-completions": { vllmPriority: 7 } },
      })),
    };
    await renderPage([provider], 2);
    resolveCompatMock.mockImplementation(({ provider: draft }) =>
      Promise.resolve({
        sources: { vllmPriority: "provider" },
        values: {
          vllmPriority: draft.compat?.["openai-completions"]?.vllmPriority ?? 0,
        },
      }),
    );
    vi.mocked(updateProvider).mockImplementation(({ id, provider: draft }) =>
      Promise.resolve({ ...draft, id }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit GPT-4o" }));
    expect(
      screen.queryByRole("button", { name: "Restore inherited settings" }),
    ).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
      target: { value: "Edited model" },
    });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Compatibility" }), {
      button: 0,
    });
    const input = screen.getByRole("textbox", { name: /priority/i });
    fireEvent.change(input, { target: { value: "oops" } });
    fireEvent.blur(input);
    const priority = screen.getByRole("group", { name: /priority/i });
    expect(
      within(priority).getAllByRole("button", { name: /^Restore/ }),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    const restore = screen.getByRole("button", {
      name: "Restore inherited settings",
    });
    await waitFor(() => expect(restore).toHaveProperty("disabled", false));
    fireEvent.click(restore);
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "3",
    );
    expect(screen.queryByText("Invalid JSON")).toBeNull();
    expect(restore).toHaveProperty("disabled", true);
    expect(vi.mocked(updateProvider)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateProvider).toHaveBeenCalledTimes(1));
    const submitted = vi.mocked(updateProvider).mock.calls[0]?.[0].provider;
    expect(submitted?.compat).toEqual(provider.compat);
    expect(submitted?.models?.[0]).toEqual({
      ...GATEWAY.models?.[0],
      name: "Edited model",
    });
    expect(submitted?.models?.[1]).toEqual(provider.models?.[1]);
  });

  it("reports and retries a failed compatibility preview", async () => {
    await renderPage([GATEWAY], 2);
    resolveCompatMock.mockRejectedValue(new Error("preview failed"));
    fireEvent.click(screen.getByRole("button", { name: "Edit GPT-4o" }));
    expect(
      await screen.findByText(
        "Could not resolve compatibility settings. Check the input and retry.",
      ),
    ).toBeTruthy();
    resolveCompatMock.mockResolvedValue({ sources: {}, values: {} });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        screen.queryByText(
          "Could not resolve compatibility settings. Check the input and retry.",
        ),
      ).toBeNull(),
    );
  });

  it("groups the rows under the provider they belong to", async () => {
    await renderPage([GATEWAY, SECOND], 3);

    expect(groupNames()).toEqual(["Gateway2 models", "Second1 model"]);
  });

  it("leaves the models of a switched-off provider out", async () => {
    await renderPage([GATEWAY, OFFLINE], 2);

    // A disabled provider answers nothing, so its models are not part of the
    // catalogue: the list's question is what a request can be sent to.
    expect(groupNames()).toEqual(["Gateway2 models"]);
    expect(screen.queryByRole("button", { name: "Provider" })).toBeTruthy();
  });

  it("carries the request name under the name the model is read by", async () => {
    await renderPage([GATEWAY], 2);

    const model = modelRows()[0]?.[1] ?? "";
    expect(model).toContain("GPT-4o");
    expect(model).toContain("gpt-4o");
  });

  it("shows the protocols as badges and names the unconfigured case", async () => {
    await renderPage([GATEWAY], 2);

    const rows = modelRows();
    expect(rows[0]?.[2]).toBe("ChatRes");
    expect(rows[1]?.[2]).toBe("No protocol");
  });

  it("skips a corrupted provider instead of inventing a row for it", async () => {
    await renderPage([GATEWAY, { corrupted: true, id: "p9" }], 2);

    expect(groupNames()).toEqual(["Gateway2 models"]);
  });

  it("opens the row's editor and its card over the list", async () => {
    await renderPage([GATEWAY], 2);

    fireEvent.click(screen.getByRole("button", { name: "Edit GPT-4o" }));

    // The editor is a panel over the page, not a page of its own: the list
    // stays behind it.
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Identity" })).toBeTruthy();
  });
});

describe("aggregate model list pricing", () => {
  it("opens price details from keyboard focus and closes them with Escape", async () => {
    await renderPage([PRICED], 1);
    const trigger = screen.getByRole("button", { name: /Usage-based/ });
    expect(trigger).toHaveProperty("tabIndex", 0);
    act(() => trigger.focus());
    expect(await screen.findByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("names how a model is billed and keeps the rates on a hover", async () => {
    await renderPage([PRICED], 1);

    expect(modelRows()[0]?.[3]).toContain("Usage-based");
    // A tiered price says so on top of the usage-based badge.
    expect(modelRows()[0]?.[3]).toContain("1 tiers");
  });

  it("says when a model carries no price at all", async () => {
    await renderPage([GATEWAY], 2);

    expect(modelRows()[0]?.[3]).toBe("—");
  });
});

describe("aggregate model list filters", () => {
  it("narrows the list by the search box and counts what is left", async () => {
    await renderPage([GATEWAY, SECOND], 3);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "claude" },
    });

    expect(modelRows()).toHaveLength(1);
    expect(groupNames()).toEqual(["Second1 model"]);
    expect(screen.getAllByText("1 model").length).toBeGreaterThan(0);
  });

  it("says nothing matched rather than reading as an empty library", async () => {
    await renderPage([GATEWAY], 2);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "nothing" },
    });

    expect(screen.getByText("No matching models")).toBeTruthy();
    expect(screen.queryByText("No providers or models yet")).toBeNull();
  });

  it("distinguishes an empty library from a filtered-out list", async () => {
    await renderPage([], 0);

    expect(await screen.findByText("No providers or models yet")).toBeTruthy();
  });

  it("narrows the list to the selected providers", async () => {
    await renderPage([GATEWAY, SECOND], 3);

    fireEvent.click(screen.getByRole("button", { name: "Provider" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Second" }));

    expect(groupNames()).toEqual(["Second1 model"]);
    expect(modelRows()).toHaveLength(1);
  });
});

it("locks the row editor from the delete's write until its refresh lands", async () => {
  await renderPage([GATEWAY], 2);
  const afterDelete: Provider = {
    ...GATEWAY,
    models: (GATEWAY.models ?? []).filter(
      (model) => model.id !== "draft-model",
    ),
  };
  // The directory read the invalidation issues is held open: React Query
  // keeps the mutation pending until the onSuccess that awaits the refresh
  // completes, so this is the window where the write has landed while the
  // list still holds the pre-delete snapshot an editor would save back.
  let releaseRefresh: ((page: Providers) => void) | undefined;
  listProvidersMock.mockImplementationOnce(
    () =>
      new Promise<Providers>((resolve) => {
        releaseRefresh = resolve;
      }),
  );
  updateProviderMock.mockImplementation(({ id, provider }) =>
    Promise.resolve({ ...provider, id }),
  );

  fireEvent.click(screen.getByRole("checkbox", { name: "draft-model" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove model" }));
  await waitFor(() => expect(releaseRefresh).toBeDefined());
  expect(updateProviderMock).toHaveBeenCalledTimes(1);

  const editButton = screen.getByRole("button", { name: "Edit GPT-4o" });
  expect(editButton).toHaveProperty("disabled", true);
  fireEvent.click(editButton);
  expect(screen.queryByRole("dialog")).toBeNull();
  // The card holds a read-only view, so it stays open through the window.
  expect(
    screen.getByRole("button", { name: "View the card of GPT-4o" }),
  ).toHaveProperty("disabled", false);

  releaseRefresh?.({ providers: [afterDelete] });
  listProvidersMock.mockResolvedValue({ providers: [afterDelete] });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Edit GPT-4o" })).toHaveProperty(
      "disabled",
      false,
    ),
  );
  expect(screen.queryByRole("checkbox", { name: "draft-model" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Edit GPT-4o" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
    target: { value: "GPT-4o edited" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(updateProviderMock).toHaveBeenCalledTimes(2));

  // The saved document is the refreshed one: the removed model is gone and
  // the save does not put it back.
  const submitted = updateProviderMock.mock.calls[1]?.[0].provider;
  expect(submitted?.models?.map((model) => model.id)).toEqual(["gpt-4o"]);
});

it("keeps failed deletions selected and reports which provider failed", async () => {
  vi.mocked(updateProvider).mockImplementation(({ id, provider }) =>
    id === "p2"
      ? Promise.reject(new Error("fixture failure"))
      : Promise.resolve({ ...provider, id }),
  );
  await renderPage([GATEWAY, SECOND], 3);
  fireEvent.click(screen.getByRole("checkbox", { name: "GPT-4o" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "claude-sonnet" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove model" }));
  expect(await screen.findByText(/Could not delete: Second/)).toBeTruthy();
  expect(screen.getByRole("toolbar").textContent).toContain("1 selected");
  expect(
    screen
      .getByRole("checkbox", { name: "GPT-4o" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(
    screen
      .getByRole("checkbox", { name: "claude-sonnet" })
      .getAttribute("aria-checked"),
  ).toBe("true");
});

it("protects a floating model draft on close and can revert one field", async () => {
  await renderPage([GATEWAY], 2);
  fireEvent.click(screen.getByRole("button", { name: "Edit GPT-4o" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
    target: { value: "Unsaved" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));

  // The guard is a modal dialog, so Radix marks the panel behind it
  // `aria-hidden` and the field has to be read through that.
  const displayName = (): HTMLElement =>
    screen.getByRole("textbox", { hidden: true, name: "Display name" });
  expect(displayName()).toHaveProperty("value", "Unsaved");
  fireEvent.click(
    screen.getByRole("button", {
      hidden: true,
      name: "Restore the saved value",
    }),
  );
  expect(displayName()).toHaveProperty("value", "GPT-4o");
});

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("nonmodal model panels", () => {
  it("presents the card with its first resolved compatibility values", async () => {
    await renderPage([GATEWAY], 2);
    const resolution = deferred<ResolvedCompat>();
    resolveCompatMock.mockReturnValue(resolution.promise);
    fireEvent.click(
      screen.getByRole("button", { name: "View the card of GPT-4o" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      resolution.resolve({ sources: {}, values: { vllmPriority: 91 } });
      await resolution.promise;
    });
    const card = await screen.findByRole("dialog", { name: "GPT-4o" });
    expect(within(card).getByText("gpt-4o")).toBeTruthy();
    expect(within(card).getAllByText("91")).toHaveLength(2);
  });

  it("does not resurrect a delayed card after another model was chosen", async () => {
    await renderPage([GATEWAY], 2);
    const resolution = deferred<ResolvedCompat>();
    resolveCompatMock.mockReturnValue(resolution.promise);
    fireEvent.click(
      screen.getByRole("button", { name: "View the card of GPT-4o" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit draft-model" }));
    const editor = screen.getByRole("dialog", { name: "draft-model" });
    await act(async () => {
      resolution.resolve({ sources: {}, values: { vllmPriority: 91 } });
      await resolution.promise;
    });
    expect(screen.getAllByRole("dialog")).toEqual([editor]);
    expect(
      screen.getByRole("textbox", { name: "Display name" }),
    ).toHaveProperty("value", "");
  });

  it("retains the card and its base facts while retrying a failed first resolution", async () => {
    await renderPage([GATEWAY], 2);
    resolveCompatMock.mockRejectedValue(new Error("preview failed"));
    fireEvent.click(
      screen.getByRole("button", { name: "View the card of GPT-4o" }),
    );
    const card = await screen.findByRole("dialog", { name: "GPT-4o" });
    expect(within(card).getByRole("alert")).toBeTruthy();
    expect(within(card).getByText("gpt-4o")).toBeTruthy();
    const resolution = deferred<ResolvedCompat>();
    resolveCompatMock.mockReturnValue(resolution.promise);
    const retry = within(card).getByRole("button", { name: "Retry" });
    act(() => retry.focus());
    fireEvent.click(retry, { detail: 0 });
    expect(screen.getByRole("dialog")).toBe(card);
    expect(document.activeElement).toBe(retry);
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    const callCount = resolveCompatMock.mock.calls.length;
    fireEvent.click(retry, { detail: 0 });
    expect(resolveCompatMock.mock.calls).toHaveLength(callCount);
    await act(async () => {
      resolution.resolve({ sources: {}, values: { vllmPriority: 91 } });
      await resolution.promise;
    });
    expect(screen.getByRole("dialog")).toBe(card);
    expect(within(card).queryByRole("alert")).toBeNull();
    expect(within(card).getAllByText("91")).toHaveLength(2);
  });

  it("keeps background filters interactive and switches clean panels one at a time", async () => {
    await renderPage([GATEWAY], 2);
    fireEvent.click(screen.getByRole("button", { name: "Edit GPT-4o" }));
    const search = screen.getByRole("searchbox", { name: "Search" });
    fireEvent.pointerDown(search);
    act(() => search.focus());
    fireEvent.change(search, { target: { value: "draft" } });
    expect(screen.getByRole("dialog", { name: "GPT-4o" })).toBeTruthy();
    expect(modelRows()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Edit draft-model" }));
    await waitFor(() => {
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: "draft-model" })).toBeTruthy();
    });
    expect(
      screen.getByRole("textbox", { name: "Display name" }),
    ).toHaveProperty("value", "");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("protects a dirty draft before switching to another information card", async () => {
    await renderPage([GATEWAY], 2);
    fireEvent.click(screen.getByRole("button", { name: "Edit GPT-4o" }));
    const input = screen.getByRole("textbox", { name: "Display name" });
    fireEvent.change(input, { target: { value: "Unsaved" } });
    fireEvent.click(
      screen.getByRole("button", { name: "View the card of draft-model" }),
    );
    let notice = await screen.findByRole("alertdialog");
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(1);
    fireEvent.click(within(notice).getByRole("button", { name: "Cancel" }));
    expect(input).toHaveProperty("value", "Unsaved");
    expect(screen.getByRole("dialog", { name: "Unsaved" })).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "View the card of draft-model" }),
    );
    notice = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(notice).getByRole("button", { name: "Discard changes" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "draft-model" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("textbox", { name: "Display name" })).toBeNull();
    expect(updateProviderMock).not.toHaveBeenCalled();
  });

  it("guards background deletions before an editor can overwrite the provider document", async () => {
    await renderPage([GATEWAY], 2);
    updateProviderMock.mockImplementation(({ id, provider }) =>
      Promise.resolve({ ...provider, id }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit GPT-4o" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
      target: { value: "Unsaved" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "draft-model" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove model" }));
    let notice = await screen.findByRole("alertdialog");
    expect(updateProviderMock).not.toHaveBeenCalled();
    fireEvent.click(within(notice).getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("textbox", { name: "Display name" }),
    ).toHaveProperty("value", "Unsaved");

    fireEvent.click(screen.getByRole("button", { name: "Remove model" }));
    notice = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(notice).getByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() => expect(updateProviderMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    const written = updateProviderMock.mock.calls[0]?.[0].provider;
    expect(written?.models).toEqual([GATEWAY.models?.[0]]);
  });

  it.each(["success", "failure"])(
    "opens a queued editor after the post-save catalog read reports %s",
    async (readResult) => {
      await renderPage([GATEWAY], 2);
      let stored = GATEWAY;
      const saving = deferred<Provider>();
      if (readResult === "success") {
        listProvidersMock.mockImplementation(() =>
          Promise.resolve({ providers: [stored] }),
        );
      } else {
        listProvidersMock.mockRejectedValue({
          code: "db",
          message: "catalog read failed",
        });
      }
      updateProviderMock
        .mockImplementationOnce(() =>
          saving.promise.then((provider) => {
            stored = provider;
            return provider;
          }),
        )
        .mockImplementation(({ id, provider }) => {
          stored = { ...provider, id };
          return Promise.resolve(stored);
        });
      fireEvent.click(screen.getByRole("button", { name: "Edit GPT-4o" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
        target: { value: "Saved first model" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(updateProviderMock).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole("button", { name: "Edit draft-model" }));
      expect(
        screen.getByRole("dialog", { name: "Saved first model" }),
      ).toBeTruthy();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      await act(async () => {
        saving.resolve({
          ...GATEWAY,
          models: (GATEWAY.models ?? []).map((model) =>
            model.id === "gpt-4o"
              ? { ...model, name: "Saved first model" }
              : model,
          ),
        });
        await saving.promise;
      });
      expect(
        await screen.findByRole("dialog", { name: "draft-model" }),
      ).toBeTruthy();
      fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
        target: { value: "Saved second model" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(updateProviderMock).toHaveBeenCalledTimes(2));
      const written = updateProviderMock.mock.calls[1]?.[0].provider;
      expect(written?.models?.map((model) => model.name)).toEqual([
        "Saved first model",
        "Saved second model",
      ]);
    },
  );
});
