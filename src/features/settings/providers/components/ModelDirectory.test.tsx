import type { Mock } from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ModelEntry } from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";

import {
  changedModelCount,
  type ModelDraftRow,
  modelDraftRows,
} from "../model-draft";
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
  initialRows: ModelDraftRow[];
  onModelsChange: Mock<(models: ModelEntry[], rows: ModelDraftRow[]) => void>;
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

/** The changed count the draft derives from the rows it was last handed. */
function changedModels(harness: Harness): number {
  return writtenRows(harness).reduce(
    (count, row) =>
      count +
      (row.baseline === undefined
        ? 1
        : changedModelCount(row.baseline, row.model, row.editor)),
    0,
  );
}

/**
 * The directory's host. Every write is rendered back into the component, the
 * way the draft controller renders it: without that, an assertion about an
 * edit surviving a re-render would be about the harness rather than the
 * component.
 */
function DirectoryHost({ harness }: { harness: Harness }) {
  const [rows, setRows] = useState(harness.initialRows);
  // The rows of the write being handled: React has not re-rendered yet when
  // the same handler goes on to open a row.
  const written = useRef(rows);
  return (
    <ModelDirectory
      api="openai-completions"
      errors={undefined}
      modelRows={rows}
      onModelsChange={(next) => {
        written.current = next;
        setRows(next);
        harness.onModelsChange(
          next.map((row) => row.model),
          next,
        );
      }}
      onOpenModel={(key) =>
        harness.onOpenModel(written.current.findIndex((row) => row.key === key))
      }
    />
  );
}

/** The remove button of one row, which acts at once with no menu in between. */
function removeRow(row: number): void {
  const buttons = screen.getAllByRole("button", { name: /^Remove model / });
  fireEvent.click(buttons[row] ?? document.body);
}

function renderDirectory(models: ModelEntry[] = MODELS): Harness {
  const harness: Harness = {
    initialRows: modelDraftRows(models),
    onModelsChange:
      vi.fn<(models: ModelEntry[], rows: ModelDraftRow[]) => void>(),
    onOpenModel: vi.fn<(index: number) => void>(),
  };
  render(
    <TooltipProvider>
      <DirectoryHost harness={harness} />
    </TooltipProvider>,
  );
  return harness;
}

/**
 * A host that swaps the directory out the way the section strip does, keeping
 * the rows it wrote in state above the unmounted pane.
 */
function SwappingHost() {
  const [rows, setRows] = useState<ModelDraftRow[]>(() =>
    modelDraftRows([{ id: "m1", name: "Alpha", reasoning: false }]),
  );
  const [isModelsPane, setIsModelsPane] = useState(true);
  return (
    <div>
      <button onClick={() => setIsModelsPane(true)} type="button">
        Show models
      </button>
      <button onClick={() => setIsModelsPane(false)} type="button">
        Show general
      </button>
      {isModelsPane && (
        <ModelDirectory
          api="openai-completions"
          errors={undefined}
          modelRows={rows}
          onModelsChange={setRows}
          onOpenModel={() => undefined}
        />
      )}
    </div>
  );
}

/** The rows the directory handed the draft in its latest write. */
function writtenRows(harness: Harness): ModelDraftRow[] {
  return harness.onModelsChange.mock.calls.at(-1)?.[1] ?? [];
}

