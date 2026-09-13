import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { initI18n } from "@/lib/i18n";

import type { CompatInputDraft } from "./compat-draft";

import { compatFieldsFor } from "./compat-fields";
import { CompatJsonField } from "./CompatJsonField";

beforeAll(() => initI18n());
afterEach(cleanup);

function Host(
  props: Omit<
    ComponentProps<typeof CompatJsonField>,
    "input" | "onInputChange"
  >,
) {
  const [input, setInput] = useState<CompatInputDraft>();
  return <CompatJsonField {...props} input={input} onInputChange={setInput} />;
}

describe("CompatJsonField", () => {
  it("follows asynchronous values while preserving invalid input", () => {
    const parseValue = (value: unknown) =>
      typeof value === "number" ? value : null;
    const onChange = vi.fn();
    const view = render(
      <Host
        kind="json"
        label="Override"
        onChange={onChange}
        parseValue={parseValue}
        value={undefined}
      />,
    );
    view.rerender(
      <Host
        kind="json"
        label="Override"
        onChange={onChange}
        parseValue={parseValue}
        value={7}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Override" })).toHaveProperty(
      "value",
      "7",
    );
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Override" }), {
      target: { value: "oops" },
    });
    view.rerender(
      <Host
        kind="json"
        label="Override"
        onChange={onChange}
        parseValue={parseValue}
        value={9}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Override" })).toHaveProperty(
      "value",
      "oops",
    );
  });

  it("keeps the override when valid JSON has the wrong field shape", () => {
    const descriptor = compatFieldsFor("openai-completions").find(
      (field) => field.kind === "json",
    );
    if (descriptor === undefined) throw new Error("Missing JSON compat field");
    const onChange = vi.fn();
    render(
      <Host
        kind="json"
        label="Override"
        onChange={onChange}
        parseValue={descriptor.parseValue}
        value={undefined}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Override" });
    fireEvent.change(input, { target: { value: "true" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(input, { target: { value: "null" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
