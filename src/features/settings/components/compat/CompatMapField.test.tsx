import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import i18next from "i18next";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { JsonValue } from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";

import { parseCellText } from "./compat-values";
import { CompatMapField } from "./CompatMapField";

beforeAll(initI18n);
afterEach(cleanup);

const LABEL = "Kwargs";

interface HostProps {
  /** This layer's saved override of the field. */
  baseline?: JsonValue | undefined;
  /** Effective values of the layers below. */
  inherited?: JsonValue | undefined;
  /** The own override the field opens with; later props do not reset it. */
  initial?: JsonValue | undefined;
  onEmit?: ((value: null | Record<string, JsonValue>) => void) | undefined;
}

/** The map's body rows, in the order the table shows them. */
function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").slice(1);
}

/** The field's own name plus one of its cell labels, as the editor writes them. */
function cellLabel(cell: string): string {
  return `${LABEL} ${label(cell)}`;
}

function hasRemoveButton(row: HTMLElement): boolean {
  return (
    within(row).queryByRole("button", {
      name: cellLabel("compatRemoveMapEntry"),
    }) !== null
  );
}

// The panel's own shape around the field: the emitted map comes back as the
// own value, so the echo a real parent produces is exercised too.
function Host({ baseline, inherited, initial, onEmit }: HostProps) {
  const [own, setOwn] = useState<JsonValue | undefined>(initial);
  return (
    <TooltipProvider>
      <CompatMapField
        baseline={baseline}
        inherited={inherited}
        label={LABEL}
        onChange={(next) => {
          setOwn(next ?? undefined);
          onEmit?.(next);
        }}
        value={own}
      />
      <output data-testid="own">{JSON.stringify(own ?? null)}</output>
    </TooltipProvider>
  );
}

function isMarkedInherited(row: HTMLElement): boolean {
  return within(row).queryByText(label("compatInherited")) !== null;
}

/** The key a row holds: this layer's rows hold it in an input, the rest as text. */
function keyOf(row: HTMLElement): string {
  const cell = row.querySelector("td");
  const input = cell?.querySelector("input");
  return input instanceof HTMLInputElement
    ? input.value
    : (cell?.textContent ?? "");
}

function label(key: string): string {
  return i18next.t(`settings.providers.${key}`);
}

/** The own override as the parent holds it; null when the field is unset. */
function ownMap(): unknown {
  const parsed: unknown = JSON.parse(screen.getByTestId("own").textContent);
  return parsed;
}

function rowAt(index: number): HTMLElement {
  const row = bodyRows()[index];
  if (row === undefined) {
    throw new Error(`the map has no row ${String(index)}`);
  }
  return row;
}

/** The body row holding `key`, wherever the table put it. */
function rowKeyed(key: string): HTMLElement {
  const row = bodyRows().find((entry) => keyOf(entry) === key);
  if (row === undefined) {
    throw new Error(`the map has no row for ${key}`);
  }
  return row;
}

function valueInputOf(row: HTMLElement): HTMLInputElement {
  return within(row).getByLabelText<HTMLInputElement>(
    cellLabel("compatMapValue"),
  );
}

function valueOf(row: HTMLElement): string {
  return within(row).getByLabelText<HTMLInputElement>(
    cellLabel("compatMapValue"),
  ).value;
}

/** Every map the field has handed the parent, in order. */
let emitted: (null | Record<string, JsonValue>)[] = [];

function renderHost(props: HostProps): ReturnType<typeof render> {
  emitted = [];
  return render(<Host {...props} onEmit={(value) => emitted.push(value)} />);
}

