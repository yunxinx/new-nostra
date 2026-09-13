import type { ModelEntry } from "@/types/ipc";

import { changedValueCount } from "@/lib/draft-values";

import {
  changedCompatCount,
  type CompatInputDrafts,
} from "../components/compat/compat-draft";
import { type CostDraftRow, costDraftRows, rebaseCostRows } from "./cost-draft";

export interface ModelDraftRow {
  baseline: ModelEntry | undefined;
  editor: ModelEditorState;
  key: string;
  model: ModelEntry;
}

export interface ModelEditorState {
  compatInputs: CompatInputDrafts;
  costRows: CostDraftRow[];
}

export function changedModelCount(
  baseline: ModelEntry,
  model: ModelEntry,
  editor: ModelEditorState,
): number {
  const { compat: before, ...stored } = baseline;
  const { compat: after, ...current } = model;
  return (
    changedValueCount(stored, current) +
    changedCompatCount(before, after, editor.compatInputs)
  );
}

export function modelDraftRows(models: ModelEntry[]): ModelDraftRow[] {
  return models.map((model) => ({
    baseline: model,
    editor: modelEditorState(model),
    key: crypto.randomUUID(),
    model,
  }));
}

export function modelEditorState(model: ModelEntry): ModelEditorState {
  return { compatInputs: {}, costRows: costDraftRows(model.cost) };
}

export function rebaseModelEditor(
  current: ModelEditorState,
  submitted: ModelEditorState,
  saved: ModelEntry,
): ModelEditorState {
  return {
    ...current,
    costRows: rebaseCostRows(current.costRows, submitted.costRows, saved.cost),
  };
}
