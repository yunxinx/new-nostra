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

// Layering, outermost first: the row button (title, truncated), then the
// hover fade ramp (pointer-events-none, DOM after the button so it paints
// over the title), then the action cluster (paints over the ramp and stays
// clickable). The ramp lives outside the button so the row itself remains
// a single valid button element.
export function SessionRow({
  isActive,
  onDelete,
  onSelect,
  onToggleStar,
  session,
}: SessionRowProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "session-row group/row relative",
        isActive && "session-row-selected",
      )}
    >
      <button
        aria-current={isActive ? "true" : undefined}
        className="session-row-button text-sidebar-foreground flex h-8 w-full items-center rounded-[6px] px-2 text-left text-sm"
        onClick={onSelect}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">{session.title}</span>
      </button>
      <div
        aria-hidden="true"
        className="session-fade pointer-events-none invisible absolute inset-y-0 right-0 w-[98px] rounded-[6px] group-hover/row:visible"
      />
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
        <Button
          aria-label={t(
            session.starred ? "sessions.unfavorite" : "sessions.favorite",
          )}
          onClick={onToggleStar}
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
          onClick={onDelete}
          size="icon-xs"
          variant="ghost"
        >
          <Trash2 className="text-destructive size-3.5" />
        </Button>
      </div>
    </div>
  );
}
