import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import i18next from "i18next";
import { useMemo, useState } from "react";
import { useForm, type UseFormReturn, useWatch } from "react-hook-form";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  CompatBuckets,
  CompatSource,
  JsonValue,
  ProviderDraft,
  ResolvedCompat,
} from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";
import { resolveCompat } from "@/lib/ipc/providers";

import type { CompatInputDrafts } from "../../components/compat/compat-draft";
import type {
  CompatFieldDescriptor,
  ProtocolFamily,
} from "../../components/compat/compat-fields";

import { changedCompatCount } from "../../components/compat/compat-draft";
import {
  compatFieldsFor,
  knownCompatFamilies,
} from "../../components/compat/compat-fields";
import { storedBuckets } from "../../components/compat/compat-values";
import { useCompatResolution } from "../../components/compat/use-compat-resolution";
import {
  anthropicMessagesCompatSchema,
  openaiCompletionsCompatSchema,
  openaiResponsesCompatSchema,
  protocolFamilySchema,
} from "../../schemas/compat";
import {
  BLANK_PROVIDER_DRAFT,
  type ProviderFormSubmission,
  type ProviderFormValues,
  toFormValues,
} from "../draft";
import { ProviderCompatPanel } from "./ProviderCompatPanel";

vi.mock("@/lib/ipc/providers", () => ({ resolveCompat: vi.fn() }));

const resolveCompatMock = vi.mocked(resolveCompat);

// The field set the panel must cover, straight from the schemas: a compat field
// added there has to reach the panel with a control of its kind.
const SHAPES = {
  "anthropic-messages": anthropicMessagesCompatSchema.shape,
  "openai-completions": openaiCompletionsCompatSchema.shape,
  "openai-responses": openaiResponsesCompatSchema.shape,
};

type CompatForm = UseFormReturn<
  ProviderFormValues,
  unknown,
  ProviderFormSubmission
>;

const BASE: ProviderDraft = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "",
  baseUrl: "https://gateway.example/v1",
  enabled: true,
  maxRetries: 2,
  name: "Gateway",
  reasoningOutput: "auto",
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 120_000,
};

const RESOLUTIONS: Record<ProtocolFamily, ResolvedCompat> = {
  "anthropic-messages": resolutionOf("anthropic-messages"),
  "openai-completions": resolutionOf("openai-completions"),
  "openai-responses": resolutionOf("openai-responses"),
};

beforeAll(() => {
  initI18n();
  // The select's pointer handlers and item highlighting reach for the
  // pointer-capture and scrolling APIs jsdom does not implement.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.setPointerCapture = () => undefined;
});

afterEach(cleanup);

interface HostProps {
  draft: ProviderDraft;
  /** The family the panel configures; the switcher above it owns the choice. */
  family: ProtocolFamily;
}

/** The draft's change count, derived the way the controllers derive theirs. */
function changedCount(): number {
  return Number(screen.getByTestId("changed").textContent);
}

function checkedIn(row: HTMLElement): null | string {
  return switchIn(row).getAttribute("aria-checked");
}

/** The form's compat map as the probe renders it; null when nothing is set. */
function compatOf(): unknown {
  const parsed: unknown = JSON.parse(screen.getByTestId("compat").textContent);
  return parsed;
}

function CompatProbe({
  baseline,
  form,
  inputs,
}: {
  baseline: CompatBuckets | undefined;
  form: CompatForm;
  inputs: CompatInputDrafts;
}) {
  const compat = useWatch({ control: form.control, name: "compat" });
  const stored = storedBuckets(compat);
  // An unset map renders as `null`, so the probe's text is always JSON.
  return (
    <>
      <output data-testid="compat">{JSON.stringify(compat ?? null)}</output>
      <output data-testid="stored">{JSON.stringify(stored ?? null)}</output>
      <output data-testid="changed">
        {changedCompatCount(baseline, stored, inputs)}
      </output>
    </>
  );
}

function familyLabel(family: ProtocolFamily): string {
  return i18next.t(`settings.providers.protocols.${family}`);
}

function familySection(family: ProtocolFamily): HTMLElement {
  return screen.getByRole("group", { name: familyLabel(family) });
}

function fieldLabel(field: string): string {
  return i18next.t(`settings.providers.compatFields.${field}`);
}

function fieldRow(family: ProtocolFamily, field: string): HTMLElement {
  return within(familySection(family)).getByRole("group", {
    name: fieldLabel(field),
  });
}

