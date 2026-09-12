import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { initI18n } from "@/lib/i18n";

import { compatFieldsFor } from "./compat-fields";
import { CompatJsonField } from "./CompatJsonField";

beforeAll(() => initI18n());
afterEach(cleanup);

describe("CompatJsonField", () => {
  it("keeps the override when valid JSON has the wrong field shape", () => {
    const descriptor = compatFieldsFor("openai-completions").find(
      (field) => field.kind === "json",
    );
    if (descriptor === undefined) throw new Error("Missing JSON compat field");
    const onChange = vi.fn();
    render(
      <CompatJsonField
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
