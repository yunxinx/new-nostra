import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ModelEntry, Provider } from "@/types/ipc";

import { FloatingPanel } from "@/components/common/FloatingPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUpdateProvider } from "@/hooks/use-providers";
import { changedValueCount } from "@/lib/draft-values";

import { DirtyNotice } from "../../components/DirtyNotice";
import { useDraftGuard } from "../../hooks/use-draft-guard";
import { ModelDetail } from "../../providers/components/ModelDetail";
import { providerToDraft } from "../../providers/draft";
import { modelEntrySchema } from "../../schemas/provider";

interface ModelEditPanelProps {
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
  isNavRequested = false,
  onClose,
  onNavRequestResolved,
  target,
}: ModelEditPanelProps) {
  const { t } = useTranslation();
  const update = useUpdateProvider();
  const [model, setModel] = useState(target.model);
  const changedCount = changedValueCount(target.model, model);
  const isChanged = changedCount > 0;
  const [isRefused, setIsRefused] = useState(false);
  const guard = useDraftGuard({
    isChanged,
    isNavRequested,
    isSaving: update.isPending,
    onLeave: onClose,
    onNavRequestResolved,
  });
  // The provider document the compat fields resolve against, which is the
  // stored one: what the panel edits is the row, not the provider.
  const providerDraft = providerToDraft(target.provider);

  function handleSave(): void {
    if (update.isPending) return;
    const parsed = modelEntrySchema.safeParse(model);
    setIsRefused(!parsed.success);
    if (!parsed.success) return;
    update.reset();
    update.mutate(
      {
        id: target.provider.id,
        provider: {
          ...providerDraft,
          models: (providerDraft.models ?? []).map((entry, position) =>
            position === target.index ? model : entry,
          ),
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <FloatingPanel
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
            disabled={update.isPending}
            onClick={guard.requestLeave}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!isChanged || update.isPending}
            onClick={handleSave}
            size="sm"
            type="button"
          >
            {update.isPending ? t("common.saving") : t("common.save")}
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
      {guard.isBlocked && (
        <DirtyNotice onCancel={guard.cancel} onConfirm={guard.confirm} />
      )}
      <fieldset className="min-w-0" disabled={update.isPending}>
        <ModelDetail
          baseline={target.model}
          chrome="panel"
          errors={undefined}
          model={model}
          onBack={guard.requestLeave}
          onChange={setModel}
          provider={providerDraft}
        />
      </fieldset>
    </FloatingPanel>
  );
}
