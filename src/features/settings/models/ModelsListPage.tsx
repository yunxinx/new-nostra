import { IdCard, Pencil, Search, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ModelEntry, Provider } from "@/types/ipc";

import { BulkActionBar } from "@/components/common/BulkActionBar";
import { DataTablePanel } from "@/components/common/DataTablePanel";
import {
  FacetedFilter,
  type FacetedFilterOption,
} from "@/components/common/FacetedFilter";
import { ProtocolIcon } from "@/components/common/ProtocolIcon";
import { QueryNotice } from "@/components/common/QueryNotice";
import { useRowSelection } from "@/components/common/use-row-selection";
import { VendorIcon } from "@/components/common/VendorIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useProviderPresets,
  useProviders,
  useUpdateProvider,
} from "@/hooks/use-providers";
import { presetIdForBaseUrl } from "@/lib/brand-marks";
import {
  type AggregateRow,
  aggregateRows,
  matchesModelFilters,
  modelDisplayName,
  sectionRows,
} from "@/lib/model-catalog";

import { providerToDraft } from "../providers/draft";
import { protocolFamilySchema } from "../schemas/compat";
import { ModelCardPanel } from "./components/ModelCardPanel";
import { ModelEditPanel } from "./components/ModelEditPanel";
import { ProtocolBadge } from "./components/ProtocolBadge";
import { formatRate, priceSummary } from "./model-pricing";
import { useBatchDelete } from "./use-batch-delete";

/** Every column a row and a group row both span. */
const COLUMN_COUNT = 5;

/** One width per column; the protocols take what is left. */
const COLUMNS = ["w-10", "w-64", undefined, "w-32", "w-20"];

type ModelAction =
  | {
      anchor: HTMLElement;
      key: string;
      kind: "open";
      panelKind: ModelPanel["kind"];
    }
  | { keys: string[]; kind: "delete" }
  | { kind: "close" };

interface ModelPanel {
  anchor: HTMLElement;
  kind: "card" | "edit";
  row: AggregateRow;
}