// The panel over a real form plus a probe that renders the current compat map,
// so the tests read what the panel wrote without reaching into the form.
function Host({ draft, family }: HostProps) {
  const [inputs, setInputs] = useState<CompatInputDrafts>({});
  const form = useForm<ProviderFormValues, unknown, ProviderFormSubmission>({
    defaultValues: toFormValues(draft),
  });
  const baseUrl = useWatch({ control: form.control, name: "baseUrl" });
  const input = useMemo(
    () => ({ provider: { ...BLANK_PROVIDER_DRAFT, baseUrl } }),
    [baseUrl],
  );
  const resolution = useCompatResolution([family], input);
  return (
    <TooltipProvider>
      <ProviderCompatPanel
        baseline={draft.compat}
        family={family}
        form={form}
        inputs={inputs}
        onInputsChange={setInputs}
        resolution={resolution}
      />
      <CompatProbe baseline={draft.compat} form={form} inputs={inputs} />
    </TooltipProvider>
  );
}

function renderHost(props: HostProps): ReturnType<typeof render> {
  resolveCompatMock.mockImplementation((params) =>
    Promise.resolve(resolutionFor(params.protocol)),
  );
  return render(<Host {...props} />);
}

function resolutionFor(protocol: string): ResolvedCompat {
  const family = knownCompatFamilies([protocol])[0];
  if (family === undefined) {
    throw new Error(`unexpected protocol ${protocol}`);
  }
  return RESOLUTIONS[family];
}

function resolutionOf(family: ProtocolFamily): ResolvedCompat {
  const values: Record<string, JsonValue> = {};
  const sources: Record<string, CompatSource> = {};
  for (const descriptor of compatFieldsFor(family)) {
    values[descriptor.name] = sampleValue(descriptor);
    sources[descriptor.name] = "familyDefault";
  }
  return { sources, values };
}

/** A value of the field's kind, enough to render its control in any case. */
function sampleValue(descriptor: CompatFieldDescriptor): JsonValue {
  switch (descriptor.kind) {
    case "json":
    case "list":
      return 1;
    case "map":
      return {};
    case "select":
      return descriptor.options[0] ?? "";
    case "switch":
      return true;
  }
}

/** The map's wire shape: what a save submits, and what a re-read decodes. */
function storedOf(): unknown {
  const parsed: unknown = JSON.parse(screen.getByTestId("stored").textContent);
  return parsed;
}

function switchIn(row: HTMLElement): HTMLElement {
  return within(row).getByRole("switch");
}

/** The well the field's table scrolls inside, whose height is its row count. */
function wellOf(row: HTMLElement): HTMLElement {
  const well = row.querySelector(
    '[data-slot="table-container"]',
  )?.parentElement;
  if (!(well instanceof HTMLElement)) {
    throw new Error("the row holds no table");
  }
  return well;
}