describe("the merged view of a compat map", () => {
  it("gives every key of both layers a row, this layer's own keys first", () => {
    renderHost({
      inherited: { budget: 100, enable_thinking: true },
      initial: { budget: 200 },
    });

    expect(bodyRows().map(keyOf)).toEqual(["budget", "enable_thinking"]);
    expect(valueOf(rowAt(0))).toBe("200");
    expect(valueOf(rowAt(1))).toBe("true");
  });

  it("shows a key both layers hold as the merge the request layer builds", () => {
    renderHost({
      inherited: { options: { a: 1, b: 2 } },
      initial: { options: { b: 3 } },
    });

    expect(parseCellText(valueOf(rowAt(0)))).toEqual({ a: 1, b: 3 });
  });

  it("marks a key only the layer below holds, without a key input or a remove button", () => {
    renderHost({ inherited: { budget: 100 }, initial: { marker: "x" } });

    const own = rowKeyed("marker");
    const inherited = rowKeyed("budget");
    expect(hasRemoveButton(own)).toBe(true);
    expect(isMarkedInherited(own)).toBe(false);
    // Renaming or clearing an inherited key here would leave the key below in
    // force with no row to show it, so the key is text and the row unremovable.
    expect(
      within(inherited).queryByLabelText<HTMLInputElement>(
        cellLabel("compatMapKey"),
      ),
    ).toBeNull();
    expect(hasRemoveButton(inherited)).toBe(false);
    expect(isMarkedInherited(inherited)).toBe(true);
  });

  it("turns a key of the layer below into this layer's override when its value is edited", () => {
    renderHost({ inherited: { budget: 100 } });

    const row = rowAt(0);
    fireEvent.change(valueInputOf(row), { target: { value: "250" } });

    expect(emitted).toEqual([{ budget: 250 }]);
    expect(ownMap()).toEqual({ budget: 250 });
    expect(
      within(row).getByLabelText<HTMLInputElement>(cellLabel("compatMapKey")),
    ).toHaveProperty("value", "budget");
    expect(hasRemoveButton(row)).toBe(true);
  });

  it("submits an untouched own row as the fragment it stores", () => {
    renderHost({
      inherited: { options: { a: 1, b: 2 } },
      initial: { marker: "x", options: { b: 3 } },
    });

    fireEvent.change(valueInputOf(rowKeyed("marker")), {
      target: { value: '"y"' },
    });

    // The options row was never touched: it stays the fragment it stores, not
    // the merged view it shows, and keeps following the layers below.
    expect(emitted).toEqual([{ marker: "y", options: { b: 3 } }]);
  });

  it("materialises an edited object cell as the view it was edited against", () => {
    renderHost({
      inherited: { options: { a: 1, b: 2 } },
      initial: { options: { b: 3 } },
    });
    // The cell opens on the merged view, not on this layer's fragment.
    expect(parseCellText(valueOf(rowAt(0)))).toEqual({ a: 1, b: 3 });

    fireEvent.change(valueInputOf(rowAt(0)), {
      target: { value: '{"a": 1, "b": 4}' },
    });

    expect(emitted).toEqual([{ options: { a: 1, b: 4 } }]);
  });

  it("clears an override whose key goes back to the value below", () => {
    renderHost({ inherited: { budget: 100 }, initial: { marker: "x" } });

    fireEvent.change(valueInputOf(rowKeyed("budget")), {
      target: { value: "250" },
    });
    expect(ownMap()).toEqual({ budget: 250, marker: "x" });
    expect(isMarkedInherited(rowKeyed("budget"))).toBe(false);

    fireEvent.change(valueInputOf(rowKeyed("budget")), {
      target: { value: "100" },
    });

    expect(emitted.at(-1)).toEqual({ marker: "x" });
    expect(isMarkedInherited(rowKeyed("budget"))).toBe(true);
  });

  it("keeps a saved override that repeats the layer below", () => {
    renderHost({
      baseline: { budget: 100 },
      inherited: { budget: 100 },
      initial: { budget: 100 },
    });

    fireEvent.change(valueInputOf(rowAt(0)), { target: { value: "250" } });
    fireEvent.change(valueInputOf(rowAt(0)), { target: { value: "100" } });

    // Back at its saved value the key keeps that representation, even though
    // the layer below resolves to the same value.
    expect(emitted.at(-1)).toEqual({ budget: 100 });
    expect(ownMap()).toEqual({ budget: 100 });
  });

  it("brings a deleted own key back as the layer below's row", () => {
    renderHost({ inherited: { budget: 100 }, initial: { budget: 200 } });

    fireEvent.click(
      within(rowAt(0)).getByRole("button", {
        name: cellLabel("compatRemoveMapEntry"),
      }),
    );

    expect(ownMap()).toBeNull();
    expect(isMarkedInherited(rowAt(0))).toBe(true);
    expect(valueOf(rowAt(0))).toBe("100");
  });

  it("drops a deleted key the layer below never held", () => {
    renderHost({ initial: { fresh: 1 } });

    fireEvent.click(
      within(rowAt(0)).getByRole("button", {
        name: cellLabel("compatRemoveMapEntry"),
      }),
    );

    expect(screen.queryByRole("table")).toBeNull();
    expect(ownMap()).toBeNull();
  });

  it("keeps the row a rename lands on, not the key's previous row", () => {
    renderHost({ inherited: { budget: 100 }, initial: { share: 7 } });

    fireEvent.change(
      within(rowKeyed("share")).getByLabelText<HTMLInputElement>(
        cellLabel("compatMapKey"),
      ),
      { target: { value: "budget" } },
    );

    expect(ownMap()).toEqual({ budget: 7 });
    expect(bodyRows().map(keyOf)).toEqual(["budget"]);
    expect(valueOf(rowKeyed("budget"))).toBe("7");
  });

  it("keeps the later of two rows naming the same key", () => {
    renderHost({ initial: { budget: 100 } });

    fireEvent.click(
      screen.getByRole("button", {
        name: `${LABEL} ${label("compatAddMapEntry")}`,
      }),
    );
    fireEvent.change(
      within(rowAt(1)).getByLabelText<HTMLInputElement>(
        cellLabel("compatMapKey"),
      ),
      { target: { value: "budget" } },
    );
    fireEvent.change(valueInputOf(rowKeyed("budget")), {
      target: { value: "250" },
    });

    expect(ownMap()).toEqual({ budget: 250 });
    expect(bodyRows().map(keyOf)).toEqual(["budget"]);
    expect(valueOf(rowKeyed("budget"))).toBe("250");
  });

  it("keeps a typed cell's text when the write comes back", () => {
    renderHost({ initial: { budget: 100 } });

    const cell = valueInputOf(rowAt(0));
    fireEvent.change(cell, { target: { value: "100.0" } });

    // The map holds the number; the cell keeps the text the user typed.
    expect(ownMap()).toEqual({ budget: 100 });
    expect(valueOf(rowAt(0))).toBe("100.0");
  });

  it("keeps a row whose key is still being typed when the layers below land", () => {
    const view = renderHost({});
    fireEvent.click(
      screen.getByRole("button", {
        name: `${LABEL} ${label("compatAddMapEntry")}`,
      }),
    );
    fireEvent.change(
      within(rowAt(0)).getByLabelText<HTMLInputElement>(
        cellLabel("compatMapKey"),
      ),
      { target: { value: "temperature" } },
    );

    // The resolve lands before the value is typed: the row is not this layer's
    // yet, but it is a row being composed here, and it stays.
    view.rerender(<Host inherited={{ budget: 100 }} />);

    expect(bodyRows().map(keyOf)).toEqual(["temperature", "budget"]);
    fireEvent.change(valueInputOf(rowAt(0)), { target: { value: "1" } });

    expect(ownMap()).toEqual({ temperature: 1 });
  });

  it("leaves a typed cell's text alone while another key resolves below", () => {
    const view = renderHost({ initial: { budget: 100 } });
    fireEvent.change(valueInputOf(rowAt(0)), { target: { value: "150.0" } });

    view.rerender(<Host inherited={{ limit: 5 }} />);

    expect(valueOf(rowAt(0))).toBe("150.0");
    expect(bodyRows().map(keyOf)).toEqual(["budget", "limit"]);
  });
});
