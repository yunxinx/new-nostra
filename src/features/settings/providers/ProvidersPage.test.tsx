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
  AppError,
  CorruptedProvider,
  Provider,
  ProviderListItem,
  ProviderPreset,
  ResolvedCompat,
} from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";
import {
  createProvider,
  deleteProvider,
  listProviderPresets,
  listProviders,
  resolveCompat,
  updateProvider,
} from "@/lib/ipc/providers";

import { ProvidersPage } from "./ProvidersPage";

// Only the IPC boundary is mocked; the hooks, the query kernel and the form
// run for real, so prefill, save payloads and post-save state are validated
// against actual behaviour rather than against the page's own wiring.
vi.mock("@/lib/ipc/providers", () => ({
  createProvider: vi.fn(),
  createUnifiedModel: vi.fn(),
  deleteProvider: vi.fn(),
  deleteUnifiedModel: vi.fn(),
  listProviderPresets: vi.fn(),
  listProviders: vi.fn(),
  listUnifiedModels: vi.fn(),
  resolveCompat: vi.fn(),
  updateProvider: vi.fn(),
  updateUnifiedModel: vi.fn(),
}));

const createProviderMock = vi.mocked(createProvider);
const deleteProviderMock = vi.mocked(deleteProvider);
const listProviderPresetsMock = vi.mocked(listProviderPresets);
const listProvidersMock = vi.mocked(listProviders);
const resolveCompatMock = vi.mocked(resolveCompat);
const updateProviderMock = vi.mocked(updateProvider);

const STORED: Provider = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "sk-secret",
  baseUrl: "https://gateway.example/v1",
  compat: { "openai-completions": { supportsStore: false } },
  enabled: true,
  headers: { "x-extra": "1" },
  id: "p1",
  maxRetries: 2,
  models: [
    {
      apis: ["openai-completions"],
      id: "m1",
      reasoning: true,
    },
  ],
  name: "Gateway",
  reasoningOutput: "auto",
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 120_000,
};

const OTHER: Provider = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "sk-other",
  baseUrl: "https://other.example",
  enabled: false,
  id: "p2",
  maxRetries: 2,
  name: "Second",
  reasoningOutput: "auto",
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 120_000,
};

const CORRUPTED: CorruptedProvider = { corrupted: true, id: "p3" };

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

let queryClient: QueryClient;
// The list the mocked read serves; write mocks mutate it so a refetch after
// the write reflects what the database would hold.
let rows: ProviderListItem[];

beforeAll(initI18n);
beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.resetAllMocks();
  // The page mounts the create menu's preset read and the advanced panel's
  // resolution; both have to answer for the form tests to be about the form.
  listProviderPresetsMock.mockResolvedValue([]);
  resolveCompatMock.mockResolvedValue({ sources: {}, values: {} });
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

function clickRow(name: string): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

function keyField(): HTMLElement {
  return screen.getByLabelText("API key");
}

/**
 * The name box, read with `hidden: true`: the dirty guard is a modal dialog,
 * and while it is up Radix marks the page behind it `aria-hidden`, so the
 * default query would not see the field it is asking about.
 */
function nameField(): HTMLElement {
  return screen.getByRole("textbox", { hidden: true, name: "Name" });
}

/** Drills into one model of the open provider's directory. */
function openModel(model: string): void {
  openSection("Models");
  fireEvent.click(screen.getByRole("button", { name: `Edit model ${model}` }));
}

/**
 * Switches the open provider's detail to one of its three sections. Radix
 * tabs activate on mouse down, not on click.
 */
function openSection(name: string): void {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });
}

async function pickNewMenuItem(name: string): Promise<void> {
  fireEvent.pointerDown(screen.getByRole("button", { name: "Add provider" }), {
    button: 0,
    ctrlKey: false,
  });
  const item = await screen.findByRole("menuitem", { name });
  fireEvent.pointerUp(item);
}

/** Removes one model row outright: the action is a button, not a menu item. */
function removeModelRow(row: number): void {
  const buttons = screen.getAllByRole("button", { name: /^Remove model / });
  fireEvent.click(buttons[row] ?? document.body);
}

async function renderPage(
  initial: ProviderListItem[],
  firstRowName: string,
): Promise<void> {
  rows = initial;
  listProvidersMock.mockImplementation(() =>
    Promise.resolve({ providers: rows }),
  );
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ProvidersPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: firstRowName });
}

