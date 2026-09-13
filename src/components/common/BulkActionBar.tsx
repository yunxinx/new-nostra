import type { ReactNode } from "react";

import { X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/icon-button";

interface BulkActionBarProps {
  children?: ReactNode;
  /** How many rows the actions apply to; the bar hides itself at zero. */
  count: number;
  onClear: () => void;
}

/**
 * The actions over a table's ticked rows, floating over the bottom of the
 * page they belong to. It is one bar rather than a toolbar above the table
 * because the actions only exist once rows are ticked: appearing where the
 * eye already is, it costs the table no height and asks nothing of the rows
 * that are not part of the selection.
 */
export function BulkActionBar({
  children,
  count,
  onClear,
}: BulkActionBarProps) {
  const { t } = useTranslation();

  // Escape leaves the selection the same way the close button does. An open
  // popover consumes the key first, so clearing does not race with dismissing
  // whatever the user is actually reading.
  useEffect(() => {
    if (count === 0) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest('[data-state="open"]')
      ) {
        return;
      }
      onClear();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [count, onClear]);

  if (count === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="bg-popover text-popover-foreground ring-border absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg px-2 py-1.5 shadow-md ring-1"
      role="toolbar"
    >
      <IconButton
        aria-label={t("common.clearSelection")}
        className="rounded-full"
        onClick={onClear}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <X className="size-3" />
      </IconButton>
      <span aria-hidden="true" className="bg-border h-5 w-px shrink-0" />
      <span className="text-muted-foreground px-1 text-sm whitespace-nowrap">
        {t("common.selectedCount", { count })}
      </span>
      <span aria-hidden="true" className="bg-border h-5 w-px shrink-0" />
      {children}
    </div>
  );
}
