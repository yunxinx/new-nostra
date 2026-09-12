import type { KeyboardEvent } from "react";

import { cn } from "cn";
import { useTranslation } from "react-i18next";

import type { ProviderListItem } from "@/types/ipc";

import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ProviderRowProps {
  isActive: boolean;
  isToggling: boolean;
  onSelect: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  provider: ProviderListItem;
}

// One list row: a div[role=button] so the enabled switch can live inside it as
// a real button. The switch stops both the click and the keydown path, so
// toggling never selects the row. It is the only enabled control there is —
// the detail pane does not repeat it — so it carries the explanation the
// settings row used to hold beside it.
export function ProviderRow({
  isActive,
  isToggling,
  onSelect,
  onToggleEnabled,
  provider,
}: ProviderRowProps) {
  const { t } = useTranslation();
  const name =
    "corrupted" in provider
      ? t("settings.providers.corruptedName")
      : provider.name;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      // Space would otherwise scroll the list.
      event.preventDefault();
      onSelect(provider.id);
    }
  }

  return (
    <div
      aria-current={isActive ? "true" : undefined}
      aria-label={name}
      className={cn(
        "text-foreground group/row focus-visible:ring-ring/50 flex h-8 items-center gap-2 rounded-[6px] px-2 text-sm outline-none select-none focus-visible:ring-3",
        isActive ? "bg-secondary" : "hover:bg-muted",
      )}
      onClick={() => onSelect(provider.id)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          // A disabled provider reads as inactive in the list itself, not only
          // through the switch beside it.
          "enabled" in provider && !provider.enabled && "text-muted-foreground",
        )}
      >
        {name}
      </span>
      {"corrupted" in provider ? null : (
        <Tooltip>
          {/* The switch keeps its own state attribute: a trigger that wraps it
              directly would overwrite `data-state` with the tooltip's, and the
              track would lose both of its state colors. */}
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">
              <Switch
                aria-label={provider.name}
                checked={provider.enabled}
                disabled={isToggling}
                onCheckedChange={(enabled) =>
                  onToggleEnabled(provider.id, enabled)
                }
                onClick={(event) => event.stopPropagation()}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("settings.providers.enabledDesc")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