describe("provider detail prefill", () => {
  it("fills the form from the selected row", async () => {
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");

    expect(nameField()).toHaveProperty("value", "Gateway");
    expect(screen.getByRole("textbox", { name: "Base URL" })).toHaveProperty(
      "value",
      "https://gateway.example/v1",
    );
    expect(keyField()).toHaveProperty("value", "sk-secret");
    expect(keyField()).toHaveProperty("type", "password");
    // Timeouts are stored in milliseconds and shown in seconds.
    expect(
      screen.getByRole("textbox", { name: "Request timeout" }),
    ).toHaveProperty("value", "120");
    expect(screen.getByRole("textbox", { name: "Retry limit" })).toHaveProperty(
      "value",
      "2",
    );
    // The switch lives on the list row, not in the form.
    expect(
      screen
        .getByRole("switch", { name: "Gateway" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("combobox", { name: "Default protocol" }).textContent,
    ).toContain("OpenAI Chat Completions");
    expect(
      screen.getByRole("textbox", { name: "Custom headers Header name" }),
    ).toHaveProperty("value", "x-extra");
  });

  it("selects a row from the keyboard", async () => {
    await renderPage([STORED], "Gateway");
    const row = screen.getByRole("button", { name: "Gateway" });
    row.focus();

    fireEvent.keyDown(row, { key: "Enter" });

    expect(nameField()).toHaveProperty("value", "Gateway");
    expect(row.getAttribute("aria-current")).toBe("true");
  });
});

describe("saving a provider draft", () => {
  it("submits the full draft through update_provider and re-baselines it", async () => {
    updateProviderMock.mockImplementation(({ id, provider }) => {
      // Mirrors the Rust base-url normalisation: the stored row is not
      // byte-identical to the submitted draft.
      const saved: Provider = {
        ...provider,
        baseUrl: provider.baseUrl.replace(/\/+$/, ""),
        id,
      };
      rows = [saved];
      return Promise.resolve(saved);
    });
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");
    fireEvent.click(screen.getByRole("button", { name: "Show key" }));
    fireEvent.change(nameField(), { target: { value: "Renamed" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Base URL" }), {
      target: { value: "https://gateway.example/v1/" },
    });

    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateProviderMock).toHaveBeenCalledTimes(1);
    });
    const { id, ...storedDraft } = STORED;
    expect(updateProviderMock).toHaveBeenCalledWith(
      {
        id,
        provider: {
          ...storedDraft,
          baseUrl: "https://gateway.example/v1/",
          name: "Renamed",
        },
      },
      expect.anything(),
    );
    // The invalidation read runs again, and the stored row becomes the new
    // baseline: the form shows what was stored, is clean, and masks the key.
    await waitFor(() => {
      expect(listProvidersMock.mock.calls.length).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Base URL" })).toHaveProperty(
        "value",
        "https://gateway.example/v1",
      );
    });
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(keyField()).toHaveProperty("type", "password");
  });

  it("stores a seconds timeout as whole milliseconds", async () => {
    updateProviderMock.mockImplementation(({ id, provider }) =>
      Promise.resolve({ ...provider, id }),
    );
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");

    fireEvent.change(screen.getByRole("textbox", { name: "Request timeout" }), {
      target: { value: "42.5" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Stream idle timeout" }),
      { target: { value: "1.001" } },
    );
    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateProviderMock).toHaveBeenCalledTimes(1);
    });
    const submitted = updateProviderMock.mock.calls[0]?.[0]?.provider;
    expect(submitted?.requestTimeoutMs).toBe(42_500);
    expect(submitted?.streamIdleTimeoutMs).toBe(1_001);
  });

  it("refuses a blank timeout instead of storing a default", async () => {
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");

    fireEvent.change(screen.getByRole("textbox", { name: "Request timeout" }), {
      target: { value: "" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Invalid input");
    expect(updateProviderMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Request timeout" }),
    ).toHaveProperty("value", "");
  });

  it("keeps the draft and shows the error code when the write fails", async () => {
    const failure: AppError = {
      code: "invalid_input",
      message: "duplicate provider name",
    };
    updateProviderMock.mockRejectedValue(failure);
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");
    fireEvent.change(nameField(), { target: { value: "Edited" } });

    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Invalid input");
    });
    expect(nameField()).toHaveProperty("value", "Edited");
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("keeps the input and writes nothing when the draft is invalid", async () => {
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");
    fireEvent.change(nameField(), { target: { value: "" } });

    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Invalid input");
    expect(updateProviderMock).not.toHaveBeenCalled();
    expect(nameField()).toHaveProperty("value", "");
  });

  it("stores a blank provider from the create menu and opens it", async () => {
    createProviderMock.mockImplementation(({ provider }) => {
      const saved: Provider = { ...provider, id: "p9" };
      rows = [saved];
      return Promise.resolve(saved);
    });
    await renderPage([STORED], "Gateway");

    await pickNewMenuItem("New blank provider");

    await waitFor(() => {
      expect(createProviderMock).toHaveBeenCalledTimes(1);
    });
    // The row is stored before the form opens: neither a name nor a base URL
    // is optional to the write layer, so the click carries the placeholder
    // name and the default protocol's canonical endpoint.
    expect(createProviderMock).toHaveBeenCalledWith(
      {
        provider: {
          abortOnDisconnect: true,
          api: "openai-completions",
          apiKey: "",
          baseUrl: "https://api.openai.com/v1",
          enabled: true,
          maxRetries: 2,
          name: "Untitled provider",
          reasoningOutput: "auto",
          requestTimeoutMs: 120_000,
          streamIdleTimeoutMs: 120_000,
        },
      },
      expect.anything(),
    );
    // The created provider is an ordinary stored row from the moment it
    // appears, and the form over it is a plain edit form.
    await screen.findByRole("button", { name: "Untitled provider" });
    expect(nameField()).toHaveProperty("value", "Untitled provider");
    expect(
      screen.getByRole("button", { name: "Delete provider" }),
    ).toBeTruthy();
  });
});

describe("model directory on the provider page", () => {
  const SECOND_MODEL: Provider = {
    ...STORED,
    models: [
      {
        apis: ["openai-completions"],
        compat: { "openai-completions": { supportsStore: true } },
        id: "m1",
        reasoning: true,
      },
      { id: "m2", input: ["text"], reasoning: false },
    ],
  };

  it("submits the stored rows with the keys the editor never touches", async () => {
    updateProviderMock.mockImplementation(({ id, provider }) =>
      Promise.resolve({ ...provider, id }),
    );
    await renderPage([SECOND_MODEL], "Gateway");
    clickRow("Gateway");

    openSection("Models");
    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateProviderMock).toHaveBeenCalledTimes(1);
    });
    const submitted = updateProviderMock.mock.calls[0]?.[0]?.provider;
    expect(submitted?.models?.map((model) => model.id)).toEqual(["m1", "m2"]);
    // Every row passes through with exactly the keys it was stored with.
    expect(submitted?.models?.[0]).toEqual({
      apis: ["openai-completions"],
      compat: { "openai-completions": { supportsStore: true } },
      id: "m1",
      reasoning: true,
    });
    expect(submitted?.models?.[1]).toEqual({
      id: "m2",
      input: ["text"],
      reasoning: false,
    });
  });

  it("shows the row error and writes nothing when a model id is blank", async () => {
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");

    openModel("m1");
    fireEvent.change(screen.getByRole("textbox", { name: "Model ID" }), {
      target: { value: "" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Invalid input");
    expect(updateProviderMock).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Model ID" })).toHaveProperty(
      "value",
      "",
    );
    // The rejected field is two levels inside the models section, so that
    // section is the one that has to say something is wrong.
    expect(
      screen.getByRole("tab", { name: "Models" }).getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("reports a second model taking a name already in use", async () => {
    await renderPage([SECOND_MODEL], "Gateway");
    clickRow("Gateway");

    openModel("m1");
    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
      target: { value: "Taken" },
    });
    // Back to the directory: the second row is edited from its own entry.
    fireEvent.click(screen.getByRole("button", { name: "Models" }));
    openModel("m2");
    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
      target: { value: "Taken" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Invalid input");
    expect(updateProviderMock).not.toHaveBeenCalled();
  });

  it("shows the price error and writes nothing when a peak window is malformed", async () => {
    updateProviderMock.mockImplementation(({ id, provider }) =>
      Promise.resolve({ ...provider, id }),
    );
    await renderPage([SECOND_MODEL], "Gateway");
    clickRow("Gateway");

    // The window times are UTC HH:MM; "9:00" fails the schema's shape check.
    openModel("m1");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Pricing" }), {
      button: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: "Add peak rates" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Start (UTC) 1" }), {
      target: { value: "9:00" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Invalid input");
    expect(updateProviderMock).not.toHaveBeenCalled();
  });

  it("holds a provider switch when only a model row changed", async () => {
    await renderPage([STORED, OTHER], "Gateway");
    clickRow("Gateway");

    openModel("m1");
    fireEvent.change(screen.getByRole("textbox", { name: "Model ID" }), {
      target: { value: "m9" },
    });
    clickRow("Second");

    // The guard parks the switch and the edited row stays on screen, behind
    // the modal that Radix marks the rest of the page `aria-hidden` for.
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(
      screen.getByRole("textbox", { hidden: true, name: "Model ID" }),
    ).toHaveProperty("value", "m9");

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(nameField()).toHaveProperty("value", "Second");
  });

  it("restores the stored rows when the draft is reset", async () => {
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");

    openModel("m1");
    fireEvent.change(screen.getByRole("textbox", { name: "Model ID" }), {
      target: { value: "m9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    // The re-baseline remounts the fields under the open model, and the open
    // model itself survives it.
    expect(screen.getByRole("textbox", { name: "Model ID" })).toHaveProperty(
      "value",
      "m1",
    );
  });
});

describe("provider detail sections", () => {
  it("keeps an unsaved edit while the user reads another section", async () => {
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");
    fireEvent.change(nameField(), { target: { value: "Edited" } });

    openSection("Models");
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    openSection("General");

    expect(nameField()).toHaveProperty("value", "Edited");
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("stays on the section and the open model across a save", async () => {
    updateProviderMock.mockImplementation(({ id, provider }) => {
      const saved: Provider = { ...provider, id };
      rows = [saved];
      return Promise.resolve(saved);
    });
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");
    openModel("m1");
    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
      target: { value: "Fast" },
    });

    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateProviderMock).toHaveBeenCalledTimes(1);
    });
    // The re-baseline re-keys the fields under the open model without
    // closing it or throwing the user back to the general section.
    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "Display name" }),
      ).toHaveProperty("value", "Fast");
    });
  });

  it("returns to the general section when another provider is opened", async () => {
    await renderPage([STORED, OTHER], "Gateway");
    clickRow("Gateway");
    openModel("m1");
    expect(screen.getByRole("textbox", { name: "Model ID" })).toBeTruthy();

    clickRow("Second");

    expect(nameField()).toHaveProperty("value", "Second");
    expect(screen.queryByRole("textbox", { name: "Model ID" })).toBeNull();
  });

  it("closes the open model when its row is deleted", async () => {
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");
    openSection("Models");

    removeModelRow(0);

    expect(screen.getByText("No models yet")).toBeTruthy();
  });
});