describe("provider compat panel", () => {
  it("shows asynchronous map defaults and inherits after clearing a JSON override", async () => {
    resolveCompatMock.mockImplementation(({ provider }) =>
      Promise.resolve({
        sources: {
          openRouterRouting: "familyDefault",
          vllmPriority: "familyDefault",
        },
        values: {
          openRouterRouting: { order: ["first"] },
          vllmPriority:
            provider.compat?.["openai-completions"]?.vllmPriority ?? 3,
        },
      }),
    );
    render(
      <Host
        draft={{
          ...BASE,
          compat: { "openai-completions": { vllmPriority: 7 } },
        }}
        family="openai-completions"
      />,
    );
    await waitFor(() =>
      // The map inherits the resolved keys as rows named by their keys.
      expect(
        within(fieldRow("openai-completions", "openRouterRouting")).getByText(
          "order",
        ),
      ).toBeTruthy(),
    );
    const priority = fieldRow("openai-completions", "vllmPriority");
    expect(within(priority).getByRole("textbox")).toHaveProperty("value", "7");
    const input = within(priority).getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(
        within(fieldRow("openai-completions", "vllmPriority")).getByRole(
          "textbox",
        ),
      ).toHaveProperty("value", "3"),
    );
    expect(compatOf()).toBeNull();
  });

  it("renders a control of its kind for every field of its family", async () => {
    for (const family of protocolFamilySchema.options) {
      const view = renderHost({ draft: BASE, family });
      await screen.findByRole("group", { name: familyLabel(family) });

      const descriptors = new Map(
        compatFieldsFor(family).map((descriptor) => [
          descriptor.name,
          descriptor,
        ]),
      );
      for (const field of Object.keys(SHAPES[family])) {
        const descriptor = descriptors.get(field);
        expect(
          descriptor,
          `${family}.${field} has no descriptor`,
        ).toBeDefined();
        if (descriptor === undefined) {
          continue;
        }
        const row = fieldRow(family, field);
        switch (descriptor.kind) {
          case "json":
          case "list":
            expect(within(row).getByRole("textbox")).toBeTruthy();
            break;
          case "map":
            expect(
              within(row).getByRole("button", {
                name: `${fieldLabel(field)} ${i18next.t("settings.providers.compatAddMapEntry")}`,
              }),
            ).toBeTruthy();
            break;
          case "select":
            expect(within(row).getByRole("combobox")).toBeTruthy();
            break;
          case "switch":
            expect(switchIn(row)).toBeTruthy();
            break;
        }
      }
      view.unmount();
    }
  });

  it("resolves the family it is given and shows its provenance", async () => {
    renderHost({ draft: BASE, family: "anthropic-messages" });

    const section = await screen.findByRole("group", {
      name: familyLabel("anthropic-messages"),
    });
    // Editable overrides are already in the draft; only the lower layers resolve.
    await waitFor(() => {
      expect(resolveCompatMock).toHaveBeenCalledTimes(1);
    });
    const params = resolveCompatMock.mock.calls[0]?.[0];
    expect(params?.protocol).toBe("anthropic-messages");
    expect(params?.provider.baseUrl).toBe(BASE.baseUrl);
    expect(params?.model).toBeUndefined();
    // The resolved provenance reaches the row.
    await waitFor(() => {
      expect(within(section).getAllByText("Family default").length).toBe(
        compatFieldsFor("anthropic-messages").length,
      );
    });
  });

  it("offers one saved-value undo after changing an inherited value", async () => {
    renderHost({ draft: BASE, family: "openai-completions" });
    await screen.findByRole("group", {
      name: familyLabel("openai-completions"),
    });
    const row = fieldRow("openai-completions", "supportsStore");

    // The resolved default drives the switch until it is overridden.
    await waitFor(() => {
      expect(checkedIn(row)).toBe("true");
    });
    fireEvent.click(switchIn(row));

    expect(compatOf()).toEqual({
      "openai-completions": { supportsStore: false },
    });
    expect(checkedIn(row)).toBe("false");
    expect(
      within(row).getAllByRole("button", { name: /^Restore/ }),
    ).toHaveLength(1);

    fireEvent.click(
      within(row).getByRole("button", { name: "Restore the saved value" }),
    );

    expect(compatOf()).toBeNull();
    const restored = fieldRow("openai-completions", "supportsStore");
    expect(
      within(restored).queryByRole("button", {
        name: "Restore the saved value",
      }),
    ).toBeNull();
    // The row re-reads the merged value: the override is gone.
    await waitFor(() => {
      expect(checkedIn(restored)).toBe("true");
    });
  });

  it("keeps a saved override through a switch round trip even when it repeats the default", async () => {
    // What a preset leaves behind: the document carries the value, and the
    // vendor layer below it resolves to the same one.
    renderHost({
      draft: {
        ...BASE,
        compat: { "openai-completions": { supportsStore: true } },
      },
      family: "openai-completions",
    });
    const row = await screen.findByRole("group", {
      name: fieldLabel("supportsStore"),
    });

    await waitFor(() => {
      expect(checkedIn(row)).toBe("true");
    });
    expect(within(row).queryByRole("button", { name: /^Restore/ })).toBeNull();
    fireEvent.click(switchIn(row));
    expect(
      within(row).getAllByRole("button", { name: /^Restore/ }),
    ).toHaveLength(1);
    fireEvent.click(switchIn(row));
    expect(within(row).queryByRole("button", { name: /^Restore/ })).toBeNull();
    expect(compatOf()).toEqual({
      "openai-completions": { supportsStore: true },
    });
  });

  it("names a map field once, above its own table", async () => {
    renderHost({ draft: BASE, family: "openai-completions" });
    const row = await screen.findByRole("group", {
      name: fieldLabel("chatTemplateKwargs"),
    });

    // The key/value table names and describes itself, so the row around it
    // must not name the field a second time.
    expect(
      within(row).getAllByText(fieldLabel("chatTemplateKwargs")),
    ).toHaveLength(1);
  });

  it("writes a map entry with its cell parsed as JSON", async () => {
    renderHost({ draft: BASE, family: "openai-completions" });
    const row = await screen.findByRole("group", {
      name: fieldLabel("chatTemplateKwargs"),
    });

    fireEvent.click(
      within(row).getByRole("button", {
        name: `${fieldLabel("chatTemplateKwargs")} ${i18next.t("settings.providers.compatAddMapEntry")}`,
      }),
    );
    fireEvent.change(
      within(row).getByLabelText(`${fieldLabel("chatTemplateKwargs")} Key`),
      { target: { value: "temperature" } },
    );
    fireEvent.change(
      within(row).getByLabelText(`${fieldLabel("chatTemplateKwargs")} Value`),
      { target: { value: "1" } },
    );

    expect(compatOf()).toEqual({
      "openai-completions": { chatTemplateKwargs: { temperature: 1 } },
    });
  });

  it("grows a map's table from its first row to the height it was designed for", async () => {
    renderHost({ draft: BASE, family: "openai-completions" });
    const row = await screen.findByRole("group", {
      name: fieldLabel("chatTemplateKwargs"),
    });
    const add = within(row).getByRole("button", {
      name: `${fieldLabel("chatTemplateKwargs")} ${i18next.t("settings.providers.compatAddMapEntry")}`,
    });

    // An empty map is the heading alone: a well holding no rows says nothing.
    expect(within(row).queryByRole("table")).toBeNull();

    const heights: string[] = [];
    for (let count = 1; count <= 6; count += 1) {
      fireEvent.click(add);
      heights.push(wellOf(row).style.height);
    }
    // Every row up to the fifth makes the well taller, the way a table the
    // size of its own rows does; the sixth leaves it where it is and scrolls
    // inside it instead.
    expect(new Set(heights.slice(0, 5)).size).toBe(5);
    expect(heights[5]).toBe(heights[4]);
  });

  it("keeps an invalid JSON text out of the draft and reports it", async () => {
    renderHost({ draft: BASE, family: "anthropic-messages" });
    const row = await screen.findByRole("group", {
      name: fieldLabel("allowedFallbackModels"),
    });
    const box = within(row).getByRole("textbox");

    fireEvent.change(box, { target: { value: "[{oops" } });
    fireEvent.blur(box);

    expect(within(row).getByRole("alert").textContent).toBe("Invalid JSON");
    expect(compatOf()).toBeNull();

    fireEvent.change(box, {
      target: {
        value:
          '[{"provider":"anthropic","model":"claude-fable-5-1","cost":{"input":1,"output":2,"cacheRead":0,"cacheWrite":0}}]',
      },
    });
    fireEvent.blur(box);

    expect(within(row).queryByRole("alert")).toBeNull();
    expect(compatOf()).toEqual({
      "anthropic-messages": {
        allowedFallbackModels: [
          {
            cost: { cacheRead: 0, cacheWrite: 0, input: 1, output: 2 },
            model: "claude-fable-5-1",
            provider: "anthropic",
          },
        ],
      },
    });
  });

  it("writes only the bucket of the family it is given", async () => {
    const { rerender } = renderHost({
      draft: BASE,
      family: "openai-completions",
    });
    const store = await screen.findByRole("group", {
      name: fieldLabel("supportsStore"),
    });
    fireEvent.click(switchIn(store));
    expect(compatOf()).toEqual({
      "openai-completions": { supportsStore: false },
    });

    rerender(<Host draft={BASE} family="anthropic-messages" />);

    await waitFor(() => {
      expect(
        screen.queryByRole("group", { name: fieldLabel("supportsStore") }),
      ).toBeNull();
    });
    expect(
      screen.getByRole("group", { name: fieldLabel("supportsTemperature") }),
    ).toBeTruthy();
    expect(compatOf()).toEqual({
      "openai-completions": { supportsStore: false },
    });
  });
});

