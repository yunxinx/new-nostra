import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ModelCost } from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";

import { costDraftRows } from "../cost-draft";
import { ModelCostEditor } from "./ModelCostEditor";

const COST: ModelCost = {
  cacheRead: 0,
  cacheWrite: 0,
  input: 1,
  output: 1,
  tiers: [
    { cacheRead: 0, cacheWrite: 0, input: 2, inputTokensAbove: 100, output: 2 },
    { cacheRead: 0, cacheWrite: 0, input: 5, inputTokensAbove: 200, output: 5 },
  ],
};

beforeAll(initI18n);
afterEach(cleanup);

function tierRow(threshold: string): HTMLElement {
  const row = screen.getByDisplayValue(threshold).closest("tr");
  if (row === null) throw new Error("Missing price tier");
  return row;
}

describe("price tier identity", () => {
  it("clears revert actions when rate edits return to the same numeric value", () => {
    function Host() {
      const [rows, setRows] = useState(() => costDraftRows(COST));
      return (
        <TooltipProvider>
          <ModelCostEditor
            baseline={COST}
            onChange={() => undefined}
            onRowsChange={setRows}
            rows={rows}
          />
        </TooltipProvider>
      );
    }
    render(<Host />);
    const rate = screen.getAllByRole("textbox")[0];
    if (rate === undefined) throw new Error("Missing base rate");
    fireEvent.change(rate, { target: { value: "2" } });
    expect(
      screen.getAllByRole("button", { name: "Restore the saved value" }),
    ).toHaveLength(2);
    fireEvent.change(rate, { target: { value: "1.0" } });
    expect(
      screen.queryByRole("button", { name: "Restore the saved value" }),
    ).toBeNull();
  });

  it("retains the saved rate after deleting another tier and remounting", () => {
    const onChange = vi.fn();
    function Host() {
      const [rows, setRows] = useState(() => costDraftRows(COST));
      const [isOpen, setIsOpen] = useState(true);
      return (
        <TooltipProvider>
          <button onClick={() => setIsOpen((open) => !open)}>
            Toggle editor
          </button>
          {isOpen && (
            <ModelCostEditor
              baseline={COST}
              onChange={onChange}
              onRowsChange={setRows}
              rows={rows}
            />
          )}
        </TooltipProvider>
      );
    }
    render(<Host />);
    fireEvent.click(
      within(tierRow("100")).getByRole("button", { name: /remove/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle editor" }));
    const remaining = tierRow("200");
    const rate = within(remaining).getAllByRole("textbox")[1];
    if (rate === undefined) throw new Error("Missing input rate");
    fireEvent.change(rate, { target: { value: "9" } });
    fireEvent.click(
      within(remaining).getByRole("button", {
        name: "Restore the saved value",
      }),
    );
    expect(rate).toHaveProperty("value", "5");
    expect(onChange).toHaveBeenLastCalledWith({
      ...COST,
      tiers: [COST.tiers?.[1]],
    });
  });
});
