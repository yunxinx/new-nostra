import { cn } from "cn";
import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** One filterable value; the count is the rows carrying it, badges aside. */
interface FacetedFilterOption {
  count?: number;
  label: string;
  value: string;
}

interface FacetedFilterProps {
  onChange: (values: string[]) => void;
  options: FacetedFilterOption[];
  /** The filter's name, on the trigger and over the option list. */
  title: string;
  values: string[];
}

/** How many selected labels the trigger spells out before it counts them. */
const MAX_SHOWN_LABELS = 2;

// The trigger stands next to a search field in a toolbar, so it takes the
// field's height rather than the smaller one a standalone button uses: two
// controls on one line that differ by 4px read as misaligned.
const TRIGGER_HEIGHT = "h-8";

// The panel's own search field, which needs none of the input's chrome: the
// panel is already the box, and a focus ring inside it draws the eye away
// from the options it is narrowing.
const PANEL_SEARCH =
  "h-9 rounded-none border-0 bg-transparent pr-0 pl-7 shadow-none focus-visible:ring-0 dark:bg-transparent";

// A multi-select filter for a toolbar: the trigger names the field, and the
// selections it carries are badges on the trigger itself, so a filtered list
// says what narrowed it without opening anything. The panel filters its own
// options, because a facet with more than a handful of values is unreadable
// as a plain list.
export function FacetedFilter({
  onChange,
  options,
  title,
  values,
}: FacetedFilterProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(values), [values]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return options;
    }
    return options.filter((option) =>
      option.label.toLowerCase().includes(needle),
    );
  }, [options, query]);

  const selectedLabels = options
    .filter((option) => selected.has(option.value))
    .map((option) => option.label);

  function toggle(value: string): void {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange([...next]);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={title}
          className={cn("border-dashed", TRIGGER_HEIGHT)}
          size="sm"
          variant="outline"
        >
          <Plus className="size-3.5" />
          {title}
          {selectedLabels.length > 0 && (
            <>
              <span
                aria-hidden="true"
                className="bg-border mx-0.5 h-4 w-px shrink-0"
              />
              {selectedLabels.length > MAX_SHOWN_LABELS ? (
                <Badge className="px-1" variant="secondary">
                  {t("common.selectedCount", { count: selectedLabels.length })}
                </Badge>
              ) : (
                selectedLabels.map((label) => (
                  <Badge
                    className="max-w-24 px-1"
                    key={label}
                    variant="secondary"
                  >
                    <span className="truncate">{label}</span>
                  </Badge>
                ))
              )}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-0 p-0">
        <div className="border-b">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              aria-label={title}
              className={PANEL_SEARCH}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={title}
              type="search"
              value={query}
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {visible.map((option) => (
            <label
              className="hover:bg-muted flex h-7 min-w-0 cursor-default items-center gap-2 rounded-[4px] px-1.5 text-sm select-none"
              key={option.value}
            >
              <Checkbox
                aria-label={option.label}
                checked={selected.has(option.value)}
                onCheckedChange={() => toggle(option.value)}
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.count !== undefined && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {option.count}
                </span>
              )}
            </label>
          ))}
          {visible.length === 0 && (
            <p className="text-muted-foreground px-1.5 py-2 text-center text-xs">
              {t("common.filterEmpty")}
            </p>
          )}
        </div>
        {selected.size > 0 && (
          <div className="border-t p-1">
            <Button
              className="w-full"
              onClick={() => {
                setQuery("");
                onChange([]);
              }}
              size="xs"
              variant="ghost"
            >
              <X className="size-3" />
              {t("common.clearFilters")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
