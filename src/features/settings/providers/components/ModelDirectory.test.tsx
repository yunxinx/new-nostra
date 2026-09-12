import type { Mock } from "vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ModelEntry } from "@/types/ipc";

import { initI18n } from "@/lib/i18n";

import { modelDraftRows } from "../model-draft";
import { ModelDirectory } from "./ModelDirectory";

beforeAll(initI18n);
afterEach(cleanup);

const MODELS: ModelEntry[] = [
  {
    apis: ["openai-completions"],
    id: "gpt-4o",
    name: "GPT-4o",
    reasoning: false,
  },
  { apis: ["anthropic-messages"], id: "claude-sonnet", reasoning: true },
  { id: "llama-3", reasoning: false },
];

interface Harness {
  onModelsChange: Mock<(models: ModelEntry[]) => void>;
  onOpenModel: Mock<(index: number) => void>;
}

/** Row cells of the rendered table, header row excluded. */
function bodyRows(): Array<Array<null | string>> {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent),
    );
}

async function pickRowAction(row: number, name: string): Promise<void> {
  const triggers = screen.getAllByRole("button", { name: "Model actions" });
  fireEvent.pointerDown(triggers[row] ?? document.body, {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.pointerUp(await screen.findByRole("menuitem", { name }));
}

function renderDirectory(models: ModelEntry[] = MODELS): Harness {
  const harness: Harness = {
    onModelsChange: vi.fn<(models: ModelEntry[]) => void>(),
    onOpenModel: vi.fn<(index: number) => void>(),
  };
  render(
    <ModelDirectory
      api="openai-completions"
      errors={undefined}
      modelRows={modelDraftRows(models)}
      onModelsChange={(rows) =>
        harness.onModelsChange(rows.map((row) => row.model))
      }
      onOpenModel={harness.onOpenModel}
    />,
  );
  return harness;
}

describe("model directory layout", () => {
  it("carries the request name under the name the user sees", () => {
    renderDirectory();
    // The one naming column: the display name a row is read by, and under it
    // the request name the upstream is called, which no column of its own
    // would make any more visible.
    expect(bodyRows().map((cells) => cells[1])).toEqual([
      "GPT-4ogpt-4o",
      "—claude-sonnet",
      "—llama-3",
    ]);
  });

  it("gives each protocol a column so no row repeats a protocol name", () => {
    renderDirectory();
    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual([
      "Select all",
      "Display name",
      "Messages",
      "Completions",
      "Responses",
      "Actions",
    ]);
    // The ticking column, one checkbox per protocol per row, and the row
    // itself carries no label.
    expect(screen.getAllByRole("checkbox")).toHaveLength(13);
  });

  it("names a row with no model id yet instead of rendering a blank", () => {
    renderDirectory([{ id: "", reasoning: false }]);
    expect(
      screen.getByRole("button", { name: "Edit model Model ID not set" }),
    ).toBeTruthy();
  });

  it("says the directory is empty rather than showing an empty table", () => {
    renderDirectory([]);
    expect(screen.getByText("No models yet")).toBeTruthy();
  });
});

describe("model directory protocol matrix", () => {
  it("checks the protocols a model already answers on", () => {
    renderDirectory();
    expect(
      screen
        .getByRole("checkbox", { name: "Completions · gpt-4o" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("checkbox", { name: "Messages · gpt-4o" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("toggles one protocol of one model and leaves the rest alone", () => {
    const harness = renderDirectory();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Responses · gpt-4o" }),
    );

    expect(harness.onModelsChange).toHaveBeenCalledTimes(1);
    const next = harness.onModelsChange.mock.calls[0]?.[0];
    expect(next?.[0]?.apis).toEqual(["openai-completions", "openai-responses"]);
    expect(next?.[1]).toBe(MODELS[1]);
    expect(next?.[2]).toBe(MODELS[2]);
  });
});

describe("model directory selection", () => {
  it("floats the bulk actions only once rows are ticked", () => {
    renderDirectory();
    expect(screen.queryByRole("toolbar")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "gpt-4o" }));

    const bar = screen.getByRole("toolbar");
    expect(bar.textContent).toContain("1 selected");
    expect(bar.textContent).toContain("Remove model");
  });

  it("ticks every visible row from the header and unticks them again", () => {
    renderDirectory();
    const all = screen.getByRole("checkbox", { name: "Select all" });

    fireEvent.click(all);
    expect(screen.getByRole("toolbar").textContent).toContain("3 selected");

    fireEvent.click(all);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("removes every ticked row in one write", () => {
    const harness = renderDirectory();

    fireEvent.click(screen.getByRole("checkbox", { name: "gpt-4o" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "llama-3" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove model" }));

    const next = harness.onModelsChange.mock.calls[0]?.[0];
    expect(next?.map((model) => model.id)).toEqual(["claude-sonnet"]);
  });

  it("sets one protocol across every ticked row", () => {
    const harness = renderDirectory();

    fireEvent.click(screen.getByRole("checkbox", { name: "gpt-4o" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "claude-sonnet" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Protocol" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.pointerUp(
      screen.getByRole("menuitemcheckbox", { name: "Responses" }),
    );

    // Neither row answers Responses yet, so the click turns it on for both.
    const next = harness.onModelsChange.mock.calls[0]?.[0];
    expect(next?.[0]?.apis).toEqual(["openai-completions", "openai-responses"]);
    expect(next?.[1]?.apis).toEqual(["anthropic-messages", "openai-responses"]);
    expect(next?.[2]).toBe(MODELS[2]);
  });

  it("follows a row through a filter rather than its position", () => {
    const harness = renderDirectory();

    fireEvent.click(screen.getByRole("checkbox", { name: "llama-3" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search models" }), {
      target: { value: "llama" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove model" }));

    // Only llama-3 was ticked, so the write keeps the two rows above it.
    const next = harness.onModelsChange.mock.calls[0]?.[0];
    expect(next?.map((model) => model.id)).toEqual(["gpt-4o", "claude-sonnet"]);
  });
});

describe("model directory actions", () => {
  it("opens the editor from the row's action button", () => {
    const harness = renderDirectory();

    fireEvent.click(
      screen.getByRole("button", { name: "Edit model claude-sonnet" }),
    );

    expect(harness.onOpenModel).toHaveBeenCalledWith(1);
  });

  it("leaves the row itself inert", () => {
    const harness = renderDirectory();

    fireEvent.click(screen.getByText("gpt-4o"));

    expect(harness.onOpenModel).not.toHaveBeenCalled();
  });

  it("appends a row pre-checking the provider protocol and opens it", () => {
    const harness = renderDirectory();

    fireEvent.click(screen.getByRole("button", { name: "Add model" }));

    const next = harness.onModelsChange.mock.calls[0]?.[0];
    expect(next).toHaveLength(4);
    expect(next?.[3]?.apis).toEqual(["openai-completions"]);
    expect(harness.onOpenModel).toHaveBeenCalledWith(3);
  });

  it("removes a row by its stored position", async () => {
    const harness = renderDirectory();

    await pickRowAction(0, "Remove model");

    const next = harness.onModelsChange.mock.calls[0]?.[0];
    expect(next?.map((model) => model.id)).toEqual([
      "claude-sonnet",
      "llama-3",
    ]);
  });
});

describe("model directory inline edits", () => {
  /** Opens a naming cell and returns its editor. */
  function openCell(name: string): HTMLElement {
    fireEvent.click(screen.getByRole("button", { name }));
    return screen.getByRole("textbox", { name });
  }

  it("writes the display name the cell was given", () => {
    const harness = renderDirectory();
    const box = openCell("Display name · gpt-4o");

    fireEvent.change(box, { target: { value: "GPT-4o mini" } });
    fireEvent.keyDown(box, { key: "Enter" });

    const next = harness.onModelsChange.mock.calls[0]?.[0];
    expect(next?.[0]?.name).toBe("GPT-4o mini");
    // The other rows are carried through untouched.
    expect(next?.[1]).toBe(MODELS[1]);
    expect(next?.[2]).toBe(MODELS[2]);
  });

  it("clears the display name when the cell is emptied", () => {
    const harness = renderDirectory();
    const box = openCell("Display name · gpt-4o");

    fireEvent.change(box, { target: { value: "" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(
      harness.onModelsChange.mock.calls[0]?.[0]?.[0]?.name,
    ).toBeUndefined();
  });

  it("commits on blur", () => {
    const harness = renderDirectory();
    const box = openCell("Display name · claude-sonnet");

    fireEvent.change(box, { target: { value: "Sonnet" } });
    fireEvent.blur(box);

    expect(harness.onModelsChange.mock.calls[0]?.[0]?.[1]?.name).toBe("Sonnet");
  });

  it("reverts on Escape and leaves an unchanged cell alone", () => {
    const harness = renderDirectory();

    const escaped = openCell("Display name · gpt-4o");
    fireEvent.change(escaped, { target: { value: "Discarded" } });
    fireEvent.keyDown(escaped, { key: "Escape" });
    expect(harness.onModelsChange).not.toHaveBeenCalled();
    // The cell is back to its text, so it can be opened again.
    expect(
      screen.getByRole("button", { name: "Display name · gpt-4o" }).textContent,
    ).toBe("GPT-4o");

    const unchanged = openCell("Display name · gpt-4o");
    fireEvent.blur(unchanged);
    expect(harness.onModelsChange).not.toHaveBeenCalled();
  });
});

describe("model directory search", () => {
  it("matches the model id and its display name", () => {
    renderDirectory();
    const box = screen.getByRole("searchbox", { name: "Search models" });

    fireEvent.change(box, { target: { value: "GPT-4o" } });

    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]?.[1]).toContain("gpt-4o");
  });

  it("edits the row the filter shows, not the first stored row", () => {
    const harness = renderDirectory();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search models" }), {
      target: { value: "llama" },
    });

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Messages · llama-3" }),
    );

    const next = harness.onModelsChange.mock.calls[0]?.[0];
    expect(next?.[2]?.apis).toEqual(["anthropic-messages"]);
    expect(next?.[0]).toBe(MODELS[0]);
  });

  it("says nothing matched rather than reading as an empty directory", () => {
    renderDirectory();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search models" }), {
      target: { value: "nothing" },
    });

    expect(screen.getByText("No model matches")).toBeTruthy();
    expect(screen.queryByText("No models yet")).toBeNull();
  });
});

it("selects just one of two rows with the same editable model id", () => {
  renderDirectory([
    { id: "same", name: "First", reasoning: false },
    { id: "same", name: "Second", reasoning: false },
  ]);
  fireEvent.click(
    screen.getAllByRole("checkbox", { name: "same" })[0] ?? document.body,
  );
  expect(
    screen
      .getAllByRole("checkbox", { name: "same" })
      .map((row) => row.getAttribute("aria-checked")),
  ).toEqual(["true", "false"]);
});
