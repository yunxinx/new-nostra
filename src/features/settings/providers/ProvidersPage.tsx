import type { ReactNode } from "react";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProviderDraft, ProviderPreset } from "@/types/ipc";

import {
  useCreateProvider,
  useProviders,
  useUpdateProvider,
} from "@/hooks/use-providers";

import { DirtyNotice } from "../components/DirtyNotice";
import { ProviderCorruptedNotice } from "./components/ProviderCorruptedNotice";
import { ProviderDraftForm } from "./components/ProviderDraftForm";
import { ProviderList } from "./components/ProviderList";
import { ProviderSplitDivider } from "./components/ProviderSplitDivider";
import {
  blankCreateDraft,
  freeProviderName,
  presetDraft,
  providerToDraft,
} from "./draft";
import { type ProviderTarget, useProviderDraft } from "./use-provider-draft";

/**
 * A list action that had to wait for the dirty guard: it runs unchanged once
 * the user confirms the draft may be discarded.
 * Legal value: { id: "p1", kind: "select" }
 */
type PendingIntent =
  | { enabled: boolean; id: string; kind: "toggle" }
  | { id: string; kind: "select" }
  | { kind: "blank" }
  | { kind: "preset"; preset: ProviderPreset };

/** Travel limits of the divider: narrow enough to stay compact, wide enough to
 *  show a long provider name with its switch. */
const LIST_MAX_WIDTH = 320;
const LIST_MIN_WIDTH = 160;
/** Width the list starts at, and the list's own column width before it. */
const LIST_WIDTH_DEFAULT = 200;

interface ProvidersPageProps {
  /**
   * True while the shell holds a navigation away from this page. The draft
   * guard lives here, so the page answers the request through
   * `onNavRequestResolved`; the shell stays on this page until then.
   */
  isNavRequested?: boolean;
  /**
   * Answers a parked navigation: true lets the shell perform the switch,
   * false drops the request (cancelled, or replaced by a newer blocked
   * action).
   */
  onNavRequestResolved?: (accepted: boolean) => void;
}

