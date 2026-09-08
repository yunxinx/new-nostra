import type { KeyboardEvent } from "react";

import { cn } from "cn";
import { Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import type { MockSession } from "../mock";

interface SessionRowProps {
  isActive: boolean;
  onDelete: () => void;
  onSelect: () => void;
  onToggleStar: () => void;
  session: MockSession;
}

// The row is one div[role=button] carrying the hover tint itself; the title
// fade ramp and the action cluster are its children bound via
// group-hover/row, so background, ramp, and buttons always share a single
// hover state. A real button element cannot contain the nested star/delete
// buttons, hence role=button with manual keyboard handling; the action
// buttons stop propagation so clicking them never selects the row.
export function SessionRow({
  isActive,
  onDelete,
  onSelect,
  onToggleStar,
  session,
}: SessionRowProps) {
  const { t } = useTranslation();

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // Nested buttons keep their own keyboard handling; their keydown events
    // bubble here, so only the row itself triggers selection.
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      // Prevent Space from scrolling the sidebar list.
      event.preventDefault();
      onSelect();
    }
  }

  return (
    <div
      aria-current={isActive ? "true" : undefined}
      aria-label={session.title}
      className={cn(
        "text-sidebar-foreground group/row focus-visible:ring-ring/50 relative flex h-8 items-center rounded-[6px] px-2 text-sm outline-none select-none focus-visible:ring-3",
        // Selected rows keep their tint while hovered or focused, so they
        // drop the hover/focus background classes entirely.
        isActive
          ? "session-row-selected"
          : "focus-within:bg-sidebar-accent hover:bg-sidebar-accent",
      )}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <span className="min-w-0 flex-1 truncate">{session.title}</span>
      <div
        aria-hidden="true"
        className="session-fade pointer-events-none invisible absolute inset-y-0 right-0 w-[98px] rounded-[6px] group-focus-within/row:visible group-hover/row:visible"
      />
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
        <Button
          aria-label={t(
            session.starred ? "sessions.unfavorite" : "sessions.favorite",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onToggleStar();
          }}
          size="icon-xs"
          variant="ghost"
        >
          {/* Amber is the old app's favorite accent; no semantic token
              covers it. */}
          <Star
            className={cn(
              "size-3.5 text-amber-500",
              session.starred && "fill-amber-500",
            )}
          />
        </Button>
        <Button
          aria-label={t("sessions.delete")}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          size="icon-xs"
          variant="ghost"
        >
          <Trash2 className="text-destructive size-3.5" />
        </Button>
      </div>
    </div>
  );
}
