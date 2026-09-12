import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm, type UseFormReturn, useWatch } from "react-hook-form";

import type {
  AppError,
  ModelEntry,
  Provider,
  ProviderDraft,
  ProviderListItem,
} from "@/types/ipc";

import { useUpdateProvider } from "@/hooks/use-providers";
import { isDeepEqual } from "@/lib/deep-equal";
import { changedValueCount, mergeSavedFields } from "@/lib/draft-values";

import { storedBuckets } from "../components/compat/compat-values";
import { providerDraftSchema } from "../schemas/provider";
import {
  BLANK_PROVIDER_DRAFT,
  changedDraftFields,
  type ProviderDraftField,
  type ProviderFormSubmission,
  type ProviderFormValues,
  providerToDraft,
  toFormValues,
  toProviderDraft,
} from "./draft";
import { type ModelDraftRow, modelDraftRows } from "./model-draft";

export interface ProviderDraftController {
  adoptCreated: (provider: Provider) => void;
  afterDelete: (deletedId: string) => void;
  applyStoredEnabled: (id: string, enabled: boolean) => void;
  baseline: ProviderDraft;
  baselineFor: (id: string) => null | ProviderDraft;
  changedCount: number;
  changedFields: ReadonlySet<ProviderDraftField>;
  discard: () => void;
  error: AppError | null;
  form: UseFormReturn<ProviderFormValues, unknown, ProviderFormSubmission>;
  isChanged: boolean;
  isKeyRevealed: boolean;
  isSaving: boolean;
  modelRows: ModelDraftRow[];
  models: ModelEntry[];
  revertField: (field: ProviderDraftField) => void;
  revision: number;
  save: () => void;
  select: (id: string) => void;
  target: ProviderTarget;
  toggleKeyReveal: () => void;
  updateModelRows: (rows: ModelDraftRow[]) => void;
}

export type ProviderTarget =
  | { id: string; kind: "corrupted" }
  | { id: string; kind: "edit" }
  | { kind: "none" };

interface EditorState {
  baseline: ProviderDraft;
  baselineRows: ModelDraftRow[];
  modelRows: ModelDraftRow[];
  revision: number;
  target: ProviderTarget;
}