// Two columns, each scrolling on its own, divided by a draggable line: the
// provider list and the detail of the selected one. The page owns the dirty
// guard — every action that would drop an unsaved draft, including a
// navigation away, waits for an explicit confirm. A parked navigation outranks
// an intent parked before it (the switch is the latest blocked action); the
// older intent stays parked behind it, so cancelling the switch brings that
// notice back. Creating stores the row first, so the new provider is an
// ordinary list entry from the moment it appears and the form over it is a
// plain edit form.
export function ProvidersPage({
  isNavRequested = false,
  onNavRequestResolved,
}: ProvidersPageProps) {
  const { t } = useTranslation();
  const { isLoading, providers } = useProviders();
  const draft = useProviderDraft(providers);
  const create = useCreateProvider();
  const toggle = useUpdateProvider();
  const [pending, setPending] = useState<null | PendingIntent>(null);
  const [listWidth, setListWidth] = useState(LIST_WIDTH_DEFAULT);
  const target = draft.target;
  const isEmptyLibrary = !isLoading && providers.length === 0;
  const isNavBlocked = isNavRequested && draft.isChanged;

  // A clean draft cannot hold the switch, so the parked request is answered
  // as soon as it lands: the reply is an event to the shell, while the notice
  // a dirty draft shows is derived from the request rather than parked here.
  // Reverting the draft by hand while the notice is up answers through this
  // same path — nothing is left to guard.
  useEffect(() => {
    if (isNavRequested && !draft.isChanged) {
      onNavRequestResolved?.(true);
    }
  }, [draft.isChanged, isNavRequested, onNavRequestResolved]);

  function runIntent(intent: PendingIntent): void {
    switch (intent.kind) {
      case "blank":
        // Neither a name nor a base URL is optional to the write layer, so a
        // blank create stores the free placeholder name the list already
        // reserves room for and the default protocol's canonical endpoint.
        createStored(
          blankCreateDraft(freeName(t("settings.providers.untitled"))),
        );
        return;
      case "preset": {
        const preset = presetDraft(intent.preset);
        // A preset whose name is taken is stored under a numbered one: picking
        // a preset always lands a row.
        createStored({ ...preset, name: freeName(preset.name) });
        return;
      }
      case "select":
        draft.select(intent.id);
        return;
      case "toggle": {
        const item = providers.find((candidate) => candidate.id === intent.id);
        if (item === undefined || "corrupted" in item) {
          return;
        }
        // The quick toggle is a full-replace write, so it must carry the whole
        // stored document: the form's baseline when it holds this provider,
        // the cached row otherwise.
        toggle.reset();
        const stored = draft.baselineFor(item.id) ?? providerToDraft(item);
        toggle.mutate(
          { id: item.id, provider: { ...stored, enabled: intent.enabled } },
          {
            onSuccess: () => draft.applyStoredEnabled(item.id, intent.enabled),
          },
        );
      }
    }
  }

  function requestIntent(intent: PendingIntent): void {
    if (draft.isChanged) {
      // This newer blocked action replaces the parked navigation as what the
      // notice stands for; the shell must stop waiting on it.
      if (isNavBlocked) {
        onNavRequestResolved?.(false);
      }
      setPending(intent);
      return;
    }
    runIntent(intent);
  }

  function handleCancelPending(): void {
    if (isNavBlocked) {
      onNavRequestResolved?.(false);
      return;
    }
    setPending(null);
  }

  function handleConfirmDiscard(): void {
    if (isNavBlocked) {
      draft.discard();
      onNavRequestResolved?.(true);
      return;
    }
    const intent = pending;
    setPending(null);
    if (intent === null) {
      return;
    }
    draft.discard();
    runIntent(intent);
  }

  /** Stores a create payload and opens the stored row it returns. */
  function createStored(provider: ProviderDraft): void {
    if (create.isPending) {
      return;
    }
    create.reset();
    create.mutate(
      { provider },
      { onSuccess: (saved) => draft.adoptCreated(saved) },
    );
  }

  /** A name no stored provider holds; corrupted rows carry no readable name. */
  function freeName(base: string): string {
    return freeProviderName(
      base,
      providers.flatMap((provider) =>
        "corrupted" in provider ? [] : [provider.name],
      ),
    );
  }

  function renderDetail(): ReactNode {
    if (target.kind === "corrupted") {
      return (
        <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto px-10 pb-6">
          <ProviderCorruptedNotice
            onDeleted={() => draft.afterDelete(target.id)}
            providerId={target.id}
          />
        </div>
      );
    }
    if (target.kind === "none") {
      return (
        <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center px-10 text-sm">
          <p>
            {t(
              isEmptyLibrary
                ? "settings.providers.emptyHint"
                : "settings.providers.selectHint",
            )}
          </p>
        </div>
      );
    }
    // Re-keyed on the edited identity: the section and the open model are the
    // form's own state, and they belong to the provider that was open, not to
    // the next one. A save keeps the identity, so it keeps both.
    return <ProviderDraftForm controller={draft} key={target.id} />;
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* The page owns the list's width so the divider's value describes one
          column: the list keeps its own 8px inset from the line, the detail
          its 40px, exactly as they are inset from the window edge. Each column
          also reserves the window's title strip, so the divider between them
          runs from the window's top edge to its bottom. */}
      <div
        className="flex min-h-0 shrink-0 flex-col"
        style={{ width: listWidth }}
      >
        <div className="h-[34px] shrink-0" data-tauri-drag-region />
        <ProviderList
          actionError={create.error ?? toggle.error}
          activeId={targetRowId(target)}
          isToggling={toggle.isPending}
          onNewBlank={() => requestIntent({ kind: "blank" })}
          onNewPreset={(preset) => requestIntent({ kind: "preset", preset })}
          onSelect={(id) => requestIntent({ id, kind: "select" })}
          onToggleEnabled={(id, enabled) =>
            requestIntent({ enabled, id, kind: "toggle" })
          }
        />
      </div>
      <ProviderSplitDivider
        label={t("settings.providers.resizeList")}
        max={LIST_MAX_WIDTH}
        min={LIST_MIN_WIDTH}
        onChange={setListWidth}
        value={listWidth}
      />
      {/* min-w-0 is what lets the detail column shrink with the window: a
          flex item defaults to its content's minimum width, and the widest
          row would otherwise push the whole settings window wider than it
          is. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="h-[34px] shrink-0" data-tauri-drag-region />
        {(pending !== null || isNavBlocked) && (
          <DirtyNotice
            onCancel={handleCancelPending}
            onConfirm={handleConfirmDiscard}
          />
        )}
        {renderDetail()}
      </div>
    </div>
  );
}

/** The row the list highlights; an empty selection has none. */
function targetRowId(target: ProviderTarget): null | string {
  return "id" in target ? target.id : null;
}
