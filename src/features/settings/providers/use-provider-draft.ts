import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm, type UseFormReturn, useWatch } from "react-hook-form";

import type {
  AppError,
  CompatBuckets,
  ModelEntry,
  Provider,
  ProviderDraft,
  ProviderListItem,
} from "@/types/ipc";

import { useUpdateProvider } from "@/hooks/use-providers";
import { isDeepEqual } from "@/lib/deep-equal";
import { mergeSavedFields } from "@/lib/draft-values";

import {
  changedCompatCount,
  type CompatInputDrafts,
  hasInvalidCompatInputs,
} from "../components/compat/compat-draft";
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
import {
  changedModelCount,
  type ModelDraftRow,
  modelDraftRows,
  type ModelEditorState,
  rebaseModelEditor,
} from "./model-draft";

export interface ProviderDraftController {
  adoptCreated: (provider: Provider, stamp: number) => void;
  afterDelete: (deletedId: string) => void;
  baseline: ProviderDraft;
  baselineFor: (id: string) => null | ProviderDraft;
  changedCount: number;
  changedFields: ReadonlySet<ProviderDraftField>;
  compatInputs: CompatInputDrafts;
  discard: () => void;
  error: AppError | null;
  form: UseFormReturn<ProviderFormValues, unknown, ProviderFormSubmission>;
  hasInvalidInputs: boolean;
  isChanged: boolean;
  isKeyRevealed: boolean;
  isSaving: boolean;
  isToggling: boolean;
  modelRows: ModelDraftRow[];
  models: ModelEntry[];
  restoreCompat: (compat: CompatBuckets | undefined) => void;
  revertField: (field: ProviderDraftField) => void;
  revision: number;
  save: () => void;
  select: (id: string) => void;
  sessionStamp: () => number;
  target: ProviderTarget;
  toggleEnabled: (id: string, enabled: boolean) => void;
  toggleError: AppError | null;
  toggleKeyReveal: () => void;
  updateCompatInputs: (inputs: CompatInputDrafts) => void;
  updateModel: (key: string, model: ModelEntry) => void;
  updateModelEditor: (key: string, editor: ModelEditorState) => void;
  updateModelRows: (rows: ModelDraftRow[]) => void;
}

export type ProviderTarget =
  | { id: string; kind: "corrupted" }
  | { id: string; kind: "edit" }
  | { kind: "none" };

interface EditorState {
  baseline: ProviderDraft;
  baselineRows: ModelDraftRow[];
  compatInputs: CompatInputDrafts;
  modelRows: ModelDraftRow[];
  revision: number;
  target: ProviderTarget;
}