describe("the unset entry of a select field", () => {
  /** A family without resolved defaults: only the draft's own writes show. */
  function renderBareHost(draft: ProviderDraft): void {
    resolveCompatMock.mockImplementation(() =>
      Promise.resolve({ sources: {}, values: {} }),
    );
    render(<Host draft={draft} family="openai-completions" />);
  }

  function selectIn(field: string): HTMLElement {
    return within(fieldRow("openai-completions", field)).getByRole("combobox");
  }

  function openSelect(field: string): void {
    fireEvent.click(selectIn(field));
  }

  /** Picks an entry from the open list; it lives in a portal on the body. */
  function pick(entry: string): void {
    fireEvent.click(screen.getByRole("option", { name: entry }));
  }

  it("round-trips a value through unset", async () => {
    renderBareHost(BASE);
    await screen.findByRole("group", {
      name: fieldLabel("cacheControlFormat"),
    });
    expect(selectIn("cacheControlFormat").textContent).toContain(
      i18next.t("settings.providers.compatUnset"),
    );

    openSelect("cacheControlFormat");
    pick("anthropic");
    expect(compatOf()).toEqual({
      "openai-completions": { cacheControlFormat: "anthropic" },
    });
    expect(changedCount()).toBe(1);

    openSelect("cacheControlFormat");
    pick(i18next.t("settings.providers.compatUnset"));
    expect(compatOf()).toBeNull();
    // The key leaves the wire shape, so a save stores the field unset and a
    // re-read opens it unset again.
    expect(storedOf()).toBeNull();
    expect(changedCount()).toBe(0);
    expect(selectIn("cacheControlFormat").textContent).toContain(
      i18next.t("settings.providers.compatUnset"),
    );

    openSelect("cacheControlFormat");
    pick("anthropic");
    expect(compatOf()).toEqual({
      "openai-completions": { cacheControlFormat: "anthropic" },
    });
  });

  it("treats picking unset on an unset field as a no-op", async () => {
    renderBareHost(BASE);
    await screen.findByRole("group", {
      name: fieldLabel("cacheControlFormat"),
    });

    openSelect("cacheControlFormat");
    pick(i18next.t("settings.providers.compatUnset"));

    expect(compatOf()).toBeNull();
    expect(storedOf()).toBeNull();
    expect(changedCount()).toBe(0);
    expect(
      within(fieldRow("openai-completions", "cacheControlFormat")).queryByRole(
        "button",
        { name: i18next.t("common.revertField") },
      ),
    ).toBeNull();
  });

  it("clears an override back to the inherited value and its provenance", async () => {
    renderHost({
      draft: {
        ...BASE,
        compat: { "openai-completions": { cacheControlFormat: "anthropic" } },
      },
      family: "openai-completions",
    });
    await screen.findByRole("group", {
      name: fieldLabel("cacheControlFormat"),
    });
    expect(
      within(fieldRow("openai-completions", "cacheControlFormat")).getByText(
        "Provider",
      ),
    ).toBeTruthy();

    openSelect("cacheControlFormat");
    pick(i18next.t("settings.providers.compatUnset"));

    expect(compatOf()).toBeNull();
    expect(changedCount()).toBe(1);
    // The resolved default owns the value again, tag included.
    await waitFor(() => {
      expect(
        within(fieldRow("openai-completions", "cacheControlFormat")).getByText(
          "Family default",
        ),
      ).toBeTruthy();
    });
    expect(selectIn("cacheControlFormat").textContent).toContain("anthropic");

    fireEvent.click(
      within(fieldRow("openai-completions", "cacheControlFormat")).getByRole(
        "button",
        { name: i18next.t("common.revertField") },
      ),
    );
    expect(compatOf()).toEqual({
      "openai-completions": { cacheControlFormat: "anthropic" },
    });
    expect(changedCount()).toBe(0);
  });
});

