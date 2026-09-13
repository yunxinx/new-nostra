import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AppError, ProviderListItem, ProviderPreset } from "@/types/ipc";

import { VendorIcon } from "@/components/common/VendorIcon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useProviderPresets, useProviders } from "@/hooks/use-providers";

import { ProviderRow } from "./ProviderRow";

interface ProviderListProps {
  /** The last list-level write failure: a create or an enabled toggle. */
  actionError: AppError | null;
  activeId: null | string;
  isToggling: boolean;
  onNewBlank: () => void;
  onNewPreset: (preset: ProviderPreset) => void;
  onSelect: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
}

// The list column owns its reads (the provider query the page subscribes to
// and the preset list the create menu offers) so loading, failure and empty
// states stay with the surface that shows them. The column is a search field
// over one list: the create action is the list's last row rather than a
// header button, so the whole column reads as the provider library. It fills
// whatever width the page gives it, inset by the same 8px on both sides.
export function ProviderList({
  actionError,
  activeId,
  isToggling,
  onNewBlank,
  onNewPreset,
  onSelect,
  onToggleEnabled,
}: ProviderListProps) {
  const { t } = useTranslation();
  const { error, isLoading, providers, retry } = useProviders();
  const {
    error: presetsError,
    presets,
    retry: retryPresets,
  } = useProviderPresets();
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const matches =
    query === ""
      ? providers
      : providers.filter((provider) =>
          rowName(provider, t).toLowerCase().includes(query),
        );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-2 pb-2">
        {/* The icon is placed against the field's own box, not against this
            padded wrapper: centring it on the wrapper would put it below the
            field's middle by half the padding. */}
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            aria-label={t("settings.providers.search")}
            className="pl-7"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("settings.providers.search")}
            type="search"
            value={search}
          />
        </div>
      </div>
      {/* Same 8px inset on both sides as the search field above, so a row
          starts and ends on that field's lines. The inset is padding rather
          than a reserved scrollbar gutter: on a box that scrolls vertically
          WebKit reserves the horizontal gutter as well, which leaves an empty
          scrollbar strip under the list, and the gutter's width is not the
          styled scrollbar's, so the two insets never match. `overflow-x-clip`
          keeps a stray horizontal overflow from adding a second scrollbar. */}
      <div className="min-h-0 flex-1 scrollbar-none overflow-x-clip overflow-y-auto px-2 pb-2">
        {isLoading ? null : error !== null ? (
          <ListError error={error} retry={retry} />
        ) : (
          <div className="flex flex-col gap-0.5">
            {matches.map((provider) => (
              <ProviderRow
                isActive={provider.id === activeId}
                isToggling={isToggling}
                key={provider.id}
                onSelect={onSelect}
                onToggleEnabled={onToggleEnabled}
                provider={provider}
              />
            ))}
            {matches.length === 0 && (
              <p className="text-muted-foreground px-2 py-2 text-xs select-none">
                {t(
                  providers.length === 0
                    ? "settings.providers.empty"
                    : "settings.providers.noResults",
                )}
              </p>
            )}
            {/* A create lands at the end of the list, where an active filter
                would hide it, so choosing one drops the filter: the row the
                click produces is always the row the user sees. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="text-muted-foreground hover:bg-muted hover:text-foreground border-border focus-visible:ring-ring/50 mt-1.5 flex h-8 w-full cursor-default items-center justify-center gap-2 rounded-[6px] border border-dashed px-2 text-sm outline-none select-none focus-visible:ring-3"
                  type="button"
                >
                  <Plus className="size-3.5 shrink-0" />
                  {t("settings.providers.new")}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => {
                    setSearch("");
                    onNewBlank();
                  }}
                >
                  {t("settings.providers.newBlank")}
                </DropdownMenuItem>
                {presets.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-muted-foreground text-xs">
                      {t("settings.providers.newFromPreset")}
                    </DropdownMenuLabel>
                    {presets.map((preset) => (
                      <DropdownMenuItem
                        key={preset.presetId}
                        onSelect={() => {
                          setSearch("");
                          onNewPreset(preset);
                        }}
                      >
                        <VendorIcon presetId={preset.presetId} />
                        {preset.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {presetsError !== null && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled>
                      {t(`errors.${presetsError.code}`)}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={retryPresets}>
                      {t("common.retry")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {actionError !== null && (
        <p className="text-destructive shrink-0 px-3 pb-2 text-xs" role="alert">
          {t(`errors.${actionError.code}`)}
        </p>
      )}
    </div>
  );
}

// A failed list read offers the retry that re-runs the query, never an empty
// list (an unreadable list and an empty library are different states).
function ListError({ error, retry }: { error: AppError; retry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-1 px-1 py-2">
      <p className="text-destructive text-xs" role="alert">
        {t(`errors.${error.code}`)}
      </p>
      <Button onClick={retry} size="xs" variant="ghost">
        {t("common.retry")}
      </Button>
    </div>
  );
}

/** The text the search matches: a corrupted row matches its placeholder name. */
function rowName(
  provider: ProviderListItem,
  t: (key: string) => string,
): string {
  return "corrupted" in provider
    ? t("settings.providers.corruptedName")
    : provider.name;
}
