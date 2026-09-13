import { Check, ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ModelSelection } from "@/types/model-selection";

import { FacetedFilter } from "@/components/common/FacetedFilter";
import { QueryNotice } from "@/components/common/QueryNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useProviders, useUnifiedModels } from "@/hooks/use-providers";
import {
  matchesModelFilters,
  modelDisplayName,
  sectionRows,
  unifiedCandidateRows,
} from "@/lib/model-catalog";
import { PROTOCOL_FAMILIES } from "@/lib/protocols";

interface ModelPickerProps {
  model: ModelSelection | null;
  onPick: (model: ModelSelection | null) => void;
}

const UNIFIED_GROUP = "unified-models";

export function ModelPicker({ model, onPick }: ModelPickerProps) {
  const { t } = useTranslation();
  const providers = useProviders();
  const unified = useUnifiedModels();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [protocols, setProtocols] = useState<string[]>([]);
  const rows = unifiedCandidateRows(providers.providers);
  const filtered = rows.filter((row) =>
    matchesModelFilters(row, { protocols, providerIds, search }),
  );
  const sections = sectionRows(filtered);
  const aggregates = unified.unifiedModels.flatMap((item) => {
    if ("corrupted" in item) return [];
    const members = rows.filter((row) =>
      item.members?.some(
        (member) =>
          member.providerId === row.provider.id &&
          member.model === row.model.id,
      ),
    );
    return [{ item, members }];
  });
  const shownAggregates = aggregates.filter(
    ({ item, members }) =>
      (providerIds.length === 0 || providerIds.includes(UNIFIED_GROUP)) &&
      item.id.toLowerCase().includes(search.trim().toLowerCase()) &&
      (protocols.length === 0 ||
        members.some((row) =>
          row.model.apis?.some((api) => protocols.includes(api)),
        )),
  );
  const providerOptions = sectionRows(rows).map((section) => ({
    count: section.rows.length,
    label: section.provider.name,
    value: section.provider.id,
  }));
  if (aggregates.length > 0)
    providerOptions.push({
      count: aggregates.length,
      label: t("settings.models.unified"),
      value: UNIFIED_GROUP,
    });
  const protocolOptions = PROTOCOL_FAMILIES.map((family) => ({
    count:
      rows.filter((row) => row.model.apis?.includes(family)).length +
      aggregates.filter(({ members }) =>
        members.some((row) => row.model.apis?.includes(family)),
      ).length,
    label: t(`settings.providers.protocolsShort.${family}`),
    value: family,
  }));
  const picked =
    model?.kind === "provider"
      ? rows.find(
          (row) =>
            row.provider.id === model.providerId &&
            row.model.id === model.modelId,
        )
      : undefined;
  const pickedAggregate =
    model?.kind === "unified"
      ? aggregates.find(({ item }) => item.id === model.modelId)
      : undefined;
  const pickedLabel =
    picked !== undefined
      ? modelDisplayName(picked.model)
      : pickedAggregate?.item.id;
  const isLoading = providers.isLoading || unified.isLoading;
  const error = providers.error ?? unified.error;

  function pick(next: ModelSelection): void {
    onPick(next);
    setIsOpen(false);
  }

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("chat.modelPicker")}
          className="max-w-64"
          size="sm"
          type="button"
          variant="ghost"
        >
          <span className="truncate">
            {pickedLabel ??
              (model === null ? t("chat.modelPickerEmpty") : model.modelId)}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 gap-0 p-0">
        {/* One line: the field takes the width the filters leave it, and the
            filters keep a fixed width — they count their selections instead
            of spelling them out, so a filter never grows into the field. */}
        <div className="flex min-w-0 items-center gap-1.5 border-b p-2">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
            <Input
              aria-label={t("chat.modelSearch")}
              className="pl-7"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("chat.modelSearch")}
              type="search"
              value={search}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <FacetedFilter
              onChange={setProviderIds}
              options={providerOptions}
              selectionDisplay="count"
              title={t("common.filterProvider")}
              values={providerIds}
            />
            <FacetedFilter
              onChange={setProtocols}
              options={protocolOptions}
              selectionDisplay="count"
              title={t("common.filterProtocol")}
              values={protocols}
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          <QueryNotice
            error={error}
            isLoading={isLoading}
            onRetry={() => {
              providers.retry();
              unified.retry();
            }}
          />
          {sections.map(({ provider, rows: group }) => (
            <div
              aria-label={provider.name}
              className="flex flex-col"
              key={provider.id}
              role="group"
            >
              <p className="text-muted-foreground px-1.5 py-1 text-xs font-medium">
                {provider.name}
              </p>
              {group.map((row) => (
                <PickerRow
                  id={row.model.id}
                  isPicked={
                    model?.kind === "provider" &&
                    model.providerId === provider.id &&
                    model.modelId === row.model.id
                  }
                  key={row.model.id}
                  label={modelDisplayName(row.model)}
                  onPick={() =>
                    pick({
                      kind: "provider",
                      modelId: row.model.id,
                      providerId: provider.id,
                    })
                  }
                />
              ))}
            </div>
          ))}
          {shownAggregates.length > 0 && (
            <div
              aria-label={t("settings.models.unified")}
              className="flex flex-col"
              role="group"
            >
              <p className="text-muted-foreground px-1.5 py-1 text-xs font-medium">
                {t("settings.models.unified")}
              </p>
              {shownAggregates.map(({ item, members }) => (
                <PickerRow
                  id={item.id}
                  isDisabled={members.length === 0}
                  isPicked={
                    model?.kind === "unified" && model.modelId === item.id
                  }
                  key={item.id}
                  label={item.id}
                  onPick={() => pick({ kind: "unified", modelId: item.id })}
                />
              ))}
            </div>
          )}
          {!isLoading &&
            error === null &&
            filtered.length === 0 &&
            shownAggregates.length === 0 && (
              <p className="text-muted-foreground px-1.5 py-3 text-center text-xs">
                {t(
                  rows.length === 0 && aggregates.length === 0
                    ? "chat.modelPickerNoModels"
                    : "settings.models.noResults",
                )}
              </p>
            )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PickerRow({
  id,
  isDisabled = false,
  isPicked,
  label,
  onPick,
}: {
  id: string;
  isDisabled?: boolean;
  isPicked: boolean;
  label: string;
  onPick: () => void;
}) {
  return (
    // bg-accent on hover, never bg-muted: inside a popover the muted token is
    // the panel's own colour, so a muted hover shows nothing in dark mode.
    <button
      aria-current={isPicked}
      className="hover:bg-accent flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-1 text-left outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
      disabled={isDisabled}
      onClick={onPick}
      type="button"
    >
      <Check
        className={
          isPicked ? "size-3.5 shrink-0" : "size-3.5 shrink-0 opacity-0"
        }
      />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span className="text-muted-foreground shrink-0 truncate font-mono text-xs">
        {id}
      </span>
    </button>
  );
}