export function useProviderDraft(
  providers: ProviderListItem[],
): ProviderDraftController {
  const update = useUpdateProvider();
  const generation = useRef(0);
  const isSubmitting = useRef(false);
  const [state, setState] = useState<EditorState>({
    baseline: BLANK_PROVIDER_DRAFT,
    baselineRows: [],
    modelRows: [],
    revision: 0,
    target: { kind: "none" },
  });
  const [isKeyRevealed, setIsKeyRevealed] = useState(false);
  const form = useForm<ProviderFormValues, unknown, ProviderFormSubmission>({
    defaultValues: toFormValues(BLANK_PROVIDER_DRAFT),
    resolver: zodResolver(providerDraftSchema),
  });
  const values = useWatch({
    compute: (values) => values,
    control: form.control,
  });
  const models = state.modelRows.map((row) => row.model);
  const changedFields = changedDraftFields(state.baseline, models, values);
  const modelChangedCount =
    state.modelRows.reduce(
      (count, row) =>
        count +
        (row.baseline === undefined
          ? 1
          : changedValueCount(row.baseline, row.model)),
      0,
    ) +
    state.baselineRows.filter(
      (saved) => !state.modelRows.some((row) => row.key === saved.key),
    ).length;
  const changedCount = [...changedFields].reduce((count, field) => {
    if (field === "models") return count + Math.max(1, modelChangedCount);
    if (field === "compat")
      return (
        count +
        changedValueCount(state.baseline.compat, storedBuckets(values.compat))
      );
    return count + 1;
  }, 0);

  function resetTo(target: ProviderTarget, baseline: ProviderDraft): void {
    generation.current += 1;
    const modelRows = modelDraftRows(baseline.models ?? []);
    setState((previous) => ({
      baseline,
      baselineRows: modelRows,
      modelRows,
      revision: previous.revision + 1,
      target,
    }));
    setIsKeyRevealed(false);
    form.reset(toFormValues(baseline));
    update.reset();
  }

  function updateModelRows(modelRows: ModelDraftRow[]): void {
    setState((previous) => ({ ...previous, modelRows }));
    form.setValue(
      "models",
      modelRows.map((row) => row.model),
      { shouldDirty: true, shouldValidate: form.formState.isSubmitted },
    );
  }

  function select(id: string): void {
    const item = providers.find((candidate) => candidate.id === id);
    if (item === undefined) return;
    resetTo(
      { id, kind: "corrupted" in item ? "corrupted" : "edit" },
      "corrupted" in item ? BLANK_PROVIDER_DRAFT : providerToDraft(item),
    );
  }

  function adoptCreated(provider: Provider): void {
    resetTo({ id: provider.id, kind: "edit" }, providerToDraft(provider));
  }

  function afterDelete(deletedId: string): void {
    const next = providers.find((candidate) => candidate.id !== deletedId);
    if (next === undefined) resetTo({ kind: "none" }, BLANK_PROVIDER_DRAFT);
    else select(next.id);
  }

  function discard(): void {
    resetTo(state.target, state.baseline);
  }

  function revertField(field: ProviderDraftField): void {
    const stored = toFormValues(state.baseline);
    if (field === "models") updateModelRows(state.baselineRows);
    form.setValue(field, stored[field], {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    });
    // Stateful text editors must read the restored value while section navigation stays mounted.
    setState((previous) => ({ ...previous, revision: previous.revision + 1 }));
  }

  function baselineFor(id: string): null | ProviderDraft {
    return state.target.kind === "edit" && state.target.id === id
      ? state.baseline
      : null;
  }

  function applyStoredEnabled(id: string, enabled: boolean): void {
    if (state.target.kind !== "edit" || state.target.id !== id) return;
    setState((previous) => ({
      ...previous,
      baseline: { ...previous.baseline, enabled },
    }));
    form.setValue("enabled", enabled, { shouldDirty: false });
  }

  function save(): void {
    if (isSubmitting.current || state.target.kind !== "edit") return;
    isSubmitting.current = true;
    const submittedGeneration = generation.current;
    const submittedValues = form.getValues();
    const submittedRows = state.modelRows;
    const id = state.target.id;
    update.reset();
    void form.handleSubmit(
      async (parsed) => {
        if (submittedGeneration !== generation.current) {
          isSubmitting.current = false;
          return;
        }
        try {
          const saved = await update.mutateAsync({
            id,
            provider: toProviderDraft(parsed, models),
          });
          if (submittedGeneration !== generation.current) return;
          const baseline = providerToDraft(saved);
          const next = mergeSavedFields(
            submittedValues,
            form.getValues(),
            toFormValues(baseline),
          );
          const savedByKey = new Map(
            submittedRows.map((row, index) => [
              row.key,
              baseline.models?.[index],
            ]),
          );
          setState((previous) => ({
            ...previous,
            baseline,
            baselineRows: submittedRows.flatMap((row) => {
              const model = savedByKey.get(row.key);
              return model === undefined
                ? []
                : [{ baseline: model, key: row.key, model }];
            }),
            modelRows: previous.modelRows.map((row) => ({
              ...row,
              baseline: savedByKey.get(row.key),
              model: isDeepEqual(
                previous.modelRows.map((item) => item.model),
                models,
              )
                ? (savedByKey.get(row.key) ?? row.model)
                : row.model,
            })),
            revision: previous.revision + 1,
          }));
          form.reset(next);
          setIsKeyRevealed(false);
        } catch {
          // The mutation owns the error displayed by the form.
        } finally {
          isSubmitting.current = false;
        }
      },
      () => {
        isSubmitting.current = false;
      },
    )();
  }

  return {
    adoptCreated,
    afterDelete,
    applyStoredEnabled,
    baseline: state.baseline,
    baselineFor,
    changedCount,
    changedFields,
    discard,
    error: update.error,
    form,
    isChanged: changedFields.size > 0,
    isKeyRevealed,
    isSaving: update.isPending,
    modelRows: state.modelRows,
    models,
    revertField,
    revision: state.revision,
    save,
    select,
    target: state.target,
    toggleKeyReveal: () => setIsKeyRevealed((value) => !value),
    updateModelRows,
  };
}
