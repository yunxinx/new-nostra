import type { ReactNode } from "react";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ModelCost } from "@/types/ipc";

import {
  DataTablePanel,
  STICKY_TABLE_HEADER,
} from "@/components/common/DataTablePanel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isDeepEqual } from "@/lib/deep-equal";

import { RevertButton } from "../../components/RevertButton";
import { SettingsRow } from "../../components/SettingsRow";
import {
  type CostDraft,
  costDraft,
  costFromDraft,
  type CostTierDraft,
  type PeakDraft,
  type PeakWindowDraft,
  WEEKDAYS,
} from "../model-rows";

interface ModelCostEditorProps {
  baseline?: ModelCost | undefined;
  onChange: (cost: ModelCost | undefined) => void;
  value: ModelCost | undefined;
}

/** The four rates every price block carries, in the order they are read. */
const RATE_FIELDS = [
  { key: "input", labelKey: "costInput" },
  { key: "output", labelKey: "costOutput" },
  { key: "cacheRead", labelKey: "costCacheRead" },
  { key: "cacheWrite", labelKey: "costCacheWrite" },
] as const;

// Price list of one model, in three blocks that answer one question each: the
// base rates, the usage tiers that replace them above a token threshold, and
// the peak rate that replaces them inside a window. Every block is a table,
// because a price is only legible as a row of a price list — a row of
// unlabelled boxes has to be read against a legend somewhere else.
export function ModelCostEditor({
  baseline,
  onChange,
  value,
}: ModelCostEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => costDraft(value));
  const stored = costDraft(baseline);

  function update(next: CostDraft): void {
    setDraft(next);
    onChange(costFromDraft(next));
  }

  function updateTier(index: number, tier: CostTierDraft): void {
    update({
      ...draft,
      tiers: draft.tiers.map((entry, position) =>
        position === index ? tier : entry,
      ),
    });
  }

  function handleTogglePeak(checked: boolean): void {
    update({ ...draft, peak: checked ? blankPeakDraft() : undefined });
  }

  return (
    <div className="flex flex-col gap-5">
      <CostBlock
        aside={
          <span className="text-muted-foreground text-xs">
            {t("settings.providers.costUnit")}
          </span>
        }
        title={t("settings.providers.costBase")}
      >
        <DataTablePanel rows={RATE_FIELDS.length}>
          <Table
            className="table-fixed"
            containerClassName="h-full overflow-y-auto"
          >
            <TableHeader className={STICKY_TABLE_HEADER}>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("settings.providers.costItem")}</TableHead>
                <TableHead className="w-40 text-right">
                  {t("settings.providers.costRate")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RATE_FIELDS.map((field) => (
                <TableRow className="hover:bg-transparent" key={field.key}>
                  <TableCell className="text-muted-foreground text-xs">
                    {t(`settings.providers.${field.labelKey}`)}
                  </TableCell>
                  <TableCell className="p-1">
                    <RateInput
                      ariaLabel={t(`settings.providers.${field.labelKey}`)}
                      baseline={stored[field.key]}
                      onChange={(next) =>
                        update({ ...draft, [field.key]: next })
                      }
                      value={draft[field.key]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTablePanel>
      </CostBlock>

      <CostBlock
        onRevert={
          !isDeepEqual(draft.tiers, stored.tiers)
            ? () => update({ ...draft, tiers: stored.tiers })
            : undefined
        }
        title={t("settings.providers.costTiers")}
      >
        <DataTablePanel rows={3}>
          <Table
            className="table-fixed"
            containerClassName="h-full overflow-y-auto"
          >
            <TableHeader className={STICKY_TABLE_HEADER}>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-24">
                  {t("settings.providers.costTierAbove")}
                </TableHead>
                {RATE_FIELDS.map((field) => (
                  <TableHead key={field.key}>
                    {t(`settings.providers.${field.labelKey}`)}
                  </TableHead>
                ))}
                <TableHead className="w-9 pl-0 text-center">
                  <span className="sr-only">
                    {t("settings.providers.removeCostTier")}
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.tiers.map((tier, index) => (
                // Tiers are positional and their inputs are controlled from
                // state, so the index is the row identity.
                <TableRow className="hover:bg-transparent" key={index}>
                  <TableCell className="p-1">
                    <RateInput
                      ariaLabel={`${t("settings.providers.costTierAbove")} ${String(index + 1)}`}
                      baseline={stored.tiers[index]?.inputTokensAbove ?? ""}
                      inputMode="numeric"
                      onChange={(inputTokensAbove) =>
                        updateTier(index, { ...tier, inputTokensAbove })
                      }
                      value={tier.inputTokensAbove}
                    />
                  </TableCell>
                  {RATE_FIELDS.map((field) => (
                    <TableCell className="p-1" key={field.key}>
                      <RateInput
                        ariaLabel={`${t(`settings.providers.${field.labelKey}`)} ${String(index + 1)}`}
                        baseline={stored.tiers[index]?.[field.key] ?? ""}
                        onChange={(next) =>
                          updateTier(index, { ...tier, [field.key]: next })
                        }
                        value={tier[field.key]}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="p-1 pl-0">
                    <Button
                      aria-label={t("settings.providers.removeCostTier")}
                      onClick={() =>
                        update({
                          ...draft,
                          tiers: draft.tiers.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <X className="size-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {draft.tiers.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="text-muted-foreground py-3 text-center text-xs"
                    colSpan={RATE_FIELDS.length + 2}
                  >
                    {t("common.emptyRows")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DataTablePanel>
        <Button
          onClick={() =>
            update({ ...draft, tiers: [...draft.tiers, blankTierDraft()] })
          }
          size="xs"
          type="button"
          variant="ghost"
        >
          <Plus className="size-3" />
          {t("settings.providers.addCostTier")}
        </Button>
      </CostBlock>

      <div className="flex flex-col gap-1.5">
        <SettingsRow
          label={t("settings.providers.modelCostPeak")}
          onRevert={
            !isDeepEqual(draft.peak, stored.peak)
              ? () => update({ ...draft, peak: stored.peak })
              : undefined
          }
        >
          <Switch
            aria-label={t("settings.providers.modelCostPeak")}
            checked={draft.peak !== undefined}
            onCheckedChange={handleTogglePeak}
          />
        </SettingsRow>
        {draft.peak !== undefined && (
          <PeakEditor
            baseline={stored.peak}
            draft={draft.peak}
            onChange={(peak) => update({ ...draft, peak })}
          />
        )}
      </div>
    </div>
  );
}

/** A new peak block: enabled with one empty window to fill in. */
function blankPeakDraft(): PeakDraft {
  return {
    cacheRead: "",
    cacheWrite: "",
    input: "",
    output: "",
    windows: [{ days: [], end: "", start: "" }],
  };
}

function blankTierDraft(): CostTierDraft {
  return {
    cacheRead: "",
    cacheWrite: "",
    input: "",
    inputTokensAbove: "",
    output: "",
  };
}

/** Heading of one price block; `aside` carries the block's unit. */
function CostBlock({
  aside,
  children,
  onRevert,
  title,
}: {
  aside?: ReactNode;
  children: ReactNode;
  onRevert?: (() => void) | undefined;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex min-h-5 items-center gap-2">
        <h3 className="text-muted-foreground text-xs font-medium select-none">
          {title}
        </h3>
        {aside}
      </div>
      <div className="flex items-start gap-1.5">
        {onRevert !== undefined && <RevertButton onRevert={onRevert} />}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </section>
  );
}

function PeakEditor({
  baseline,
  draft,
  onChange,
}: {
  baseline: PeakDraft | undefined;
  draft: PeakDraft;
  onChange: (peak: PeakDraft) => void;
}) {
  const { t } = useTranslation();

  function handleWindow(index: number, next: PeakWindowDraft): void {
    onChange({
      ...draft,
      windows: draft.windows.map((window, position) =>
        position === index ? next : window,
      ),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <DataTablePanel rows={RATE_FIELDS.length}>
        <Table
          className="table-fixed"
          containerClassName="h-full overflow-y-auto"
        >
          <TableHeader className={STICKY_TABLE_HEADER}>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("settings.providers.costItem")}</TableHead>
              <TableHead className="w-40 text-right">
                {t("settings.providers.costRate")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {RATE_FIELDS.map((field) => (
              <TableRow className="hover:bg-transparent" key={field.key}>
                <TableCell className="text-muted-foreground text-xs">
                  {t(`settings.providers.${field.labelKey}`)}
                </TableCell>
                <TableCell className="p-1">
                  <RateInput
                    ariaLabel={`${t("settings.providers.modelCostPeak")} ${t(`settings.providers.${field.labelKey}`)}`}
                    baseline={baseline?.[field.key] ?? ""}
                    onChange={(next) =>
                      onChange({ ...draft, [field.key]: next })
                    }
                    value={draft[field.key]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTablePanel>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-muted-foreground text-xs font-medium select-none">
          {t("settings.providers.peakWindows")}
        </h3>
        <DataTablePanel rows={2}>
          <Table
            className="table-fixed"
            containerClassName="h-full overflow-y-auto"
          >
            <TableHeader className={STICKY_TABLE_HEADER}>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("settings.providers.peakWindowDays")}</TableHead>
                <TableHead className="w-20">
                  {t("settings.providers.windowStart")}
                </TableHead>
                <TableHead className="w-20">
                  {t("settings.providers.windowEnd")}
                </TableHead>
                <TableHead className="w-9 pl-0 text-center">
                  <span className="sr-only">
                    {t("settings.providers.removePeakWindow")}
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.windows.map((window, index) => (
                <TableRow className="hover:bg-transparent" key={index}>
                  <TableCell className="p-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      {WEEKDAYS.map((day) => (
                        <label className="flex items-center gap-1" key={day}>
                          <Checkbox
                            aria-label={`${t(`settings.providers.weekdays.${day}`)} ${String(index + 1)}`}
                            checked={window.days.includes(day)}
                            onCheckedChange={() =>
                              handleWindow(index, {
                                ...window,
                                days: window.days.includes(day)
                                  ? window.days.filter((entry) => entry !== day)
                                  : [...window.days, day],
                              })
                            }
                          />
                          <span className="text-xs">
                            {t(`settings.providers.weekdays.${day}`)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="p-1">
                    <RateInput
                      ariaLabel={`${t("settings.providers.windowStart")} ${String(index + 1)}`}
                      baseline={baseline?.windows[index]?.start ?? ""}
                      inputMode="numeric"
                      onChange={(start) =>
                        handleWindow(index, { ...window, start })
                      }
                      value={window.start}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <RateInput
                      ariaLabel={`${t("settings.providers.windowEnd")} ${String(index + 1)}`}
                      baseline={baseline?.windows[index]?.end ?? ""}
                      inputMode="numeric"
                      onChange={(end) =>
                        handleWindow(index, { ...window, end })
                      }
                      value={window.end}
                    />
                  </TableCell>
                  <TableCell className="p-1 pl-0">
                    <Button
                      aria-label={t("settings.providers.removePeakWindow")}
                      onClick={() =>
                        onChange({
                          ...draft,
                          windows: draft.windows.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <X className="size-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {draft.windows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="text-muted-foreground py-3 text-center text-xs"
                    colSpan={4}
                  >
                    {t("common.emptyRows")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DataTablePanel>
        <Button
          onClick={() =>
            onChange({
              ...draft,
              windows: [...draft.windows, { days: [], end: "", start: "" }],
            })
          }
          size="xs"
          type="button"
          variant="ghost"
        >
          <Plus className="size-3" />
          {t("settings.providers.addPeakWindow")}
        </Button>
      </div>
    </div>
  );
}

function RateInput({
  ariaLabel,
  baseline,
  inputMode,
  onChange,
  value,
}: {
  ariaLabel: string;
  baseline?: string;
  inputMode?: "decimal" | "numeric";
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {baseline !== undefined && baseline !== value && (
        <RevertButton onRevert={() => onChange(baseline)} />
      )}
      <Input
        aria-label={ariaLabel}
        className="h-7 text-right tabular-nums"
        inputMode={inputMode ?? "decimal"}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}
