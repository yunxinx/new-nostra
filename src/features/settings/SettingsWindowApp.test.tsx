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

import type { Provider } from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";
import {
  listProviderPresets,
  listProviders,
  resolveCompat,
} from "@/lib/ipc/providers";

import { SettingsWindowApp } from "./SettingsWindowApp";

// The shell only orchestrates: both subpages and the draft form run for real
// against a mocked IPC boundary, so the guards are exercised through the same
// wiring a user drives.
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

// The theming shell (window background, derived tokens, matchMedia) is
// outside this harness; the navigation only consumes the boolean.
vi.mock("@/features/appearance/use-theme", () => ({ useTheme: () => false }));

const listProviderPresetsMock = vi.mocked(listProviderPresets);
const listProvidersMock = vi.mocked(listProviders);
const resolveCompatMock = vi.mocked(resolveCompat);

const STORED: Provider = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "sk-secret",
  baseUrl: "https://gateway.example/v1",
  enabled: true,
  id: "p1",
  maxRetries: 2,
  models: [{ apis: ["openai-completions"], id: "m1", reasoning: true }],
  name: "Upstream",
  reasoningOutput: "auto",
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 120_000,
};

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

beforeAll(initI18n);
beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.resetAllMocks();
  // The shell reveals its window on mount; the bridge answers exactly those
  // commands so an unexpected invoke fails the test instead of hanging.
  mockWindows("settings");
  mockIPC((command) => {
    if (
      command === "plugin:window|show" ||
      command === "plugin:window|set_focus"
    ) {
      return undefined;
    }
    throw new Error(`Unexpected IPC command: ${command}`);
  });
  listProviderPresetsMock.mockResolvedValue([]);
  listProvidersMock.mockResolvedValue({
    providers: [STORED],
  });
  resolveCompatMock.mockResolvedValue({ sources: {}, values: {} });
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  clearMocks();
  vi.unstubAllGlobals();
});

function clickNav(name: string): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

/** Marker of the model-list page: its search box is unique to it. */
function modelListMarker(): HTMLElement | null {
  return screen.queryByRole("searchbox", { name: "Search" });
}

/**
 * The name box, read with `hidden: true`: the dirty guard is a modal dialog,
 * and while it is up Radix marks the page behind it `aria-hidden`, so the
 * default query would not see the field it is asking about.
 */
function nameField(): HTMLElement {
  return screen.getByRole("textbox", { hidden: true, name: "Name" });
}

async function openProviders(): Promise<void> {
  clickNav("Providers");
  await screen.findByRole("button", { name: "Upstream" });
}

/** Marker of the provider page: its list column searches providers. */
function providersMarker(): HTMLElement | null {
  return screen.queryByRole("searchbox", { name: "Search providers" });
}

function renderWindow(): void {
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SettingsWindowApp />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/** Marker of the unified-models page: the create button is unique to it. */
function unifiedMarker(): HTMLElement | null {
  return screen.queryByRole("button", { name: "New unified model" });
}

describe("settings navigation", () => {
  it("keeps the catalogue a page of its own and the gateway its own group", () => {
    renderWindow();
    expect(screen.getByText("Model services")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Providers" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Model list" })).toBeTruthy();
    // The gateway is a group of its own: what it serves is a different
    // question from what exists to be served.
    expect(screen.getByText("Gateway", { selector: "p" })).toBeTruthy();
    const group = screen.getByRole("button", { name: "Gateway" });
    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Unified models" })).toBeTruthy();
  });

  it("collapses the gateway group without losing the page its child holds", async () => {
    renderWindow();
    clickNav("Unified models");
    await screen.findByRole("button", { name: "New unified model" });

    clickNav("Gateway");

    // The children are hidden, so the group row carries the selection.
    expect(screen.queryByRole("button", { name: "Unified models" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Gateway" })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(unifiedMarker()).toBeTruthy();
  });

  it("expands an unvisited group without entering its first subpage", () => {
    renderWindow();
    clickNav("Gateway");
    expect(screen.queryByRole("button", { name: "Unified models" })).toBeNull();

    clickNav("Gateway");

    // Toggling a group is not a navigation: its children appear, but none is
    // selected and the content column keeps the page it was showing.
    expect(
      screen
        .getByRole("button", { name: "Unified models" })
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(unifiedMarker()).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "General" })
        .getAttribute("aria-current"),
    ).toBe("true");
  });

  it("switches from the provider page to the model list", async () => {
    renderWindow();
    await openProviders();
    expect(providersMarker()).toBeTruthy();

    clickNav("Model list");

    await screen.findByRole("searchbox", { name: "Search" });
    expect(providersMarker()).toBeNull();
  });

  it("switches to the unified-models subpage", async () => {
    renderWindow();
    clickNav("Unified models");

    expect(
      await screen.findByRole("button", { name: "New unified model" }),
    ).toBeTruthy();
    expect(modelListMarker()).toBeNull();
  });
});

describe("navigation away from the provider draft", () => {
  it("holds the switch until the dirty draft is confirmed for discard", async () => {
    renderWindow();
    await openProviders();
    fireEvent.click(screen.getByRole("button", { name: "Upstream" }));
    fireEvent.change(nameField(), { target: { value: "Edited" } });

    clickNav("Model list");

    // The switch is held on the page that owns the draft, which stays usable.
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(nameField()).toHaveProperty("value", "Edited");
    expect(modelListMarker()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    await screen.findByRole("searchbox", { name: "Search" });
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  });

  it("keeps the draft and the page when the parked switch is cancelled", async () => {
    renderWindow();
    await openProviders();
    fireEvent.click(screen.getByRole("button", { name: "Upstream" }));
    fireEvent.change(nameField(), { target: { value: "Edited" } });

    clickNav("Model list");
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(providersMarker()).toBeTruthy();
    expect(nameField()).toHaveProperty("value", "Edited");

    // The cancelled request is gone: the same target switches without a
    // second notice once the draft is clean.
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    clickNav("Model list");
    await screen.findByRole("searchbox", { name: "Search" });
  });

  it("leaves a clean provider draft without a notice", async () => {
    renderWindow();
    await openProviders();
    fireEvent.click(screen.getByRole("button", { name: "Upstream" }));

    clickNav("Model list");

    await screen.findByRole("searchbox", { name: "Search" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps the parked in-page action when the guard is cancelled", async () => {
    renderWindow();
    await openProviders();
    fireEvent.click(screen.getByRole("button", { name: "Upstream" }));
    fireEvent.change(nameField(), { target: { value: "Edited" } });

    // A row action parks first: the guard is up over the page.
    fireEvent.click(screen.getByRole("button", { name: "Upstream" }));
    await screen.findByRole("alertdialog");

    // Cancelling it leaves the draft and the page as they were, so the same
    // action can be taken again — or dropped by discarding the draft.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(nameField()).toHaveProperty("value", "Edited");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    clickNav("Model list");
    await screen.findByRole("searchbox", { name: "Search" });
    expect(providersMarker()).toBeNull();
  });
});
