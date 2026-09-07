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

// Actions sit above the title's fade ramp but outside the row button so the
// row itself stays a single valid button element.
export function SessionRow({
  isActive,
  onDelete,
  onSelect,
  onToggleStar,
  session,
}: SessionRowProps) {
  const { t } = useTranslation();

  return (
    <div className="group/row relative">
      <button
        aria-current={isActive ? "true" : undefined}
        className={cn(
          "hover:bg-sidebar-accent text-sidebar-foreground flex h-8 w-full items-center rounded-[6px] px-2 text-left text-sm",
          isActive && "bg-sidebar-selected text-sidebar-accent-foreground",
        )}
        onClick={onSelect}
        type="button"
      >
        <span className="session-title-fade min-w-0 flex-1 overflow-hidden whitespace-nowrap">
          {session.title}
        </span>
      </button>
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
