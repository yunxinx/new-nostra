import type { ModelEntry } from "@/types/ipc";

export interface ModelDraftRow {
  baseline: ModelEntry | undefined;
  key: string;
  model: ModelEntry;
}

export function modelDraftRows(models: ModelEntry[]): ModelDraftRow[] {
  return models.map((model) => ({
    baseline: model,
    key: crypto.randomUUID(),
    model,
  }));
}
