import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ModelCost } from "@/types/ipc";

import { DataTablePanel } from "@/components/common/DataTablePanel";
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
import { isDeepEqual } from "@/lib/deep-equal";

import { RevertButton } from "../../components/RevertButton";
import { type CostDraftRow, costDraftRows } from "../cost-draft";
import {
  costFromRules,
  type CostRates,
  type CostRuleDraft,
  costRules,
  type PeakWindowDraft,
  rateValue,
  WEEKDAYS,
} from "../model-rows";

interface ModelCostEditorProps {
  baseline?: ModelCost | undefined;
  onChange: (cost: ModelCost | undefined) => void;
  onRowsChange: (rows: CostDraftRow[]) => void;
  rows: CostDraftRow[];
}

/** The four rates every row carries, in the order they are read. */
const RATE_FIELDS = [
  { key: "input", labelKey: "costInput" },
  { key: "output", labelKey: "costOutput" },
  { key: "cacheRead", labelKey: "costCacheRead" },
  { key: "cacheWrite", labelKey: "costCacheWrite" },
] as const;

/** Every column of the rule table, for the rows that span them all. */
const COLUMN_COUNT = RATE_FIELDS.length + 2;

/** One width per column: the condition and the action take theirs, and the
 *  four rates share what is left. */
const COLUMNS = [
  "w-[28%]",
  ...RATE_FIELDS.map(() => undefined),
  "w-12",
] as const;