describe("dirty guard", () => {
  it("holds a provider switch until the draft is discarded", async () => {
    await renderPage([STORED, OTHER], "Gateway");
    clickRow("Gateway");
    fireEvent.change(nameField(), { target: { value: "Edited" } });

    clickRow("Second");
    expect(nameField()).toHaveProperty("value", "Edited");
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    // Cancelling leaves the draft untouched and the guard disappears.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(nameField()).toHaveProperty("value", "Edited");
    expect(screen.queryByRole("alertdialog")).toBeNull();

    clickRow("Second");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(nameField()).toHaveProperty("value", "Second");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("is clean again after the dirty guard discarded the draft", async () => {
    await renderPage([STORED, OTHER], "Gateway");
    clickRow("Gateway");
    fireEvent.change(nameField(), { target: { value: "Edited" } });

    clickRow("Second");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    // The discard re-baselined the form: nothing is unsaved any more, so the
    // next switch goes through without a notice.
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      true,
    );
    clickRow("Gateway");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(nameField()).toHaveProperty("value", "Gateway");
  });

  it("holds a list toggle until the draft is discarded, then writes it", async () => {
    updateProviderMock.mockImplementation(({ id, provider }) => {
      const saved: Provider = { ...provider, id };
      rows = [saved];
      return Promise.resolve(saved);
    });
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");
    fireEvent.change(nameField(), { target: { value: "Edited" } });

    fireEvent.click(screen.getByRole("switch", { name: "Gateway" }));
    expect(updateProviderMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() => {
      expect(updateProviderMock).toHaveBeenCalledTimes(1);
    });
    const { id, ...storedDraft } = STORED;
    expect(updateProviderMock).toHaveBeenCalledWith(
      { id, provider: { ...storedDraft, enabled: false } },
      expect.anything(),
    );
    // The row's switch shows the stored value, and the form it mirrors into
    // stays clean.
    expect(
      screen
        .getByRole("switch", { name: "Gateway" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("toggles the edited provider from the form's own copy of it", async () => {
    updateProviderMock.mockImplementation(({ id, provider }) =>
      Promise.resolve({ ...provider, id }),
    );
    // The list read keeps serving the pre-save row, so only the form's
    // baseline holds the value the save just stored.
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");
    fireEvent.change(nameField(), { target: { value: "Renamed" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(updateProviderMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("switch", { name: "Gateway" }));

    await waitFor(() => {
      expect(updateProviderMock).toHaveBeenCalledTimes(2);
    });
    const { id, ...storedDraft } = STORED;
    expect(updateProviderMock).toHaveBeenLastCalledWith(
      {
        id,
        provider: { ...storedDraft, enabled: false, name: "Renamed" },
      },
      expect.anything(),
    );
  });

  it("toggles enabled straight from the cached row when the draft is clean", async () => {
    await renderPage([STORED], "Gateway");

    fireEvent.click(screen.getByRole("switch", { name: "Gateway" }));

    await waitFor(() => {
      expect(updateProviderMock).toHaveBeenCalledTimes(1);
    });
    const { id, ...storedDraft } = STORED;
    expect(updateProviderMock).toHaveBeenCalledWith(
      { id, provider: { ...storedDraft, enabled: false } },
      expect.anything(),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("api key masking", () => {
  it("reveals on demand and re-masks on a provider switch", async () => {
    await renderPage([STORED, OTHER], "Gateway");
    clickRow("Gateway");
    expect(keyField()).toHaveProperty("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show key" }));
    expect(keyField()).toHaveProperty("type", "text");

    clickRow("Second");
    expect(keyField()).toHaveProperty("value", "sk-other");
    expect(keyField()).toHaveProperty("type", "password");
  });
});

describe("corrupted rows", () => {
  it("shows the notice and the delete entry instead of a form", async () => {
    await renderPage([CORRUPTED], "Corrupted provider");

    clickRow("Corrupted provider");

    expect(
      screen.getByText("This provider's stored data no longer decodes"),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Delete provider" }),
    ).toBeTruthy();
  });

  it("asks beside the button and deletes on confirm", async () => {
    deleteProviderMock.mockImplementation(({ id }) => {
      rows = rows.filter((row) => row.id !== id);
      return Promise.resolve();
    });
    await renderPage([STORED, OTHER], "Gateway");
    clickRow("Gateway");

    fireEvent.click(screen.getByRole("button", { name: "Delete provider" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(deleteProviderMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete provider" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteProviderMock).toHaveBeenCalledWith(
        { id: "p1" },
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(nameField()).toHaveProperty("value", "Second");
    });
  });
});

describe("draft actions", () => {
  it("clears an inherited switch edit after toggling it on and off", async () => {
    const provider = { ...STORED };
    delete provider.compat;
    await renderPage([provider], "Gateway");
    clickRow("Gateway");
    openSection("Advanced");
    const control = within(screen.getByRole("tabpanel")).getAllByRole(
      "switch",
    )[0];
    if (control === undefined) throw new Error("Missing compat switch");
    expect(control.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(control);
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      false,
    );
    fireEvent.click(control);
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.queryByRole("button", { name: "Restore the saved value" }),
    ).toBeNull();
  });

  it("keeps invalid input typed while a save is pending", async () => {
    let finishSave = () => undefined;
    updateProviderMock.mockImplementation(
      ({ id, provider }) =>
        new Promise<Provider>((resolve) => {
          finishSave = () => {
            const saved = { ...provider, id };
            rows = [saved];
            resolve(saved);
          };
        }),
    );
    await renderPage(
      [{ ...STORED, compat: { "openai-completions": { vllmPriority: 7 } } }],
      "Gateway",
    );
    clickRow("Gateway");
    fireEvent.change(nameField(), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateProviderMock).toHaveBeenCalledTimes(1));
    openSection("Advanced");
    fireEvent.change(screen.getByRole("textbox", { name: /priority/i }), {
      target: { value: "oops" },
    });
    await act(async () => {
      finishSave();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeTruthy(),
    );
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "oops",
    );
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "7",
    );
    openSection("General");
    expect(nameField()).toHaveProperty("value", "Renamed");
  });

  it("guards invalid JSON through tab switches, save, navigation, and reset", async () => {
    await renderPage(
      [
        { ...STORED, compat: { "openai-completions": { vllmPriority: 7 } } },
        OTHER,
      ],
      "Gateway",
    );
    clickRow("Gateway");
    openSection("Advanced");
    const input = screen.getByRole("textbox", { name: /priority/i });
    fireEvent.change(input, { target: { value: "oops" } });
    fireEvent.blur(input);
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateProviderMock).not.toHaveBeenCalled();

    openSection("General");
    openSection("Advanced");
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "oops",
    );
    clickRow("Second");
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "oops",
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "7",
    );
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      true,
    );
    clickRow("Second");
    expect(nameField()).toHaveProperty("value", "Second");
  });

  it("restores the stored values when the draft is reset", async () => {
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");
    fireEvent.change(nameField(), { target: { value: "Edited" } });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(nameField()).toHaveProperty("value", "Gateway");
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("keeps the create action on the list, not in the detail pane", async () => {
    await renderPage([], "Add provider");

    // An empty library shows the hint alone: the list's own action row is the
    // one create entry the page offers.
    expect(
      screen.queryByRole("button", { name: "New blank provider" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Add provider" })).toBeTruthy();
  });
});

describe("preset prefill", () => {
  const PRESET: ProviderPreset = {
    api: "openai-completions",
    baseUrl: "https://openrouter.ai/api/v1",
    compat: {
      "openai-completions": {
        supportsDeveloperRole: false,
        thinkingFormat: "openrouter",
      },
    },
    headers: { "X-OpenRouter-Title": "Nostra" },
    models: [
      {
        apis: ["anthropic-messages", "openai-completions"],
        contextWindow: 1_000_000,
        id: "anthropic/claude-sonnet-5",
        input: ["text", "image"],
        name: "Claude Sonnet 5",
        reasoning: true,
      },
    ],
    name: "OpenRouter",
    presetId: "openrouter",
  };

  it("stores a prefilled provider from a preset and opens it", async () => {
    listProviderPresetsMock.mockResolvedValue([PRESET]);
    createProviderMock.mockImplementation(({ provider }) => {
      const saved: Provider = { ...provider, id: "p9" };
      rows = [saved];
      return Promise.resolve(saved);
    });
    await renderPage([], "Add provider");

    await pickNewMenuItem("OpenRouter");

    await waitFor(() => {
      expect(createProviderMock).toHaveBeenCalledTimes(1);
    });
    // The preset's values are stored as the row's document.
    expect(createProviderMock).toHaveBeenCalledWith(
      {
        provider: {
          abortOnDisconnect: true,
          api: "openai-completions",
          apiKey: "",
          baseUrl: "https://openrouter.ai/api/v1",
          compat: PRESET.compat,
          enabled: true,
          headers: PRESET.headers,
          maxRetries: 2,
          models: PRESET.models,
          name: "OpenRouter",
          reasoningOutput: "auto",
          requestTimeoutMs: 120_000,
          streamIdleTimeoutMs: 120_000,
        },
      },
      expect.anything(),
    );
    // The form opens over the stored row, showing what was stored, and it is
    // clean: a prefill is the baseline, not an unsaved edit.
    await screen.findByRole("button", { name: "OpenRouter" });
    expect(nameField()).toHaveProperty("value", "OpenRouter");
    expect(screen.getByRole("textbox", { name: "Base URL" })).toHaveProperty(
      "value",
      "https://openrouter.ai/api/v1",
    );
    expect(
      screen.getByRole("combobox", { name: "Default protocol" }).textContent,
    ).toContain("OpenAI Chat Completions");
    expect(
      screen.getByRole("textbox", { name: "Custom headers Header name" }),
    ).toHaveProperty("value", "X-OpenRouter-Title");
    openModel("anthropic/claude-sonnet-5");
    expect(screen.getByRole("textbox", { name: "Model ID" })).toHaveProperty(
      "value",
      "anthropic/claude-sonnet-5",
    );
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      true,
    );

    // Preset values are saved overrides, so untouched fields offer no undo.
    openSection("Advanced");
    const completionsSegment = screen.getByRole("radio", {
      name: "Completions",
    });
    const messagesSegment = screen.getByRole("radio", { name: "Messages" });
    // The first family is the one on screen until another is picked.
    expect(
      screen.queryByRole("group", { name: "OpenAI Chat Completions" }),
    ).toBeNull();

    fireEvent.click(completionsSegment);

    const completions = screen.getByRole("group", {
      name: "OpenAI Chat Completions",
    });
    expect(
      within(
        within(completions).getByRole("group", { name: "Developer role" }),
      ).queryByRole("button", { name: /^Restore/ }),
    ).toBeNull();

    fireEvent.click(messagesSegment);

    expect(
      screen.getByRole("group", { name: "Anthropic Messages" }),
    ).toBeTruthy();
  });

  it("offers a retry when the preset read fails", async () => {
    listProviderPresetsMock
      .mockRejectedValueOnce({ code: "db", message: "read failed" })
      .mockResolvedValueOnce([PRESET]);
    createProviderMock.mockImplementation(({ provider }) =>
      Promise.resolve({ ...provider, id: "p9" }),
    );
    await renderPage([], "Add provider");

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Add provider" }),
      { button: 0, ctrlKey: false },
    );
    expect(
      await screen.findByRole("menuitem", { name: "Database error" }),
    ).toBeTruthy();

    fireEvent.pointerUp(screen.getByRole("menuitem", { name: "Retry" }));

    await waitFor(() => {
      expect(listProviderPresetsMock).toHaveBeenCalledTimes(2);
    });
    await pickNewMenuItem("OpenRouter");
    await waitFor(() => {
      expect(createProviderMock).toHaveBeenCalledTimes(1);
    });
    expect(nameField()).toHaveProperty("value", "OpenRouter");
  });
});

describe("provider compatibility defaults", () => {
  const official: Provider = {
    ...STORED,
    baseUrl: "https://api.openai.com/v1",
    compat: {
      "anthropic-messages": { supportsTemperature: false },
      "openai-completions": {
        supportsDeveloperRole: true,
        supportsStore: false,
        vllmPriority: 7,
      },
      "openai-responses": { supportsStrictMode: false },
    },
    models: [
      {
        apis: ["openai-completions"],
        compat: { "openai-completions": { vllmPriority: 9 } },
        id: "m1",
        reasoning: true,
      },
    ],
  };
  const defaults: Record<string, ResolvedCompat> = {
    "anthropic-messages": {
      presetId: "openai",
      sources: { supportsTemperature: "familyDefault" },
      values: { supportsTemperature: true },
    },
    "openai-completions": {
      presetId: "openai",
      sources: {
        supportsDeveloperRole: "vendor",
        supportsStore: "vendor",
        vllmPriority: "vendor",
      },
      values: {
        supportsDeveloperRole: true,
        supportsStore: true,
        vllmPriority: 3,
      },
    },
    "openai-responses": {
      presetId: "openai",
      sources: { supportsStrictMode: "familyDefault" },
      values: { supportsStrictMode: true },
    },
  };

  beforeEach(() => {
    resolveCompatMock.mockImplementation(({ protocol, provider }) =>
      Promise.resolve(
        provider.baseUrl === official.baseUrl ||
          provider.baseUrl === "https://api.openai.com/v2"
          ? (defaults[protocol] ?? { sources: {}, values: {} })
          : { sources: {}, values: {} },
      ),
    );
  });

  it("shows one footer action immediately before Reset only on a recognized provider's Advanced tab", async () => {
    await renderPage([official, OTHER], "Gateway");
    clickRow("Gateway");
    expect(
      screen.queryByRole("button", { name: "Restore default" }),
    ).toBeNull();
    openSection("Models");
    expect(
      screen.queryByRole("button", { name: "Restore default" }),
    ).toBeNull();
    openSection("Advanced");
    const restore = await screen.findByRole("button", {
      name: "Restore default",
    });
    expect(
      screen.getAllByRole("button", { name: "Restore default" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Reset" }).previousElementSibling,
    ).toBe(restore);
    expect(
      within(screen.getByRole("tabpanel")).queryByRole("button", {
        name: "Restore default",
      }),
    ).toBeNull();
    clickRow("Second");
    openSection("Advanced");
    await waitFor(() =>
      expect(
        resolveCompatMock.mock.calls.map(([params]) => params.provider.baseUrl),
      ).toContain(OTHER.baseUrl),
    );
    expect(
      screen.queryByRole("button", { name: "Restore default" }),
    ).toBeNull();
  });

  it("restores only provider compatibility, clears invalid text, and saves the other draft edits intact", async () => {
    updateProviderMock.mockImplementation(({ id, provider }) =>
      Promise.resolve({ ...provider, id }),
    );
    await renderPage([official], "Gateway");
    clickRow("Gateway");
    fireEvent.change(nameField(), { target: { value: "Renamed" } });
    fireEvent.change(keyField(), { target: { value: "sk-edited" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Base URL" }), {
      target: { value: "https://api.openai.com/v2" },
    });
    openModel("m1");
    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
      target: { value: "Edited model" },
    });
    openSection("Advanced");
    const priority = screen.getByRole("textbox", { name: /priority/i });
    fireEvent.change(priority, { target: { value: "oops" } });
    fireEvent.blur(priority);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    const restore = await screen.findByRole("button", {
      name: "Restore default",
    });
    await waitFor(() => expect(restore).toHaveProperty("disabled", false));
    fireEvent.click(restore);
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "3",
    );
    expect(screen.queryByText("Invalid JSON")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(restore).toHaveProperty("disabled", true);
    expect(updateProviderMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateProviderMock).toHaveBeenCalledTimes(1));
    const { id, ...saved } = official;
    expect(updateProviderMock.mock.calls[0]?.[0]).toEqual({
      id,
      provider: {
        ...saved,
        apiKey: "sk-edited",
        baseUrl: "https://api.openai.com/v2",
        compat: { "openai-completions": { supportsDeveloperRole: true } },
        models: official.models?.map((model) => ({
          ...model,
          name: "Edited model",
        })),
        name: "Renamed",
      },
    });
  });

  it("keeps restore-default changes reversible to the saved baseline", async () => {
    await renderPage([official], "Gateway");
    clickRow("Gateway");
    openSection("Advanced");
    fireEvent.click(
      await screen.findByRole("button", { name: "Restore default" }),
    );
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "3",
    );
    const store = screen.getByRole("group", { name: "Store parameter" });
    expect(
      within(store).getAllByRole("button", { name: /^Restore/ }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "7",
    );
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.queryByRole("button", { name: "Restore the saved value" }),
    ).toBeNull();
    expect(updateProviderMock).not.toHaveBeenCalled();
  });

  it("clears invalid input without dirtying saved values already at the default", async () => {
    await renderPage(
      [
        {
          ...official,
          compat: {
            "openai-completions": { supportsStore: true, vllmPriority: 3 },
          },
        },
      ],
      "Gateway",
    );
    clickRow("Gateway");
    openSection("Advanced");
    const restore = await screen.findByRole("button", {
      name: "Restore default",
    });
    expect(restore).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox", { name: /priority/i }), {
      target: { value: "oops" },
    });
    expect(restore).toHaveProperty("disabled", false);
    fireEvent.click(restore);
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "3",
    );
    expect(screen.getByRole("button", { name: "Reset" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.queryByRole("button", { name: "Restore the saved value" }),
    ).toBeNull();
  });

  it("waits for the changed URL's defaults before allowing restore", async () => {
    await renderPage([official], "Gateway");
    clickRow("Gateway");
    openSection("Advanced");
    const restore = await screen.findByRole("button", {
      name: "Restore default",
    });
    expect(restore).toHaveProperty("disabled", false);
    let finishResolution: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finishResolution = resolve;
    });
    resolveCompatMock.mockImplementation(async () => {
      await pending;
      return {
        presetId: "moonshot",
        sources: { vllmPriority: "vendor" },
        values: { vllmPriority: 11 },
      };
    });
    openSection("General");
    fireEvent.change(screen.getByRole("textbox", { name: "Base URL" }), {
      target: { value: "https://api.moonshot.ai/v1" },
    });
    openSection("Advanced");
    const pendingRestore = screen.getByRole("button", {
      name: "Restore default",
    });
    expect(pendingRestore).toHaveProperty("disabled", true);
    fireEvent.click(pendingRestore);
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "7",
    );
    await act(async () => {
      finishResolution();
      await pending;
    });
    await waitFor(() =>
      expect(pendingRestore).toHaveProperty("disabled", false),
    );
    fireEvent.click(pendingRestore);
    expect(screen.getByRole("textbox", { name: /priority/i })).toHaveProperty(
      "value",
      "11",
    );
  });
});

describe("advanced panel on the provider page", () => {
  const BOTH: Provider = {
    ...STORED,
    models: [
      { apis: ["openai-completions"], id: "m1", reasoning: true },
      { apis: ["anthropic-messages"], id: "m2", reasoning: true },
    ],
  };

  it("puts the protocol switcher in the section strip, one segment per family", async () => {
    await renderPage([BOTH], "Gateway");
    clickRow("Gateway");

    openSection("Advanced");

    // Same row as the sections: one strip, two groups.
    const strip = screen.getByRole("tablist").parentElement;
    const switcher = within(strip ?? document.body).getByRole("radiogroup", {
      name: "Protocol",
    });
    expect(
      within(switcher)
        .getAllByRole("radio")
        .map((segment) => segment.textContent),
    ).toEqual(["Messages", "Completions"]);
  });

  it("shows the switcher even while a single family answers", async () => {
    await renderPage([STORED], "Gateway");
    clickRow("Gateway");

    openSection("Advanced");

    // One family still gets a switcher: it names the family the pane below
    // configures, in the same short form the section strip uses, so the pane
    // itself carries no heading.
    const switcher = await screen.findByRole("radiogroup", {
      name: "Protocol",
    });
    expect(
      within(switcher)
        .getAllByRole("radio")
        .map((segment) => segment.textContent),
    ).toEqual(["Completions"]);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("keeps a family's bucket through a protocol uncheck and saves it", async () => {
    updateProviderMock.mockImplementation(({ id, provider }) =>
      Promise.resolve({ ...provider, id }),
    );
    await renderPage([BOTH], "Gateway");
    clickRow("Gateway");

    openSection("Advanced");
    const temperature = await screen.findByRole("group", {
      name: "Temperature",
    });
    fireEvent.click(within(temperature).getByRole("switch"));
    // Unchecking the protocol that put the anthropic section on screen removes
    // the section; the bucket it holds stays in the draft, and the edit made
    // in another section survives the round trip.
    openSection("Models");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Messages \u00b7 m2" }),
    );
    openSection("Advanced");
    expect(screen.queryByRole("group", { name: "Temperature" })).toBeNull();

    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateProviderMock).toHaveBeenCalledTimes(1);
    });
    const submitted = updateProviderMock.mock.calls[0]?.[0]?.provider;
    // The stored bucket survives the section change, and the panel's edit
    // arrives next to it.
    expect(submitted?.compat).toEqual({
      "anthropic-messages": { supportsTemperature: true },
      "openai-completions": { supportsStore: false },
    });
    expect(submitted?.models?.map((model) => [model.id, model.apis])).toEqual([
      ["m1", ["openai-completions"]],
      ["m2", []],
    ]);
  });
});
