import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ModelEntry, Protocol } from "@/types/ipc";

import { BulkActionBar } from "@/components/common/BulkActionBar";
import { DataTablePanel } from "@/components/common/DataTablePanel";
import { FacetedFilter } from "@/components/common/FacetedFilter";
import { useRowSelection } from "@/components/common/use-row-selection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isComposing } from "@/lib/keyboard";

import type { ModelErrors } from "../draft";
import type { ModelDraftRow } from "../model-draft";

import { protocolFamilySchema } from "../../schemas/compat";
import { modelEditorState } from "../model-draft";
import {
  BLANK_MODEL_ENTRY,
  hasFieldError,
  optionalText,
  toggleProtocol,
  withModelValue,
} from "../model-rows";

const FAMILIES = protocolFamilySchema.options;

// One width for all three protocol columns. Their headers are abbreviated
// ("Msg", "Chat", "Res"), so the longest of them sets the width and the three
// stay evenly spaced.
const PROTOCOL_COLUMN = "w-16";

/** One width for the two action columns: two CJK glyphs plus the cell pad. */
const ACTION_COLUMN = "w-12";

/** The request name's column: an id is long and is read whole. */
const MODEL_ID_COLUMN = "w-60";

/** The chosen name's column. */
const MODEL_NAME_COLUMN = "w-44";

const COLUMNS = [
  "w-10",
  MODEL_ID_COLUMN,
  MODEL_NAME_COLUMN,
  ...FAMILIES.map(() => PROTOCOL_COLUMN),
  ACTION_COLUMN,
  ACTION_COLUMN,
];

/**
 * The sum of the column widths above. Below it the table scrolls sideways
 * instead of squeezing the two name columns, which are the ones that would
 * lose their content first.
 */
const MIN_WIDTH = 744;

interface ModelDirectoryProps {
  /** The provider's default protocol: a new row pre-checks it. */
  api: Protocol;
  /** Row errors by position, as the resolver reports them under `models.N`. */
  errors: ModelErrors | undefined;
  modelRows: ModelDraftRow[];
  onModelsChange: (rows: ModelDraftRow[]) => void;
  /** Opens the per-model editor on one row of the stored order. */
  onOpenModel: (key: string) => void;
}