export function useProviderDraft(
  providers: ProviderListItem[],
): ProviderDraftController {
  const update = useUpdateProvider();
  // Edit-session identity. `resetTo` is the only writer of `state.target` and
  // always advances this counter, so a target switch or a reset always
  // invalidates the generation; the converse does not hold — a discard() on the
  // same target advances it too, so an id coming back is a new session.
  // An unchanged generation therefore proves a completion belongs to the
  // session that started the write, while draft typing leaves it untouched —
  // save() reads post-submit edits through that distinction.
  const generation = useRef(0);
  const isSubmitting = useRef(false);
  // The quick toggle is its own request: it must not share pending or error
  // state with a save, and vice versa.
  const toggle = useUpdateProvider();
  const [state, setState] = useState<EditorState>({
    baseline: BLANK_PROVIDER_DRAFT,
    baselineRows: [],
    compatInputs: {},
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
  const changedFields = new Set(
    changedDraftFields(state.baseline, models, values),
  );
  const invalidProviderInputs = hasInvalidCompatInputs(state.compatInputs);
  const invalidModelInputs = state.modelRows.some((row) =>
    hasInvalidCompatInputs(row.editor.compatInputs),
  );
  if (invalidProviderInputs) changedFields.add("compat");
  if (invalidModelInputs) changedFields.add("models");
  const hasInvalidInputs = invalidProviderInputs || invalidModelInputs;
  const modelChangedCount =
    state.modelRows.reduce(
      (count, row) =>
        count +
        (row.baseline === undefined
          ? 1
          : changedModelCount(row.baseline, row.model, row.editor)),
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
        changedCompatCount(
          state.baseline.compat,
          storedBuckets(values.compat),
          state.compatInputs,
        )
      );
    return count + 1;
  }, 0);

  function resetTo(
    target: ProviderTarget,
    baseline: ProviderDraft,
    modelRows = modelDraftRows(baseline.models ?? []),
  ): void {
    generation.current += 1;
    setState((previous) => ({
      baseline,
      baselineRows: modelRows,
      compatInputs: {},
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

  function updateModel(key: string, model: ModelEntry): void {
    setState((previous) => ({
      ...previous,
      modelRows: previous.modelRows.map((row) =>
        row.key === key ? { ...row, model } : row,
      ),
    }));
    form.setValue(
      "models",
      state.modelRows.map((row) => (row.key === key ? model : row.model)),
      {
        shouldDirty: true,
        shouldValidate: form.formState.isSubmitted,
      },
    );
  }

  function updateModelEditor(key: string, editor: ModelEditorState): void {
    setState((previous) => ({
      ...previous,
      modelRows: previous.modelRows.map((row) =>
        row.key === key ? { ...row, editor } : row,
      ),
    }));
  }

  function select(id: string): void {
    const item = providers.find((candidate) => candidate.id === id);
    if (item === undefined) return;
    resetTo(
      { id, kind: "corrupted" in item ? "corrupted" : "edit" },
      "corrupted" in item ? BLANK_PROVIDER_DRAFT : providerToDraft(item),
    );
  }

  /**
   * Opens a just-created provider only when its write still belongs to the
   * session it started in and that session is untouched. The stamp, read when
   * the request is made, catches what comparing the current target id cannot:
   * switching away and back lands on the same id under a new session, and a
   * discard on the same target is a new session too. The dirty flag comes from
   * the caller's fresh render and covers the session's own edits — stamp and
   * flag own different failure modes.
   */
  function adoptCreated(provider: Provider, stamp: number): void {
    if (generation.current !== stamp || changedFields.size > 0) {
      return;
    }
    resetTo({ id: provider.id, kind: "edit" }, providerToDraft(provider));
  }

  function afterDelete(deletedId: string): void {
    const next = providers.find((candidate) => candidate.id !== deletedId);
    if (next === undefined) resetTo({ kind: "none" }, BLANK_PROVIDER_DRAFT);
    else select(next.id);
  }

  function discard(): void {
    resetTo(state.target, state.baseline, state.baselineRows);
  }

  function revertField(field: ProviderDraftField): void {
    const stored = toFormValues(state.baseline);
    if (field === "models") updateModelRows(state.baselineRows);
    form.setValue(field, stored[field], {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    });
    // Stateful text editors must read the restored value while section navigation stays mounted.
    setState((previous) => ({
      ...previous,
      compatInputs: field === "compat" ? {} : previous.compatInputs,
      revision: previous.revision + 1,
    }));
  }

  function restoreCompat(compat: CompatBuckets | undefined): void {
    if (isSubmitting.current) return;
    form.setValue("compat", compat ?? null, {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    });
    setState((previous) => ({
      ...previous,
      compatInputs: {},
      revision: previous.revision + 1,
    }));
  }

  function baselineFor(id: string): null | ProviderDraft {
    return state.target.kind === "edit" && state.target.id === id
      ? state.baseline
      : null;
  }

  /**
   * Mirrors a stored flag into an edit session. The caller has already proven
   * that session is the live one (matching generation), so the closure's target
   * is the live target; this guard adds the same-target case where the toggle
   * started while another provider was open.
   */
  function applyStoredEnabled(id: string, enabled: boolean): void {
    if (state.target.kind !== "edit" || state.target.id !== id) return;
    setState((previous) => ({
      ...previous,
      baseline: { ...previous.baseline, enabled },
    }));
    form.setValue("enabled", enabled, { shouldDirty: false });
  }

  /**
   * Writes a row's enabled flag and, only when the response lands in the same
   * edit session, mirrors the stored value into that session's baseline and
   * form. A switch or a reset in between drops the response whole.
   */
  function toggleEnabled(id: string, enabled: boolean): void {
    const item = providers.find((candidate) => candidate.id === id);
    if (item === undefined || "corrupted" in item) return;
    // Read from the ref, not from a render closure: the completion below
    // compares against the session this write starts in.
    const startedGeneration = generation.current;
    // The quick toggle is a full-replace write, so it carries the whole stored
    // document: the session's baseline when it holds this provider, the cached
    // row otherwise.
    const stored = baselineFor(id) ?? providerToDraft(item);
    toggle.reset();
    toggle.mutate(
      { id, provider: { ...stored, enabled } },
      {
        onSuccess: () => {
          if (generation.current !== startedGeneration) return;
          applyStoredEnabled(id, enabled);
        },
      },
    );
  }

  /** The current edit session's generation, opaque: a page captures it when it
   *  starts a write and holds the completion to that same session. */
  function sessionStamp(): number {
    return generation.current;
  }

  function save(): void {
    if (
      isSubmitting.current ||
      state.target.kind !== "edit" ||
      hasInvalidInputs
    )
      return;
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
                : [
                    {
                      baseline: model,
                      editor: {
                        ...rebaseModelEditor(row.editor, row.editor, model),
                        compatInputs: {},
                      },
                      key: row.key,
                      model,
                    },
                  ];
            }),
            modelRows: previous.modelRows.map((row) => ({
              ...row,
              baseline: savedByKey.get(row.key),
              editor: savedByKey.has(row.key)
                ? rebaseModelEditor(
                    row.editor,
                    submittedRows.find((submitted) => submitted.key === row.key)
                      ?.editor ?? row.editor,
                    savedByKey.get(row.key) ?? row.model,
                  )
                : row.editor,
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
    baseline: state.baseline,
    baselineFor,
    changedCount,
    changedFields,
    compatInputs: state.compatInputs,
    discard,
    error: update.error,
    form,
    hasInvalidInputs,
    isChanged: changedFields.size > 0,
    isKeyRevealed,
    isSaving: update.isPending,
    isToggling: toggle.isPending,
    modelRows: state.modelRows,
    models,
    restoreCompat,
    revertField,
    revision: state.revision,
    save,
    select,
    sessionStamp,
    target: state.target,
    toggleEnabled,
    toggleError: toggle.error,
    toggleKeyReveal: () => setIsKeyRevealed((value) => !value),
    updateCompatInputs: (compatInputs) =>
      setState((previous) => ({ ...previous, compatInputs })),
    updateModel,
    updateModelEditor,
    updateModelRows,
  };
}
