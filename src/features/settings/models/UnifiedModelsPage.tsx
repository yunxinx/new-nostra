import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProviderListItem, UnifiedModel } from "@/types/ipc";

import { BulkActionBar } from "@/components/common/BulkActionBar";
import {
  DataTablePanel,
  STICKY_TABLE_HEADER,
} from "@/components/common/DataTablePanel";
import { QueryNotice } from "@/components/common/QueryNotice";
import {
  type RowSelection,
  useRowSelection,
} from "@/components/common/use-row-selection";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDeleteUnifiedModel,
  useProviders,
  useUnifiedModels,
} from "@/hooks/use-providers";
import { unifiedMemberLabel } from "@/lib/model-catalog";

import { UnifiedModelEditor } from "./components/UnifiedModelEditor";
import { useBatchDelete } from "./use-batch-delete";

/** Which surface the page shows: the list, or the editor of one aggregate. */
type EditorState = { id: null | string; kind: "editor" } | { kind: "list" };

/**
 * Ordered aggregate names that stand in for a group of upstream models: the
 * list of what exists, and the editor that creates or renames one. A member
 * list is an attempt order, so the editor is where order is arranged rather
 * than a column of this table.
 */
export function UnifiedModelsPage({
  isNavRequested = false,
  onNavRequestResolved,
}: {
  isNavRequested?: boolean;
  onNavRequestResolved?: ((accepted: boolean) => void) | undefined;
}) {
  const { t } = useTranslation();
  const providerQuery = useProviders();
  const { providers } = providerQuery;
  const { error, isLoading, retry, unifiedModels } = useUnifiedModels();
  const selection = useRowSelection();
  const batch = useBatchDelete();
  const remove = useDeleteUnifiedModel();
  const [editor, setEditor] = useState<EditorState>({ kind: "list" });
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      unifiedModels.filter(
        (item) =>
          query === "" ||
          item.id.toLowerCase().includes(query) ||
          ("members" in item &&
            (item.members ?? []).some((member) =>
              member.model.toLowerCase().includes(query),
            )),
      ),
    [query, unifiedModels],
  );

  const { prune } = selection;
  useEffect(() => {
    prune(unifiedModels.map((item) => item.id));
  }, [prune, unifiedModels]);
  useEffect(() => {
    if (isNavRequested && editor.kind === "list" && !batch.isDeleting)
      onNavRequestResolved?.(true);
  }, [batch.isDeleting, editor.kind, isNavRequested, onNavRequestResolved]);
  const allSelected =
    visible.length > 0 &&
    visible.every((item) => selection.isSelected(item.id));

  function removeSelected(): void {
    void batch.run(
      unifiedModels
        .filter((item) => selection.isSelected(item.id))
        .map((item) => ({
          keys: [item.id],
          label: item.id,
          remove: () => remove.mutateAsync({ id: item.id }),
        })),
      (keys) => selection.setMany(keys, false),
    );
  }

  if (editor.kind === "editor") {
    const initial =
      editor.id === null
        ? null
        : (unifiedModels.find(
            (item): item is UnifiedModel =>
              !("corrupted" in item) && item.id === editor.id,
          ) ?? null);
    return (
      <>
        <QueryNotice
          error={providerQuery.error}
          isLoading={providerQuery.isLoading}
          onRetry={providerQuery.retry}
        />
        <UnifiedModelEditor
          initial={initial}
          isNavRequested={isNavRequested}
          key={editor.id ?? "new"}
          onDone={() => setEditor({ kind: "list" })}
          onNavRequestResolved={onNavRequestResolved}
          providers={providers}
        />
      </>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-10 pb-6">
      <div className="flex flex-wrap items-center gap-2 py-3">
        <div className="relative w-56">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            aria-label={t("settings.models.searchUnified")}
            className="pl-7"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("settings.models.searchUnified")}
            type="search"
            value={search}
          />
        </div>
        <Button
          className="ml-auto"
          onClick={() => setEditor({ id: null, kind: "editor" })}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="size-3.5" />
          {t("settings.models.unifiedNew")}
        </Button>
      </div>
      <QueryNotice
        error={error ?? providerQuery.error}
        isLoading={isLoading || providerQuery.isLoading}
        onRetry={() => {
          retry();
          providerQuery.retry();
        }}
      />
      {batch.failures.length > 0 && (
        <p className="text-destructive py-2 text-xs" role="alert">
          {t("settings.models.deleteFailed", {
            names: batch.failures.join(", "),
          })}
        </p>
      )}
      <DataTablePanel>
        <Table
          className="table-fixed"
          containerClassName="h-full overflow-y-auto"
        >
          <TableHeader className={STICKY_TABLE_HEADER}>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  aria-label={t("common.selectAll")}
                  checked={
                    allSelected
                      ? true
                      : visible.some((item) => selection.isSelected(item.id))
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={() =>
                    selection.setMany(
                      visible.map((item) => item.id),
                      !allSelected,
                    )
                  }
                />
              </TableHead>
              <TableHead className="w-56">
                {t("settings.models.unifiedId")}
              </TableHead>
              <TableHead>{t("settings.models.member")}</TableHead>
              <TableHead className="w-16 text-center">
                {t("common.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((item) =>
              "corrupted" in item ? (
                <CorruptedUnifiedRow
                  key={item.id}
                  selection={selection}
                  unifiedId={item.id}
                />
              ) : (
                <UnifiedRow
                  key={item.id}
                  onEdit={() => setEditor({ id: item.id, kind: "editor" })}
                  providers={providers}
                  selection={selection}
                  unified={item}
                />
              ),
            )}
            {!isLoading && error === null && visible.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  className="text-muted-foreground py-6 text-center text-sm"
                  colSpan={4}
                >
                  {t(
                    unifiedModels.length === 0
                      ? "settings.models.noUnified"
                      : "settings.models.noResults",
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DataTablePanel>
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <Button
          disabled={batch.isDeleting}
          onClick={removeSelected}
          size="xs"
          type="button"
          variant="destructive"
        >
          <Trash2 className="size-3" />
          {t("common.delete")}
        </Button>
      </BulkActionBar>
    </div>
  );
}

/** A corrupted aggregate: the placeholder name and a delete entry only. */
function CorruptedUnifiedRow({
  selection,
  unifiedId,
}: {
  selection: RowSelection;
  unifiedId: string;
}) {
  const { t } = useTranslation();
  return (
    <TableRow>
      <SelectionCell id={unifiedId} selection={selection} />
      <TableCell className="text-muted-foreground w-56 truncate">
        {t("settings.models.corruptedName")}
      </TableCell>
      <TableCell className="text-muted-foreground min-w-0 text-xs">
        <div className="flex flex-col">
          <span>{t("settings.models.corruptedNotice")}</span>
          <span>{t("settings.models.corruptedHint")}</span>
        </div>
      </TableCell>
      <TableCell className="w-16">
        <div className="flex items-center justify-center">
          <DeleteUnifiedButton unifiedId={unifiedId} />
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Confirmed delete of one aggregate; the failure stays on the row surface. */
function DeleteUnifiedButton({ unifiedId }: { unifiedId: string }) {
  const { t } = useTranslation();
  const remove = useDeleteUnifiedModel();
  return (
    <div className="flex items-center gap-2">
      {remove.error !== null && (
        <p className="text-destructive text-xs" role="alert">
          {t(`errors.${remove.error.code}`)}
        </p>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            aria-label={t("settings.models.unifiedDelete")}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-3" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.models.unifiedDeleteConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.models.unifiedDeleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: unifiedId })}
              variant="destructive"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SelectionCell({
  id,
  selection,
}: {
  id: string;
  selection: RowSelection;
}) {
  return (
    <TableCell className="w-10">
      <Checkbox
        aria-label={id}
        checked={selection.isSelected(id)}
        onCheckedChange={() => selection.toggle(id)}
      />
    </TableCell>
  );
}

function UnifiedRow({
  onEdit,
  providers,
  selection,
  unified,
}: {
  onEdit: () => void;
  providers: ProviderListItem[];
  selection: RowSelection;
  unified: UnifiedModel;
}) {
  const { t } = useTranslation();
  const members = unified.members ?? [];
  return (
    <TableRow>
      <SelectionCell id={unified.id} selection={selection} />
      <TableCell className="w-56 min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{unified.id}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground min-w-0 text-xs">
        {members.length === 0 ? (
          t("settings.models.membersEmpty")
        ) : (
          <ol className="flex min-w-0 flex-col gap-0.5">
            {members.map((member, position) => (
              <li
                className="flex min-w-0 items-baseline gap-1.5"
                key={`${member.providerId} ${member.model}`}
              >
                <span className="w-3 shrink-0 text-right tabular-nums">
                  {position + 1}
                </span>
                <span className="truncate">
                  {unifiedMemberLabel(member, providers)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </TableCell>
      <TableCell className="w-16">
        <div className="flex items-center justify-center gap-0.5">
          <Button
            aria-label={t("settings.models.unifiedEdit")}
            onClick={onEdit}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Pencil className="size-3" />
          </Button>
          <DeleteUnifiedButton unifiedId={unified.id} />
        </div>
      </TableCell>
    </TableRow>
  );
}