// The upstream manifest of one provider: the rows are what a save submits, in
// the order they are stored. The naming columns edit in place, the protocol
// matrix is the row's own values, and the actions column opens the row's
// editor. Rows can be ticked, and the actions over the ticked ones float over
// the page: removing a model and rewriting which protocols answer it are both
// things one does to several rows at once.
export function ModelDirectory({
  api,
  errors,
  modelRows,
  onModelsChange,
  onOpenModel,
}: ModelDirectoryProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [protocols, setProtocols] = useState<string[]>([]);
  const selection = useRowSelection();

  const models = modelRows.map((row) => row.model);
  const query = search.trim().toLowerCase();
  // Positions come from the stored array, never from the filtered view: the
  // row number, the move and the delete all address the stored order.
  const rows = modelRows
    .map((row, index) => ({ ...row, index }))
    .filter(
      ({ model }) =>
        (query === "" || rowText(model).includes(query)) &&
        (protocols.length === 0 ||
          (model.apis ?? []).some((entry) => protocols.includes(entry))),
    );

  const protocolOptions = useMemo(
    () =>
      FAMILIES.map((family) => ({
        count: models.filter((model) => (model.apis ?? []).includes(family))
          .length,
        label: t(`settings.providers.protocolsShort.${family}`),
        value: family,
      })),
    [models, t],
  );

  const visibleKeys = rows.map(({ key }) => key);
  const allVisibleSelected =
    rows.length > 0 && rows.every(({ key }) => selection.isSelected(key));

  // A row that is gone takes its tick with it; the tick belongs to the model,
  // not to the position it happened to hold.
  const { prune } = selection;
  useEffect(() => {
    prune(modelRows.map((row) => row.key));
  }, [modelRows, prune]);

  function handleAdd(): void {
    const key = crypto.randomUUID();
    onModelsChange([
      ...modelRows,
      {
        baseline: undefined,
        editor: modelEditorState(BLANK_MODEL_ENTRY),
        key,
        model: { ...BLANK_MODEL_ENTRY, apis: [api] },
      },
    ]);
    onOpenModel(key);
  }

  function handleRemove(index: number): void {
    onModelsChange(modelRows.filter((_, position) => position !== index));
  }

  function handleReplace(index: number, next: ModelEntry): void {
    onModelsChange(
      modelRows.map((entry, position) =>
        position === index ? { ...entry, model: next } : entry,
      ),
    );
  }

  function handleToggle(index: number, family: string): void {
    onModelsChange(
      modelRows.map((entry, position) =>
        position === index
          ? { ...entry, model: toggleProtocol(entry.model, family) }
          : entry,
      ),
    );
  }

  /** The stored positions of the ticked rows. */
  function selectedIndexes(): number[] {
    return modelRows
      .map((row, index) => ({ index, key: row.key }))
      .filter(({ key }) => selection.selected.includes(key))
      .map(({ index }) => index);
  }

  function handleRemoveSelected(): void {
    const indexes = selectedIndexes();
    onModelsChange(
      modelRows.filter((_, position) => !indexes.includes(position)),
    );
    selection.clear();
  }

  /**
   * Sets one protocol on every ticked row. The target is "on" unless every
   * ticked row already carries it, which is what the column's own checkbox
   * does when it is ticked from a mixed set.
   */
  function handleSetProtocol(family: string): void {
    const indexes = selectedIndexes();
    const carries = indexes.filter((index) =>
      (models[index]?.apis ?? []).includes(family),
    );
    const next = carries.length !== indexes.length;
    onModelsChange(
      modelRows.map((entry, position) =>
        indexes.includes(position) &&
        (entry.model.apis ?? []).includes(family) !== next
          ? { ...entry, model: toggleProtocol(entry.model, family) }
          : entry,
      ),
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 py-2">
        <div className="relative w-56 max-w-full">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            aria-label={t("settings.providers.searchModels")}
            className="pl-7"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("settings.providers.searchModels")}
            type="search"
            value={search}
          />
        </div>
        <FacetedFilter
          onChange={setProtocols}
          options={protocolOptions}
          title={t("common.filterProtocol")}
          values={protocols}
        />
        <Button
          className="ml-auto"
          onClick={handleAdd}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="size-3.5" />
          {t("settings.providers.addModel")}
        </Button>
      </div>
      <DataTablePanel
        columns={COLUMNS}
        header={
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <span className="sr-only">{t("common.selectAll")}</span>
                <div className="flex justify-center">
                  <Checkbox
                    aria-label={t("common.selectAll")}
                    checked={
                      allVisibleSelected
                        ? true
                        : rows.some(({ key }) => selection.isSelected(key))
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={() =>
                      selection.setMany(visibleKeys, !allVisibleSelected)
                    }
                  />
                </div>
              </TableHead>
              {/* The request name first: it is what the row is stored and
                  requested under, so it is the column a reader scans. The
                  chosen name follows it as a column of its own rather than as
                  a caption under it — two names stacked in one cell read as
                  one name with a subtitle, not as two things to compare. */}
              <TableHead>{t("settings.providers.modelId")}</TableHead>
              <TableHead>{t("settings.providers.modelName")}</TableHead>
              {FAMILIES.map((family) => (
                <TableHead className="text-center" key={family}>
                  {t(`settings.providers.protocolsAbbr.${family}`)}
                </TableHead>
              ))}
              {/* Editing and removing get a column each: sharing one column
                  puts a destructive click one small gap away from the click
                  that opens the row. */}
              <TableHead className="text-center">
                {t("settings.providers.editColumn")}
              </TableHead>
              <TableHead className="text-center">
                {t("settings.providers.removeColumn")}
              </TableHead>
            </TableRow>
          </TableHeader>
        }
        minWidth={MIN_WIDTH}
      >
        <TableBody>
          {rows.map(({ index, key, model }) => {
            const label =
              model.id === ""
                ? t("settings.providers.modelUntitled")
                : model.id;
            return (
              <TableRow
                data-state={selection.isSelected(key) ? "selected" : undefined}
                key={key}
              >
                <TableCell className="p-1">
                  <div className="flex justify-center">
                    <Checkbox
                      aria-label={label}
                      checked={selection.isSelected(key)}
                      onCheckedChange={() => selection.toggle(key)}
                    />
                  </div>
                </TableCell>
                <TableCell className="min-w-0">
                  <span
                    aria-invalid={hasFieldError(errors?.[index]) || undefined}
                    className={
                      hasFieldError(errors?.[index])
                        ? "text-destructive block w-full truncate font-mono text-xs"
                        : "text-muted-foreground block w-full truncate font-mono text-xs"
                    }
                  >
                    {label}
                  </span>
                </TableCell>
                <TableCell className="min-w-0">
                  <InlineTextCell
                    ariaLabel={`${t("settings.providers.modelName")} · ${label}`}
                    onCommit={(text) =>
                      handleReplace(
                        index,
                        withModelValue(model, "name", optionalText(text)),
                      )
                    }
                    value={model.name ?? ""}
                  />
                </TableCell>
                {FAMILIES.map((family) => (
                  <TableCell key={family}>
                    <div className="flex justify-center">
                      <Checkbox
                        aria-label={`${t(`settings.providers.protocolsShort.${family}`)} · ${model.id === "" ? t("settings.providers.modelUntitled") : model.id}`}
                        checked={(model.apis ?? []).includes(family)}
                        onCheckedChange={() => handleToggle(index, family)}
                      />
                    </div>
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex justify-center">
                    <IconButton
                      aria-label={t("settings.providers.editModel", {
                        model: label,
                      })}
                      onClick={() => onOpenModel(key)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <Pencil className="size-3.5" />
                    </IconButton>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-center">
                    <IconButton
                      aria-label={t("settings.providers.removeModelRow", {
                        model: label,
                      })}
                      onClick={() => handleRemove(index)}
                      size="icon-xs"
                      type="button"
                      variant="destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell
                className="text-muted-foreground py-4 text-center text-sm"
                colSpan={FAMILIES.length + 5}
              >
                {t(
                  models.length === 0
                    ? "settings.providers.modelsEmpty"
                    : "settings.providers.modelsNoResults",
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </DataTablePanel>
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" type="button" variant="ghost">
              {t("settings.providers.bulkProtocol")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {FAMILIES.map((family) => {
              const indexes = selectedIndexes();
              const carries = indexes.filter((index) =>
                (models[index]?.apis ?? []).includes(family),
              );
              return (
                <DropdownMenuCheckboxItem
                  checked={
                    carries.length === 0
                      ? false
                      : carries.length === indexes.length
                        ? true
                        : "indeterminate"
                  }
                  key={family}
                  onCheckedChange={() => handleSetProtocol(family)}
                  // The item sets rather than reflects: a click that lands on
                  // a mixed selection must not close the menu before the next
                  // protocol can be picked.
                  onSelect={(event) => event.preventDefault()}
                >
                  {t(`settings.providers.protocolsShort.${family}`)}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          onClick={handleRemoveSelected}
          size="xs"
          type="button"
          variant="destructive"
        >
          <Trash2 className="size-3" />
          {t("settings.providers.removeModel")}
        </Button>
      </BulkActionBar>
    </div>
  );
}

// A text cell that turns into its own input: clicking the text edits in
// place, Enter or losing focus commits, Escape reverts. Committing unchanged
// text is a no-op, so a stray click never marks the draft dirty.
function InlineTextCell({
  ariaLabel,
  onCommit,
  value,
}: {
  ariaLabel: string;
  onCommit: (text: string) => void;
  value: string;
}) {
  // Null while the cell shows text; the editing draft otherwise.
  const [draft, setDraft] = useState<null | string>(null);
  // Set by the keyboard exits: the blur that follows Enter or Escape must not
  // commit a second time (and must not undo the Escape).
  const exitedRef = useRef(false);

  function commit(): void {
    if (draft !== null && draft !== value) {
      onCommit(draft);
    }
    setDraft(null);
  }

  if (draft === null) {
    return (
      <button
        aria-label={ariaLabel}
        className="focus-visible:ring-ring/50 block w-full cursor-text truncate rounded-[4px] text-left outline-none focus-visible:ring-3"
        onClick={() => {
          exitedRef.current = false;
          setDraft(value);
        }}
        type="button"
      >
        {value === "" ? (
          <span className="text-muted-foreground/60">—</span>
        ) : (
          value
        )}
      </button>
    );
  }

  return (
    <Input
      aria-label={ariaLabel}
      autoFocus
      className="h-7 w-full"
      onBlur={() => {
        if (!exitedRef.current) {
          commit();
        }
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (isComposing(event.nativeEvent)) return;
        if (event.key === "Enter") {
          event.preventDefault();
          // The pending state and the re-keyed row drop this input on commit;
          // mark the exit so the unmount cannot submit again.
          exitedRef.current = true;
          commit();
        } else if (event.key === "Escape") {
          event.stopPropagation();
          exitedRef.current = true;
          setDraft(null);
        }
      }}
      value={draft}
    />
  );
}

/** The lowercased text one row matches a search against. */
function rowText(model: ModelEntry): string {
  return [model.id, model.name]
    .filter((part) => part !== undefined)
    .join(" ")
    .toLowerCase();
}