describe("the merged view of a map field", () => {
  const FIELD = "chatTemplateKwargs";

  function mapCell(cell: string): string {
    return `${fieldLabel(FIELD)} ${i18next.t(`settings.providers.${cell}`)}`;
  }

  /** The resolution the panel reads: one map field over an empty lower layer. */
  function resolveMap(values: Record<string, JsonValue>): void {
    resolveCompatMock.mockImplementation(() =>
      Promise.resolve({
        sources: { chatTemplateKwargs: "vendor" },
        values: { chatTemplateKwargs: values },
      }),
    );
  }

  /** The body row of the map field whose key reads as `key`, own or inherited. */
  function keyedRow(key: string): HTMLElement {
    const rows = within(fieldRow("openai-completions", FIELD))
      .getAllByRole("row")
      .slice(1);
    const row = rows.find((entry) => {
      const cell = entry.querySelector("td");
      return (
        cell?.querySelector("input")?.value === key || cell?.textContent === key
      );
    });
    if (row === undefined) {
      throw new Error(`the map holds no row for ${key}`);
    }
    return row;
  }

  function draftWith(map: Record<string, JsonValue>): ProviderDraft {
    return {
      ...BASE,
      compat: { "openai-completions": { chatTemplateKwargs: map } },
    };
  }

  /** The panel over a draft of its own, with `resolveMap`'s answer in place. */
  function renderMapHost(draft: ProviderDraft): ReturnType<typeof render> {
    return render(<Host draft={draft} family="openai-completions" />);
  }

  it("shows a partly overridden key with its effective value and submits only this layer's keys", async () => {
    resolveMap({ budget: 100, enable_thinking: true });
    renderMapHost(draftWith({ budget: 200 }));
    await screen.findByRole("group", { name: fieldLabel(FIELD) });
    await waitFor(() => {
      expect(
        within(keyedRow("enable_thinking")).getByText(
          i18next.t("settings.providers.compatInherited"),
        ),
      ).toBeTruthy();
    });

    // The inherited row shows the layers below and reads its key as text; the
    // budget row is this layer's own and keeps the value it stores.
    expect(within(keyedRow("budget")).getByDisplayValue("200")).toBeTruthy();
    expect(
      within(keyedRow("enable_thinking")).queryByDisplayValue(
        "enable_thinking",
      ),
    ).toBeNull();

    fireEvent.change(within(keyedRow("enable_thinking")).getByRole("textbox"), {
      target: { value: "false" },
    });

    // The payload carries this layer's keys alone, and the inherited override
    // counts as one change.
    expect(compatOf()).toEqual({
      "openai-completions": {
        chatTemplateKwargs: { budget: 200, enable_thinking: false },
      },
    });
    expect(changedCount()).toBe(1);
  });

  it("brings a deleted own key back as the layer below's row", async () => {
    resolveMap({ budget: 100, enable_thinking: true });
    renderMapHost(draftWith({ budget: 200 }));
    await screen.findByRole("group", { name: fieldLabel(FIELD) });
    await waitFor(() => {
      expect(
        within(keyedRow("enable_thinking")).getByText(
          i18next.t("settings.providers.compatInherited"),
        ),
      ).toBeTruthy();
    });

    fireEvent.click(
      within(keyedRow("budget")).getByRole("button", {
        name: mapCell("compatRemoveMapEntry"),
      }),
    );

    // The key is still in force below: its row stays, showing that value.
    expect(within(keyedRow("budget")).getByDisplayValue("100")).toBeTruthy();
    expect(
      within(keyedRow("budget")).getByText(
        i18next.t("settings.providers.compatInherited"),
      ),
    ).toBeTruthy();
    expect(compatOf()).toBeNull();
  });

  it("keeps a row still being typed when the resolve lands underneath it", async () => {
    let land: (resolution: ResolvedCompat) => void = () => undefined;
    resolveCompatMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = resolve;
        }),
    );
    render(<Host draft={BASE} family="openai-completions" />);
    const row = await screen.findByRole("group", { name: fieldLabel(FIELD) });

    // A row is added and its key typed; the value is still to come.
    fireEvent.click(
      within(row).getByRole("button", { name: mapCell("compatAddMapEntry") }),
    );
    const keyCell = within(row).getByLabelText(mapCell("compatMapKey"));
    fireEvent.change(keyCell, { target: { value: "temperature" } });
    const composing = keyCell.closest("tr");
    if (composing === null) {
      throw new Error("the row left its table");
    }

    await waitFor(() => {
      expect(resolveCompatMock).toHaveBeenCalled();
    });
    await act(async () => {
      land({
        sources: { chatTemplateKwargs: "vendor" },
        values: { chatTemplateKwargs: { budget: 100 } },
      });
      // Let the panel read the resolution inside this act pass.
      await Promise.resolve();
    });

    // The resolve adds its own key; the row being composed stays put.
    await waitFor(() => {
      expect(
        within(keyedRow("budget")).getByText(
          i18next.t("settings.providers.compatInherited"),
        ),
      ).toBeTruthy();
    });
    expect(
      within(composing).getByLabelText(mapCell("compatMapKey")),
    ).toHaveProperty("value", "temperature");

    // Finishing the row makes it this layer's own override.
    fireEvent.change(
      within(composing).getByLabelText(mapCell("compatMapValue")),
      {
        target: { value: "1" },
      },
    );
    expect(compatOf()).toEqual({
      "openai-completions": { chatTemplateKwargs: { temperature: 1 } },
    });
  });
});