export function ModelsListPage({
  isNavRequested = false,
  onNavRequestResolved,
}: {
  isNavRequested?: boolean;
  onNavRequestResolved?: (accepted: boolean) => void;
}) {
  const { t } = useTranslation();
  const { error, isLoading, providers, retry } = useProviders();
  const presets = useProviderPresets();
  const batch = useBatchDelete();
  const update = useUpdateProvider();
  const [search, setSearch] = useState("");
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [protocols, setProtocols] = useState<string[]>([]);
  const [panel, setPanel] = useState<ModelPanel | null>(null);
  const [pendingAction, setPendingAction] = useState<ModelAction | null>(null);
  const selection = useRowSelection();

  // A disabled provider answers nothing, so its models are not part of the
  // catalogue this page is: a price and a protocol set you cannot call are
  // noise in a list whose question is "what can I send a request to".
  const rows = useMemo(
    () => aggregateRows(providers).filter((row) => row.provider.enabled),
    [providers],
  );
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesModelFilters(row, { protocols, providerIds, search }),
      ),
    [protocols, providerIds, rows, search],
  );
  const sections = useMemo(() => sectionRows(filtered), [filtered]);

  const providerOptions = useMemo<FacetedFilterOption[]>(() => {
    const counts = new Map<string, number>();
    const owners = new Map<string, Provider>();
    for (const row of rows) {
      counts.set(row.provider.id, (counts.get(row.provider.id) ?? 0) + 1);
      owners.set(row.provider.id, row.provider);
    }
    return [...owners].map(([value, provider]) => ({
      count: counts.get(value) ?? 0,
      icon: (
        <VendorIcon
          presetId={presetIdForBaseUrl(provider.baseUrl, presets.presets)}
        />
      ),
      label: provider.name,
      value,
    }));
  }, [presets.presets, rows]);

  const protocolOptions = useMemo<FacetedFilterOption[]>(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const api of row.model.apis ?? []) {
        counts.set(api, (counts.get(api) ?? 0) + 1);
      }
    }
    return protocolFamilySchema.options.map((family) => ({
      count: counts.get(family) ?? 0,
      icon: <ProtocolIcon family={family} />,
      label: t(`settings.providers.protocols.${family}`),
      value: family,
    }));
  }, [rows, t]);

  const allVisibleSelected =
    filtered.length > 0 &&
    filtered.every((row) => selection.isSelected(rowKey(row)));

  const hasEditor = panel?.kind === "edit";

  useEffect(() => {
    if (isNavRequested && !hasEditor && !batch.isDeleting)
      onNavRequestResolved?.(true);
  }, [batch.isDeleting, hasEditor, isNavRequested, onNavRequestResolved]);
  const { prune } = selection;
  useEffect(() => {
    prune(rows.map(rowKey));
  }, [prune, rows]);

  function removeModels(keys: string[]): void {
    const targets = sectionRows(
      rows.filter((row) => keys.includes(rowKey(row))),
    ).map(({ provider, rows: selected }) => ({
      keys: selected.map(rowKey),
      label: provider.name,
      remove: () =>
        update.mutateAsync({
          id: provider.id,
          provider: {
            ...providerToDraft(provider),
            models: (provider.models ?? []).filter(
              (model) => !selected.some((row) => row.model.id === model.id),
            ),
          },
        }),
    }));
    void batch.run(targets, (keys) => selection.setMany(keys, false));
  }

  function applyAction(action: ModelAction): void {
    setPendingAction(null);
    switch (action.kind) {
      case "close":
        setPanel(null);
        break;
      case "delete":
        setPanel(null);
        removeModels(action.keys);
        break;
      case "open": {
        // A save can refresh the provider while a switch waits. Resolve the
        // requested identity now so its editor never inherits an old snapshot.
        const row = rows.find((entry) => rowKey(entry) === action.key);
        setPanel(
          row === undefined
            ? null
            : { anchor: action.anchor, kind: action.panelKind, row },
        );
        break;
      }
    }
  }

  function requestAction(action: ModelAction): void {
    if (action.kind === "close") {
      // The control that opened a panel is the control that closes it, and the
      // switch is the whole of that click: the panel leaves the anchor alone,
      // so nothing closes in front of it. A panel with nothing to lose goes on
      // the spot; an editor holding a draft is asked about first, the way every
      // other way out of it is.
      if (isNavRequested) return;
      if (hasEditor) setPendingAction(action);
      else setPanel(null);
      return;
    }
    if (
      isNavRequested ||
      (batch.isDeleting &&
        (action.kind === "delete" || action.panelKind === "edit"))
    ) {
      return;
    }
    if (
      action.kind === "open" &&
      panel?.kind === action.panelKind &&
      rowKey(panel.row) === action.key
    ) {
      requestAction({ kind: "close" });
      return;
    }
    if (hasEditor) setPendingAction(action);
    else applyAction(action);
  }

  function handlePanelClose(): void {
    if (!isNavRequested && pendingAction !== null) applyAction(pendingAction);
    else {
      setPanel(null);
      setPendingAction(null);
    }
  }

  function handlePanelNavResolved(accepted: boolean): void {
    if (isNavRequested) {
      setPendingAction(null);
      onNavRequestResolved?.(accepted);
    } else if (pendingAction !== null) {
      if (accepted) applyAction(pendingAction);
      else setPendingAction(null);
    }
  }

  // The same 8px inset on three sides as the provider list's column: the
  // search field, the table and the window's edge share one line, and the
  // toolbar keeps no top inset of its own — the title strip above it is
  // already the page's top edge.
  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-2 pb-2">
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <div className="relative w-56">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            aria-label={t("settings.models.search")}
            className="pl-7"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("settings.models.searchPlaceholder")}
            type="search"
            value={search}
          />
        </div>
        <FacetedFilter
          onChange={setProviderIds}
          options={providerOptions}
          title={t("common.filterProvider")}
          values={providerIds}
        />
        <FacetedFilter
          onChange={setProtocols}
          options={protocolOptions}
          title={t("common.filterProtocol")}
          values={protocols}
        />
        {/* A surface, not a caption: the count answers "how many did the
            filters leave", which is a result to read, not a label. */}
        <Badge className="ml-auto" variant="secondary">
          {t("settings.models.count", { count: filtered.length })}
        </Badge>
      </div>
      <QueryNotice error={error} isLoading={isLoading} onRetry={retry} />
      {batch.failures.length > 0 && (
        <p className="text-destructive py-2 text-xs" role="alert">
          {t("settings.models.deleteFailed", {
            names: batch.failures.join(", "),
          })}
        </p>
      )}
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
                        : filtered.some((row) =>
                              selection.isSelected(rowKey(row)),
                            )
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={() =>
                      selection.setMany(
                        filtered.map((row) => rowKey(row)),
                        !allVisibleSelected,
                      )
                    }
                  />
                </div>
              </TableHead>
              <TableHead>{t("settings.models.model")}</TableHead>
              <TableHead>{t("settings.models.protocols")}</TableHead>
              <TableHead>{t("settings.models.pricing")}</TableHead>
              <TableHead className="text-center">
                {t("common.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
        }
      >
        <TableBody>
          {sections.map(({ provider, rows: group }) => (
            <Fragment key={provider.id}>
              {/* One table, one heading per provider: the group row spans
                    every column, so a row never repeats the provider its model
                    belongs to. */}
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell
                  className="py-1 text-xs font-medium"
                  colSpan={COLUMN_COUNT}
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate">{provider.name}</span>
                    <span className="text-muted-foreground font-normal tabular-nums">
                      {t("settings.models.count", { count: group.length })}
                    </span>
                  </span>
                </TableCell>
              </TableRow>
              {group.map((row) => (
                <ModelListRow
                  activePanel={
                    panel !== null && rowKey(panel.row) === rowKey(row)
                      ? panel.kind
                      : null
                  }
                  isDeleting={batch.isDeleting}
                  isSelected={selection.isSelected(rowKey(row))}
                  key={rowKey(row)}
                  model={row.model}
                  onOpenPanel={(panelKind, anchor) =>
                    requestAction({
                      anchor,
                      key: rowKey(row),
                      kind: "open",
                      panelKind,
                    })
                  }
                  onToggle={() => selection.toggle(rowKey(row))}
                />
              ))}
            </Fragment>
          ))}
          {!isLoading && error === null && filtered.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell
                className="text-muted-foreground py-6 text-center text-sm"
                colSpan={COLUMN_COUNT}
              >
                {t(
                  rows.length === 0
                    ? "settings.models.emptyLibrary"
                    : "settings.models.noResults",
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </DataTablePanel>
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <Button
          disabled={batch.isDeleting}
          onClick={() =>
            requestAction({
              keys: rows
                .filter((row) => selection.isSelected(rowKey(row)))
                .map(rowKey),
              kind: "delete",
            })
          }
          size="xs"
          type="button"
          variant="destructive"
        >
          <Trash2 className="size-3" />
          {t("settings.providers.removeModel")}
        </Button>
      </BulkActionBar>
      {panel?.kind === "edit" && (
        <ModelEditPanel
          anchor={panel.anchor}
          isNavRequested={isNavRequested || pendingAction !== null}
          key={`edit-${rowKey(panel.row)}`}
          onClose={handlePanelClose}
          onNavRequestResolved={handlePanelNavResolved}
          target={{
            index: (panel.row.provider.models ?? []).findIndex(
              (entry) => entry.id === panel.row.model.id,
            ),
            model: panel.row.model,
            provider: panel.row.provider,
          }}
        />
      )}
      {panel?.kind === "card" && (
        <ModelCardPanel
          anchor={panel.anchor}
          key={`card-${rowKey(panel.row)}`}
          model={panel.row.model}
          onClose={handlePanelClose}
          provider={panel.row.provider}
        />
      )}
    </div>
  );
}

function ModelListRow({
  activePanel,
  isDeleting,
  isSelected,
  model,
  onOpenPanel,
  onToggle,
}: {
  activePanel: ModelPanel["kind"] | null;
  isDeleting: boolean;
  isSelected: boolean;
  model: ModelEntry;
  onOpenPanel: (kind: ModelPanel["kind"], anchor: HTMLElement) => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <TableRow data-state={isSelected ? "selected" : undefined}>
      <TableCell className="p-1">
        <div className="flex justify-center">
          <Checkbox
            aria-label={modelDisplayName(model)}
            checked={isSelected}
            onCheckedChange={onToggle}
          />
        </div>
      </TableCell>
      <TableCell className="min-w-0">
        {/* The name a model is read by, and under it the name the upstream is
            called by: the request name is what the provider knows, never the
            first thing a reader is after. */}
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{modelDisplayName(model)}</span>
          <span className="text-muted-foreground truncate font-mono text-xs">
            {model.id}
          </span>
        </div>
      </TableCell>
      <TableCell>
        {(model.apis ?? []).length === 0 ? (
          <span className="text-muted-foreground text-xs">
            {t("settings.models.noProtocol")}
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {(model.apis ?? []).map((family) => (
              <ProtocolBadge
                family={family}
                key={family}
                label={t(`settings.providers.protocolsAbbr.${family}`, {
                  defaultValue: family,
                })}
              />
            ))}
          </div>
        )}
      </TableCell>
      <PriceCell cost={model.cost} />
      <TableCell>
        <div className="flex items-center justify-center gap-0.5">
          {/* The editor snapshots the whole provider document and saves it
              back wholesale, so it must not open over a delete in flight: the
              snapshot still carries the model the write just removed, and
              saving would put it back. */}
          <IconButton
            aria-expanded={activePanel === "edit"}
            aria-haspopup="dialog"
            aria-label={t("settings.models.editModel", {
              model: modelDisplayName(model),
            })}
            disabled={isDeleting}
            onClick={(event) => onOpenPanel("edit", event.currentTarget)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Pencil className="size-3.5" />
          </IconButton>
          <IconButton
            aria-expanded={activePanel === "card"}
            aria-haspopup="dialog"
            aria-label={t("settings.models.viewCard", {
              model: modelDisplayName(model),
            })}
            onClick={(event) => onOpenPanel("card", event.currentTarget)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <IdCard className="size-3.5" />
          </IconButton>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * What a model costs, as one column. The badge names how it is billed and the
 * detail rides on a hover, because four rates, their tiers and their peak
 * window are far too much to give a column of their own and too useful to
 * leave to a second window.
 */
function PriceCell({ cost }: { cost: ModelEntry["cost"] }) {
  const { t } = useTranslation();
  const summary = priceSummary(cost);
  if (summary === null) {
    return <TableCell className="text-muted-foreground text-xs">—</TableCell>;
  }
  return (
    <TableCell>
      {/* Shorter than the app's deliberate 1s: the price detail is the answer
          to a question the column raises on sight, so it is a panel the
          reader goes looking for rather than a flash to be guarded against. */}
      <Tooltip delayDuration={TOOLTIP_PRICE_DELAY_MS}>
        <TooltipTrigger asChild>
          {/* Inline, so the hover target is the badges and nothing else: a
              wrapping flex container is as wide as the column, so it answers a
              hover in the empty half of a line — which reads as the whole cell
              lighting up. An inline box hugs the marks it carries on every
              line, and the spaces between them are where it may break. */}
          <span
            className="focus-visible:ring-ring/50 cursor-default rounded-[4px] outline-none select-none focus-visible:ring-3"
            role="button"
            tabIndex={0}
          >
            <Badge className="font-normal" variant="secondary">
              {t("settings.models.usageBased")}
            </Badge>
            {summary.extras.includes("tiered") && (
              <>
                {" "}
                <Badge className="font-normal" variant="outline">
                  {t("settings.models.tiered", {
                    count: summary.tiers.length,
                  })}
                </Badge>
              </>
            )}
            {summary.extras.includes("peak") && (
              <>
                {" "}
                <Badge className="font-normal" variant="outline">
                  {t("settings.providers.modelCostPeak")}
                </Badge>
              </>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent className="flex max-w-sm flex-col items-start gap-2">
          <RateBlock
            heading={t("settings.providers.costBase")}
            rates={summary.rates}
          />
          {summary.tiers.map((tier, index) => (
            <RateBlock
              heading={`${t("settings.providers.costTierAbove")} ${tier.threshold}`}
              key={index}
              rates={tier.rates}
            />
          ))}
          {summary.peak !== undefined && (
            <RateBlock
              heading={t("settings.providers.modelCostPeak")}
              rates={summary.peak}
            />
          )}
        </TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

/** The hover delay of the price column's own detail. */
const TOOLTIP_PRICE_DELAY_MS = 250;

/** One named group of rates: a heading, then one rate per line. */
function RateBlock({
  heading,
  rates,
}: {
  heading: string;
  rates: Array<{ key: string; value: number }>;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-col gap-0.5">
      <span className="text-muted-foreground text-xs font-medium">
        {heading}
      </span>
      <dl className="m-0 flex w-full flex-col gap-0.5">
        {rates.map((rate) => (
          <div className="flex w-full items-baseline gap-2" key={rate.key}>
            <dt className="text-muted-foreground min-w-0 flex-1 text-xs">
              {t(`settings.providers.${rate.key}`)}
            </dt>
            <dd className="font-mono text-xs tabular-nums">
              {formatRate(rate.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The key one row is ticked and re-found under: the provider a model belongs
 * to and the name it is requested by, which together are what the stored
 * document addresses it by.
 */
function rowKey(row: AggregateRow): string {
  return `${row.provider.id}\u0000${row.model.id}`;
}
