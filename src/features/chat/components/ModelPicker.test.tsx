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

import type { Provider } from "@/types/ipc";
import type { ModelSelection } from "@/types/model-selection";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";
import { listProviders, listUnifiedModels } from "@/lib/ipc/providers";

import { ModelPicker } from "./ModelPicker";

vi.mock("@/lib/ipc/providers", () => ({
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

/**
 * Renders the picker and waits for the catalogue to land: the trigger names
 * the picked model, so a pick the read has not delivered yet still shows the
 * placeholder.
 */
async function renderPicker(
  model: ModelSelection | null = null,
  settlesTo = "Pick a model",
): Promise<{ onPick: ReturnType<typeof vi.fn> }> {
  listProvidersMock.mockResolvedValue({ providers: [ALPHA, BETA] });
  vi.mocked(listUnifiedModels).mockResolvedValue([]);
  const onPick = vi.fn<(model: ModelSelection | null) => void>();
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
});
