import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

import type { Provider, ProviderPreset } from "@/types/ipc";
import type { SessionModel } from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";
import {
  listProviderPresets,
  listProviders,
  listUnifiedModels,
} from "@/lib/ipc/providers";

import { ModelPicker } from "./ModelPicker";

vi.mock("@/lib/ipc/providers", () => ({
  listProviderPresets: vi.fn(),
  listProviders: vi.fn(),
  listUnifiedModels: vi.fn(),
}));

const listProvidersMock = vi.mocked(listProviders);

const ALPHA: Provider = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "",
  baseUrl: "https://alpha.example/v1",
  enabled: true,
  id: "p1",
  maxRetries: 2,
  models: [
    {
      apis: ["openai-completions"],
      id: "alpha-fast",
      name: "Alpha Fast",
      reasoning: false,
    },
  ],
  name: "Alpha",
  reasoningOutput: "auto",
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 120_000,
};

const BETA: Provider = {
  ...ALPHA,
  enabled: false,
  id: "p2",
  models: [{ apis: ["openai-completions"], id: "beta-slow", reasoning: false }],
  name: "Beta",
};

/** Stands at OpenAI's own address, so the picker can name its vendor. */
const VENDORED: Provider = {
  ...ALPHA,
  baseUrl: "https://api.openai.com/v1",
  id: "p3",
  models: [{ apis: ["openai-responses"], id: "gpt-x", reasoning: false }],
  name: "OpenAI",
};

const OPENAI_PRESET: ProviderPreset = {
  api: "openai-responses",
  baseUrl: "https://api.openai.com/v1",
  compat: {},
  headers: {},
  models: [],
  name: "OpenAI",
  presetId: "openai",
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
});
afterEach(() => {
  cleanup();
  queryClient.clear();
});

/** The heading of one provider's group, which is where its mark is drawn. */
function heading(group: HTMLElement): HTMLElement {
  const found = group.querySelector("p");
  if (found === null) {
    throw new Error("group has no heading");
  }
  return found;
}

/**
 * Renders the picker and waits for the catalogue to land: the trigger names
 * the picked model, so a pick the read has not delivered yet still shows the
 * placeholder.
 */
async function renderPicker(
  model: null | SessionModel = null,
  settlesTo = "Pick a model",
  options: { presets?: ProviderPreset[]; providers?: Provider[] } = {},
): Promise<{ onPick: ReturnType<typeof vi.fn> }> {
  listProvidersMock.mockResolvedValue({
    providers: options.providers ?? [ALPHA, BETA],
  });
  vi.mocked(listProviderPresets).mockResolvedValue(options.presets ?? []);
  vi.mocked(listUnifiedModels).mockResolvedValue([]);
  const onPick = vi.fn<(model: null | SessionModel) => void>();
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ModelPicker model={model} onPick={onPick} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Pick a model" }).textContent,
    ).toContain(settlesTo);
  });
  return { onPick };
}

describe("model picker", () => {
  it("names the picked model on its trigger", async () => {
    await renderPicker(
      { kind: "provider", modelId: "alpha-fast", providerId: "p1" },
      "Alpha Fast",
    );

    expect(
      screen.getByRole("button", { name: "Pick a model" }).textContent,
    ).toContain("Alpha Fast");
  });

  it("groups the reachable models under their provider", async () => {
    const { onPick } = await renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Pick a model" }));

    expect(await screen.findByText("Alpha")).toBeTruthy();
    // A disabled provider is not reachable, so it offers nothing to pick.
    expect(screen.queryByText("Beta")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Alpha Fast.*alpha-fast/ }),
    );
    expect(onPick).toHaveBeenCalledWith({
      kind: "provider",
      modelId: "alpha-fast",
      providerId: "p1",
    });
  });

  it("marks a provider whose address is a preset's own", async () => {
    await renderPicker(null, "Pick a model", {
      presets: [OPENAI_PRESET],
      providers: [ALPHA, VENDORED],
    });

    fireEvent.click(screen.getByRole("button", { name: "Pick a model" }));

    const marked = heading(
      await screen.findByRole("group", { name: "OpenAI" }),
    );
    const plain = heading(screen.getByRole("group", { name: "Alpha" }));
    expect(marked.querySelector("svg")).not.toBeNull();
    // A provider at an address no preset claims keeps a plain heading.
    expect(plain.querySelector("svg")).toBeNull();
  });

  it("narrows the list by the search box", async () => {
    await renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Pick a model" }));
    fireEvent.change(
      await screen.findByRole("searchbox", { name: "Search models" }),
      {
        target: { value: "beta" },
      },
    );

    expect(screen.queryByText("alpha-fast")).toBeNull();
    expect(screen.getByText("No matching models")).toBeTruthy();
  });

  it("drops a selected model the catalogue no longer holds", async () => {
    await renderPicker(
      { kind: "provider", modelId: "retired", providerId: "p1" },
      "Pick a model",
    );

    // The trigger names the placeholder, not the selection: there is nothing
    // left to send to, so the picker reads as unpicked.
    const trigger = screen.getByRole("button", { name: "Pick a model" });
    expect(trigger.textContent).not.toContain("retired");
  });

  it("names a selection by its request name while the catalogue is still arriving", () => {
    // A read that never settles: the trigger can only show the stored selection.
    listProvidersMock.mockReturnValue(new Promise(() => undefined));
    vi.mocked(listProviderPresets).mockResolvedValue([]);
    vi.mocked(listUnifiedModels).mockResolvedValue([]);
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ModelPicker
            model={{
              kind: "provider",
              modelId: "alpha-fast",
              providerId: "p1",
            }}
            onPick={vi.fn()}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Pick a model" }).textContent,
    ).toContain("alpha-fast");
  });
});