// One price list as one table of conditions: the base row prices every
// request, and every row under it names the condition that makes its four
// rates replace the base row's — a token threshold, or a set of peak windows.
// Reading a price means reading down one column of conditions, so a model that
// prices its busy hours or its long requests says so where its base price is,
// not in a block of its own further down the page.
//
// Rows are ordered, and the order is what the stored document keeps: a tier
// that starts lower than the one above it is read in the order it was written.
// The stored shape holds one peak block, so the table offers one peak row.
export function ModelCostEditor({
  baseline,
  onChange,
  onRowsChange,
  rows,
}: ModelCostEditorProps) {
  const { t } = useTranslation();
  const rules = rows.map((row) => row.rule);
  const stored = costRules(baseline);
  const hasPeak = rules.some((rule) => rule.kind === "peak");

  function update(next: CostDraftRow[]): void {
    onRowsChange(next);
    onChange(costFromRules(next.map((row) => row.rule)));
  }

  function updateRule(index: number, rule: CostRuleDraft): void {
    update(
      rows.map((entry, position) =>
        position === index ? { ...entry, rule } : entry,
      ),
    );
  }

  function addTier(): void {
    update([
      ...rows,
      {
        baseline: undefined,
        key: crypto.randomUUID(),
        rule: { above: "", kind: "tier", rates: blankRates() },
      },
    ]);
  }

  function addPeak(): void {
    update([
      ...rows,
      {
        baseline: undefined,
        key: crypto.randomUUID(),
        rule: { kind: "peak", rates: blankRates(), windows: [blankWindow()] },
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-5 items-center gap-2">
        <h3 className="text-muted-foreground text-xs font-medium select-none">
          {t("settings.providers.modelCost")}
        </h3>
        <span className="text-muted-foreground text-xs">
          {t("settings.providers.costUnit")}
        </span>
        {!isDeepEqual(costFromRules(rules), costFromRules(stored)) && (
          <RevertButton onRevert={() => update(costDraftRows(baseline))} />
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button onClick={addTier} size="xs" type="button" variant="outline">
            <Plus className="size-3" />
            {t("settings.providers.addCostTier")}
          </Button>
          <Button
            disabled={hasPeak}
            onClick={addPeak}
            size="xs"
            type="button"
            variant="outline"
          >
            <Plus className="size-3" />
            {t("settings.providers.addCostPeak")}
          </Button>
        </div>
      </div>
      <DataTablePanel
        columns={COLUMNS}
        header={
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("settings.providers.costCondition")}</TableHead>
              {RATE_FIELDS.map((field) => (
                <TableHead key={field.key}>
                  {t(`settings.providers.${field.labelKey}`)}
                </TableHead>
              ))}
              <TableHead className="text-center">
                {t("common.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
        }
        rows={4}
      >
        <TableBody>
          {rows.map((row, index) => (
            <RuleRows
              index={index}
              key={row.key}
              onRemove={() =>
                update(rows.filter((_, position) => position !== index))
              }
              onRuleChange={(next) => updateRule(index, next)}
              rule={row.rule}
              storedRates={row.baseline?.rates}
            />
          ))}
        </TableBody>
      </DataTablePanel>
    </div>
  );
}

function blankRates(): CostRates {
  return { cacheRead: "", cacheWrite: "", input: "", output: "" };
}

function blankWindow(): PeakWindowDraft {
  return { days: [], end: "", start: "" };
}

/** The condition cell: fixed text for the base row, an editor for the rest. */
function ConditionCell({
  onRuleChange,
  rule,
}: {
  onRuleChange: (rule: CostRuleDraft) => void;
  rule: CostRuleDraft;
}) {
  const { t } = useTranslation();
  if (rule.kind === "base") {
    return (
      <span className="text-muted-foreground text-xs">
        {t("settings.providers.costBase")}
      </span>
    );
  }
  if (rule.kind === "peak") {
    return (
      <span className="text-muted-foreground text-xs">
        {t("settings.providers.modelCostPeak")}
      </span>
    );
  }
  return (
    <Input
      aria-label={t("settings.providers.costTierAbove")}
      className="h-7"
      inputMode="numeric"
      onChange={(event) => onRuleChange({ ...rule, above: event.target.value })}
      placeholder={t("settings.providers.costTierAbove")}
      value={rule.above}
    />
  );
}

/**
 * The peak row's windows, as a block spanning the table: a window is what
 * decides whether the row's rates apply at all, so it belongs to the row it
 * gates, under it and indented to the condition column.
 */
function PeakWindowRows({
  onWindowsChange,
  windows,
}: {
  onWindowsChange: (windows: PeakWindowDraft[]) => void;
  windows: PeakWindowDraft[];
}) {
  const { t } = useTranslation();
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="p-0" colSpan={COLUMN_COUNT}>
        <div className="flex flex-col gap-1.5 px-2 py-2">
          <span className="text-muted-foreground text-xs">
            {t("settings.providers.peakWindows")}
          </span>
          {windows.map((window, index) => (
            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-1"
              key={index}
            >
              <div className="flex flex-wrap items-center gap-x-2">
                {WEEKDAYS.map((day) => (
                  <label className="flex items-center gap-1" key={day}>
                    <Checkbox
                      aria-label={`${t(`settings.providers.weekdays.${day}`)} ${String(index + 1)}`}
                      checked={window.days.includes(day)}
                      onCheckedChange={() =>
                        onWindowsChange(
                          windows.map((entry, position) =>
                            position === index
                              ? {
                                  ...entry,
                                  days: entry.days.includes(day)
                                    ? entry.days.filter(
                                        (entry) => entry !== day,
                                      )
                                    : [...entry.days, day],
                                }
                              : entry,
                          ),
                        )
                      }
                    />
                    <span className="text-xs">
                      {t(`settings.providers.weekdays.${day}`)}
                    </span>
                  </label>
                ))}
              </div>
              <Input
                aria-label={`${t("settings.providers.windowStart")} ${String(index + 1)}`}
                className="h-7 w-20"
                onChange={(event) =>
                  onWindowsChange(
                    windows.map((entry, position) =>
                      position === index
                        ? { ...entry, start: event.target.value }
                        : entry,
                    ),
                  )
                }
                value={window.start}
              />
              <span className="text-muted-foreground text-xs">–</span>
              <Input
                aria-label={`${t("settings.providers.windowEnd")} ${String(index + 1)}`}
                className="h-7 w-20"
                onChange={(event) =>
                  onWindowsChange(
                    windows.map((entry, position) =>
                      position === index
                        ? { ...entry, end: event.target.value }
                        : entry,
                    ),
                  )
                }
                value={window.end}
              />
              <IconButton
                aria-label={t("settings.providers.removePeakWindow")}
                onClick={() =>
                  onWindowsChange(
                    windows.filter((_, position) => position !== index),
                  )
                }
                size="icon-xs"
                type="button"
                variant="destructive"
              >
                <X className="size-3" />
              </IconButton>
            </div>
          ))}
          <Button
            className="self-start"
            onClick={() => onWindowsChange([...windows, blankWindow()])}
            size="xs"
            type="button"
            variant="ghost"
          >
            <Plus className="size-3" />
            {t("settings.providers.addPeakWindow")}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function RateInput({
  ariaLabel,
  baseline,
  onChange,
  value,
}: {
  ariaLabel: string;
  baseline?: string | undefined;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {baseline !== undefined &&
        (baseline.trim() === ""
          ? value.trim() !== ""
          : rateValue(baseline) !== rateValue(value)) && (
          <RevertButton onRevert={() => onChange(baseline)} />
        )}
      <Input
        aria-label={ariaLabel}
        className="h-7 text-right tabular-nums"
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

function RuleRows({
  index,
  onRemove,
  onRuleChange,
  rule,
  storedRates,
}: {
  index: number;
  onRemove: () => void;
  onRuleChange: (rule: CostRuleDraft) => void;
  rule: CostRuleDraft;
  storedRates: CostRates | undefined;
}) {
  const { t } = useTranslation();
  const isPeak = rule.kind === "peak";
  const removeLabel = isPeak
    ? t("settings.providers.removeCostPeak")
    : t("settings.providers.removeCostTier");
  // The row's own name, so four identical rate boxes are still told apart.
  const rowLabel =
    rule.kind === "base"
      ? t("settings.providers.costBase")
      : rule.kind === "peak"
        ? t("settings.providers.modelCostPeak")
        : `${t("settings.providers.costTierAbove")} ${String(index)}`;
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell className="min-w-0">
          <ConditionCell onRuleChange={onRuleChange} rule={rule} />
        </TableCell>
        {RATE_FIELDS.map((field) => (
          <TableCell className="p-1" key={field.key}>
            <RateInput
              ariaLabel={`${rowLabel} ${t(`settings.providers.${field.labelKey}`)}`}
              baseline={storedRates?.[field.key]}
              onChange={(next) =>
                onRuleChange({
                  ...rule,
                  rates: { ...rule.rates, [field.key]: next },
                })
              }
              value={rule.rates[field.key]}
            />
          </TableCell>
        ))}
        <TableCell className="p-1">
          {rule.kind === "base" ? null : (
            <div className="flex justify-center">
              <IconButton
                aria-label={removeLabel}
                onClick={onRemove}
                size="icon-xs"
                type="button"
                variant="destructive"
              >
                <X className="size-3" />
              </IconButton>
            </div>
          )}
        </TableCell>
      </TableRow>
      {isPeak && (
        <PeakWindowRows
          onWindowsChange={(windows) => onRuleChange({ ...rule, windows })}
          windows={rule.windows}
        />
      )}
    </>
  );
}