describe("model directory layout", () => {
  it("gives the request name and the display name a column each", () => {
    renderDirectory();
    // Two naming columns: the request name the upstream is called, then the
    // name the user chose to see. Stacked in one cell the pair reads as one
    // name with a subtitle, not as two things to compare.
    expect(bodyRows().map((cells) => cells[1])).toEqual([
      "gpt-4o",
      "claude-sonnet",
      "llama-3",
    ]);
    expect(bodyRows().map((cells) => cells[2])).toEqual(["GPT-4o", "—", "—"]);
  });

  it("gives each protocol a column so no row repeats a protocol name", () => {
    renderDirectory();
    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual([
      "Select all",
      "Model ID",
      "Display name",
      "Msg",
      "Chat",
      "Res",
      "Edit",
      "Delete",
    ]);
    // The ticking column, one checkbox per protocol per row, and the row
    // itself carries no label.
    expect(screen.getAllByRole("checkbox")).toHaveLength(13);
  });

  it("keeps the remove button in a column of its own, away from edit", () => {
    renderDirectory();
    const headers = screen.getAllByRole("columnheader");
    const cells = Array.from(
      screen.getAllByRole("row")[1]?.querySelectorAll("td") ?? [],
    );
    // Edit and delete sit in different cells: a destructive click is never
    // one accidental nudge from the click that opens the row.
    expect(cells[6]?.textContent).toBe("");
    expect(cells[7]?.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Remove model gpt-4o",
    );
    expect(headers).toHaveLength(8);
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
    fireEvent.click(
      within(screen.getByRole("toolbar")).getByRole("button", {
        name: "Remove model",
      }),
    );

    const next = harness.onModelsChange.mock.calls[0]?.[0];
    expect(next?.map((model) => model.id)).toEqual(["claude-sonnet"]);
  });

  it("sets one protocol across every ticked row", () => {
    const harness = renderDirectory();

    fireEvent.click(screen.getByRole("checkbox", { name: "gpt-4o" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "claude-sonnet" }));
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Set protocol" }),
      {
        button: 0,
        ctrlKey: false,
      },
    );
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
    fireEvent.click(
      within(screen.getByRole("toolbar")).getByRole("button", {
        name: "Remove model",
      }),
    );

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

  it("removes a row by its stored position", () => {
    const harness = renderDirectory();

    removeRow(0);

    const next = harness.onModelsChange.mock.calls[0]?.[0];
    expect(next?.map((model) => model.id)).toEqual([
      "claude-sonnet",
      "llama-3",
    ]);
  });
});

describe("model directory inline edits", () => {
  it.each([
    { isComposing: true, keyCode: 13 },
    { isComposing: false, keyCode: 229 },
  ])("keeps IME confirmation inside the input (%j)", (composition) => {
    const harness = renderDirectory();
    fireEvent.click(
      screen.getByRole("button", { name: "Display name · gpt-4o" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Display name · gpt-4o",
    });
    fireEvent.change(input, { target: { value: "中文" } });
    const writes = harness.onModelsChange.mock.calls.length;
    fireEvent.keyDown(input, { key: "Enter", ...composition });
    // The composition's Enter neither ends the edit nor writes again: the
    // text reached the draft with the keystroke.
    expect(harness.onModelsChange.mock.calls).toHaveLength(writes);
    expect(screen.getByRole("textbox", { name: "Display name · gpt-4o" })).toBe(
      input,
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      screen.queryByRole("textbox", { name: "Display name · gpt-4o" }),
    ).toBeNull();
    expect(writtenRows(harness)[0]?.model.name).toBe("中文");
  });

  /** Opens a naming cell and returns its editor. */
  function openCell(name: string): HTMLElement {
    fireEvent.click(screen.getByRole("button", { name }));
    return screen.getByRole("textbox", { name });
  }

  it("writes every keystroke, so the cell holds no text of its own", () => {
    const harness = renderDirectory();
    const box = openCell("Display name · gpt-4o");

    fireEvent.change(box, { target: { value: "G" } });
    expect(writtenRows(harness)[0]?.model.name).toBe("G");
    expect(changedModels(harness)).toBe(1);

    fireEvent.change(box, { target: { value: "GP" } });
    expect(writtenRows(harness)[0]?.model.name).toBe("GP");
    expect(changedModels(harness)).toBe(1);

    // Typing the stored name back clears the change: the count follows the
    // value, not the fact that the cell was opened.
    fireEvent.change(box, { target: { value: "GPT-4o" } });
    expect(changedModels(harness)).toBe(0);
    // The other rows are carried through untouched.
    expect(writtenRows(harness)[1]?.model).toBe(MODELS[1]);
    expect(writtenRows(harness)[2]?.model).toBe(MODELS[2]);
  });

  it("keeps the caret in the input the keystrokes are written from", () => {
    renderDirectory();
    const box = openCell("Display name · gpt-4o");
    expect(document.activeElement).toBe(box);

    fireEvent.change(box, { target: { value: "GP" } });

    // The re-render that follows a write has to update this input rather than
    // mount a new one; a new element would leave the caret behind.
    expect(screen.getByRole("textbox", { name: "Display name · gpt-4o" })).toBe(
      box,
    );
    expect(document.activeElement).toBe(box);
    expect(box).toHaveProperty("value", "GP");
  });

  it("clears the display name when the cell is emptied", () => {
    const harness = renderDirectory();
    const box = openCell("Display name · gpt-4o");

    fireEvent.change(box, { target: { value: "" } });

    // Blank text is the key's absence, not an empty string.
    expect(writtenRows(harness)[0]?.model).toEqual({
      apis: ["openai-completions"],
      id: "gpt-4o",
      reasoning: false,
    });
  });

  it("leaves the cell on Enter and on blur with nothing left to write", () => {
    const harness = renderDirectory();
    const entered = openCell("Display name · claude-sonnet");

    fireEvent.change(entered, { target: { value: "Sonnet" } });
    const writes = harness.onModelsChange.mock.calls.length;
    fireEvent.keyDown(entered, { key: "Enter" });

    // The Enter only ends the edit; the name has been in the draft since the
    // keystroke.
    expect(harness.onModelsChange.mock.calls).toHaveLength(writes);
    expect(
      screen.queryByRole("textbox", { name: "Display name · claude-sonnet" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Display name · claude-sonnet" })
        .textContent,
    ).toBe("Sonnet");

    const blurred = openCell("Display name · gpt-4o");
    fireEvent.change(blurred, { target: { value: "Four" } });
    const afterChange = harness.onModelsChange.mock.calls.length;
    fireEvent.blur(blurred);

    expect(harness.onModelsChange.mock.calls).toHaveLength(afterChange);
    expect(
      screen.getByRole("button", { name: "Display name · gpt-4o" }).textContent,
    ).toBe("Four");
  });

  it("puts the snapshot back on Escape and leaves an untouched cell alone", () => {
    const harness = renderDirectory();

    const escaped = openCell("Display name · gpt-4o");
    fireEvent.change(escaped, { target: { value: "Discarded" } });
    fireEvent.keyDown(escaped, { key: "Escape" });

    // Escape writes the value the edit started from: the draft ends where it
    // began, not on the half-typed name.
    expect(writtenRows(harness)[0]?.model.name).toBe("GPT-4o");
    expect(changedModels(harness)).toBe(0);
    // The cell is back to its text, so it can be opened again.
    expect(
      screen.getByRole("button", { name: "Display name · gpt-4o" }).textContent,
    ).toBe("GPT-4o");

    const writes = harness.onModelsChange.mock.calls.length;
    fireEvent.blur(openCell("Display name · gpt-4o"));
    // Opening a cell and leaving it without typing writes nothing at all.
    expect(harness.onModelsChange.mock.calls).toHaveLength(writes);
  });

  it("keeps the renaming row on screen while its name stops matching the filter", () => {
    renderDirectory([
      { id: "m1", name: "Alpha", reasoning: false },
      { id: "m2", name: "Beta", reasoning: false },
    ]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search models" }), {
      target: { value: "Alpha" },
    });
    expect(bodyRows()).toHaveLength(1);

    const box = openCell("Display name · m1");
    fireEvent.change(box, { target: { value: "Al" } });

    // "m1 al" no longer matches "alpha", so the row stays only because it is
    // the one being renamed — the input must not slide out from under the
    // caret.
    expect(screen.getByRole("textbox", { name: "Display name · m1" })).toBe(
      box,
    );
    expect(bodyRows()).toHaveLength(1);

    fireEvent.keyDown(box, { key: "Escape" });
    expect(
      screen.getByRole("button", { name: "Display name · m1" }).textContent,
    ).toBe("Alpha");
  });

  it("hands the renamed row back to the filter once the edit ends", () => {
    renderDirectory([
      { id: "m1", name: "Alpha", reasoning: false },
      { id: "m2", name: "Beta", reasoning: false },
    ]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search models" }), {
      target: { value: "Alpha" },
    });

    const box = openCell("Display name · m1");
    fireEvent.change(box, { target: { value: "Al" } });
    fireEvent.blur(box);

    // The edit is over, so the filter decides again and no row matches.
    expect(screen.getByText("No model matches")).toBeTruthy();
  });

  it("keeps the typed name when the panes swap the directory out", () => {
    render(
      <TooltipProvider>
        <SwappingHost />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Display name · m1" }));
    const box = screen.getByRole("textbox", { name: "Display name · m1" });
    fireEvent.change(box, { target: { value: "Al" } });

    // A section switch unmounts the pane, input and all. The name went to the
    // draft with the keystroke, so the pane that comes back shows it.
    fireEvent.click(screen.getByRole("button", { name: "Show general" }));
    expect(
      screen.queryByRole("textbox", { name: "Display name · m1" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show models" }));

    expect(
      screen.getByRole("button", { name: "Display name · m1" }).textContent,
    ).toBe("Al");
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
