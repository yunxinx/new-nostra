import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ModelEntry, Provider } from "@/types/ipc";

import { FloatingPanel } from "@/components/common/FloatingPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUpdateProvider } from "@/hooks/use-providers";

import { hasInvalidCompatInputs } from "../../components/compat/compat-draft";
import { DirtyNotice } from "../../components/DirtyNotice";
import { useDraftGuard } from "../../hooks/use-draft-guard";
import { ModelDetail } from "../../providers/components/ModelDetail";
import { providerToDraft } from "../../providers/draft";
import {
  changedModelCount,
  modelEditorState,
} from "../../providers/model-draft";
import { modelEntrySchema } from "../../schemas/provider";

interface ModelEditPanelProps {
  anchor: HTMLElement;
  isNavRequested?: boolean;
  onClose: () => void;
  onNavRequestResolved?: ((accepted: boolean) => void) | undefined;
  target: ModelEditTarget;
}

/** One model to edit: the document it belongs to and where it sits in it. */
interface ModelEditTarget {
  index: number;
  model: ModelEntry;
  provider: Provider;
}

/**
 * The editor of one model, opened over the list it was picked from. Editing
 * here and editing under the provider are the same form over the same
 * document: the model has no life of its own outside it, so the write is the
 * provider's full replace with one row swapped.
 */
export function ModelEditPanel({
  anchor,
  isNavRequested = false,
  onClose,
  onNavRequestResolved,
  target,
}: ModelEditPanelProps) {
  const { t } = useTranslation();
  const update = useUpdateProvider();
  const isSaving = update.isPending || update.isSuccess;
  const [model, setModel] = useState(target.model);
  const [editor, setEditor] = useState(() => modelEditorState(target.model));
  const hasInvalidInputs = hasInvalidCompatInputs(editor.compatInputs);
  const changedCount = changedModelCount(target.model, model, editor);
  const isChanged = changedCount > 0;
  const [isRefused, setIsRefused] = useState(false);
  const guard = useDraftGuard({
    isChanged,
    isNavRequested,
    isSaving,
    onLeave: onClose,
    onNavRequestResolved,
  });
  // The provider document the compat fields resolve against, which is the
  // stored one: what the panel edits is the row, not the provider.
  const providerDraft = providerToDraft(target.provider);

  useEffect(() => {
    // The parent may have received a switch request while the save refreshed
    // the catalogue, so completion must use the current parent callback.
    if (update.isSuccess) onClose();
  }, [onClose, update.isSuccess]);

  function handleSave(): void {
    if (isSaving || hasInvalidInputs) return;
    const parsed = modelEntrySchema.safeParse(model);
    setIsRefused(!parsed.success);
    if (!parsed.success) return;
    update.reset();
    update.mutate({
      id: target.provider.id,
      provider: {
        ...providerDraft,
        models: (providerDraft.models ?? []).map((entry, position) =>
          position === target.index ? model : entry,
        ),
      },
    });
  }

  return (
    <FloatingPanel
      anchor={anchor}
      footer={
        <>
          {isRefused && (
            <p className="text-destructive text-xs" role="alert">
              {t("errors.invalid_input")}
            </p>
          )}
          {changedCount > 0 && (
            <Badge variant="secondary">
              {t("common.changedCount", { count: changedCount })}
            </Badge>
          )}
          {update.error !== null && (
            <p
              className="text-destructive min-w-0 flex-1 truncate text-xs"
              role="alert"
            >
              {t(`errors.${update.error.code}`)}
            </p>
          )}
          <Button
            disabled={isSaving}
            onClick={guard.requestLeave}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!isChanged || isSaving || hasInvalidInputs}
            onClick={handleSave}
            size="sm"
            type="button"
          >
            {isSaving ? t("common.saving") : t("common.save")}
          </Button>
        </>
      }
      onClose={guard.requestLeave}
      subtitle={target.provider.name}
      title={
        model.name?.trim() === "" || model.name === undefined
          ? model.id
          : model.name
      }
    >
      <DirtyNotice
        onCancel={guard.cancel}
        onConfirm={guard.confirm}
        open={guard.isBlocked}
      />
      <fieldset className="min-w-0" disabled={isSaving}>
        <ModelDetail
          baseline={target.model}
          chrome="panel"
          editor={editor}
          errors={undefined}
          model={model}
          onBack={guard.requestLeave}
          onChange={setModel}
          onEditorChange={setEditor}
          provider={providerDraft}
        />
      </fieldset>
    </FloatingPanel>
  );
}
