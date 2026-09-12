import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import i18next from "i18next";
import { useForm, type UseFormReturn, useWatch } from "react-hook-form";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  CompatSource,
  JsonValue,
  ProviderDraft,
  ResolvedCompat,
} from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";
import { resolveCompat } from "@/lib/ipc/providers";

import type {
  CompatFieldDescriptor,
  ProtocolFamily,
} from "../../components/compat/compat-fields";

import {
  compatFieldsFor,
  knownCompatFamilies,
} from "../../components/compat/compat-fields";
import {
  anthropicMessagesCompatSchema,
  openaiCompletionsCompatSchema,
  openaiResponsesCompatSchema,
  protocolFamilySchema,
} from "../../schemas/compat";
import {
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

beforeAll(initI18n);

afterEach(cleanup);

interface HostProps {
  draft: ProviderDraft;
  /** The family the panel configures; the switcher above it owns the choice. */
  family: ProtocolFamily;
}

function checkedIn(row: HTMLElement): null | string {
  return switchIn(row).getAttribute("aria-checked");
}

/** The form's compat map as the probe renders it; null when nothing is set. */
function compatOf(): unknown {
  const parsed: unknown = JSON.parse(screen.getByTestId("compat").textContent);
  return parsed;
}

function CompatProbe({ form }: { form: CompatForm }) {
  const compat = useWatch({ control: form.control, name: "compat" });
  // An unset map renders as `null`, so the probe's text is always JSON.
  return <output data-testid="compat">{JSON.stringify(compat ?? null)}</output>;
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
  const form = useForm<ProviderFormValues, unknown, ProviderFormSubmission>({
    defaultValues: toFormValues(draft),
  });
  return (
    <TooltipProvider>
      <ProviderCompatPanel family={family} form={form} />
      <CompatProbe form={form} />
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
      return 1;
    case "map":
      return {};
    case "select":
      return descriptor.options[0] ?? "";
    case "switch":
      return true;
  }
}

function switchIn(row: HTMLElement): HTMLElement {
  return within(row).getByRole("switch");
}

describe("provider compat panel", () => {
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

  it("writes an override and restores the default", async () => {
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

    fireEvent.click(
      within(row).getByRole("button", { name: "Restore default" }),
    );

    expect(compatOf()).toBeNull();
    const restored = fieldRow("openai-completions", "supportsStore");
    expect(
      within(restored).queryByRole("button", { name: "Restore default" }),
    ).toBeNull();
    // The row re-reads the merged value: the override is gone.
    await waitFor(() => {
      expect(checkedIn(restored)).toBe("true");
    });
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
