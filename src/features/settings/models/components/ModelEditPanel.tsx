import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ModelEntry, Provider } from "@/types/ipc";

import { FloatingPanel } from "@/components/common/FloatingPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { useUpdateProvider } from "@/hooks/use-providers";
import { modelDisplayName } from "@/lib/model-catalog";

import { hasInvalidCompatInputs } from "../../components/compat/compat-draft";
import { DirtyNotice } from "../../components/DirtyNotice";
import { useDraftGuard } from "../../hooks/use-draft-guard";
import { CompatRestoreButton } from "../../providers/components/CompatRestoreButton";
import {
  type CompatRestoreAction,
  ModelDetail,
} from "../../providers/components/ModelDetail";
import { ModelSectionTabs } from "../../providers/components/ModelSectionTabs";
import { providerToDraft } from "../../providers/draft";
import {
  changedModelCount,
  modelEditorState,
} from "../../providers/model-draft";
import { MODEL_SECTIONS } from "../../providers/model-sections";
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
  // Published by the editor while its compat section is open; the footer holds
  // it so it stands beside the buttons that save the same row.
  const [compatRestore, setCompatRestore] =
    useState<CompatRestoreAction | null>(null);
  const hasInvalidInputs = hasInvalidCompatInputs(editor.compatInputs);
  const changedCount = changedModelCount(target.model, model, editor);
  const isChanged = changedCount > 0;
  const [section, setSection] = useState<string>(MODEL_SECTIONS[0]);
  const [isRefused, setIsRefused] = useState(false);
  const guard = useDraftGuard({
    isChanged,
    isNavRequested,
    isSaving,
    onLeave: onClose,
    onNavRequestResolved,
  });
  // The provider document the compat fields resolve against, which is the
  // stored one: what the panel edits is the row, not the provider. Memoized on
  // the stored document, because the resolution treats a rebuilt draft as new
  // input and would re-resolve — and disable its own controls — on every
  // keystroke in this panel.
  const providerDraft = useMemo(
    () => providerToDraft(target.provider),
    [target.provider],
  );

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
    // The tab root stands above both halves of the tab it holds — the strip in
    // the panel's title bar, the panes in its body — and draws nothing itself:
    // the panel it holds is portalled out of this element.
    <Tabs className="contents" onValueChange={setSection} value={section}>
      <FloatingPanel
        anchor={anchor}
        dismissOnOutsidePress
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
            {compatRestore !== null && (
              <CompatRestoreButton action={compatRestore} isSaving={isSaving} />
            )}
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
        headerAccessory={<ModelSectionTabs section={section} size="sm" />}
        onClose={guard.requestLeave}
        title={modelDisplayName(model)}
        titleBadge={<Badge variant="secondary">{target.provider.name}</Badge>}
      >
        <DirtyNotice
          onCancel={guard.cancel}
          onConfirm={guard.confirm}
          open={guard.isBlocked}
        />
        <fieldset className="min-w-0" disabled={isSaving}>
          <ModelDetail
            baseline={target.model}
            editor={editor}
            errors={undefined}
            model={model}
            onChange={setModel}
            onCompatRestoreChange={setCompatRestore}
            onEditorChange={setEditor}
            provider={providerDraft}
            section={section}
          />
        </fieldset>
      </FloatingPanel>
    </Tabs>
  );
}
