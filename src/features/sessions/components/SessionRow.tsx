import type { KeyboardEvent } from "react";

import { cn } from "cn";
import { Pencil, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Session } from "@/types/ipc";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUiStore } from "@/stores/ui-store";

import {
  useDeleteSession,
  useRenameSession,
  useSetSessionPinned,
} from "../hooks/use-sessions";

interface SessionActionFormProps {
  onClose: () => void;
  session: Session;
}

interface SessionRowProps {
  isActive: boolean;
  onSelect: (sessionId: string) => void;
  session: Session;
}

// The row is one div[role=button] carrying the hover tint itself; the title
// fade ramp and the action cluster are its children bound via
// group-hover/row, so background, ramp, and buttons always share a single
// hover state. A real button element cannot contain the nested action
// buttons, hence role=button with manual keyboard handling; the action
// buttons stop propagation so clicking them never selects the row.
export function SessionRow({ isActive, onSelect, session }: SessionRowProps) {
  const { t } = useTranslation();
  const pin = useSetSessionPinned();
  const [openAction, setOpenAction] = useState<"delete" | "rename" | null>(
    null,
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // Nested buttons keep their own keyboard handling; their keydown events
    // bubble here, so only the row itself triggers selection.
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      // Prevent Space from scrolling the sidebar list.
      event.preventDefault();
      onSelect(session.id);
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
      onClick={() => onSelect(session.id)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <span className="min-w-0 flex-1 truncate">{session.title}</span>
      <div
        aria-hidden="true"
        className="session-fade pointer-events-none invisible absolute inset-y-0 right-0 w-[120px] rounded-[6px] group-focus-within/row:visible group-hover/row:visible"
      />
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
        <Button
          aria-label={t(
            session.pinned ? "sessions.unfavorite" : "sessions.favorite",
          )}
          disabled={pin.isPending}
          onClick={(event) => {
            event.stopPropagation();
            pin.mutate({ pinned: !session.pinned, sessionId: session.id });
          }}
          size="icon-xs"
          variant="ghost"
        >
          {/* Amber is the old app's favorite accent; no semantic token
              covers it. */}
          <Star
            className={cn(
              "size-3.5 text-amber-500",
              session.pinned && "fill-amber-500",
            )}
          />
        </Button>
        <Popover
          onOpenChange={(open) => setOpenAction(open ? "rename" : null)}
          open={openAction === "rename"}
        >
          <PopoverTrigger asChild>
            <Button
              aria-label={t("sessions.rename")}
              onClick={(event) => event.stopPropagation()}
              size="icon-xs"
              variant="ghost"
            >
              <Pencil className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <RenameForm onClose={() => setOpenAction(null)} session={session} />
          </PopoverContent>
        </Popover>
        <Popover
          onOpenChange={(open) => setOpenAction(open ? "delete" : null)}
          open={openAction === "delete"}
        >
          <PopoverTrigger asChild>
            <Button
              aria-label={t("sessions.delete")}
              onClick={(event) => event.stopPropagation()}
              size="icon-xs"
              variant="ghost"
            >
              <Trash2 className="text-destructive size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <DeleteConfirmForm
              onClose={() => setOpenAction(null)}
              session={session}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function DeleteConfirmForm({ onClose, session }: SessionActionFormProps) {
  const { t } = useTranslation();
  const remove = useDeleteSession();
  // A pending send for the same session blocks the delete: the two writes
  // are mutually exclusive and the composer already refuses while a delete
  // is in flight.
  const isSendPending = useUiStore((s) => s.pendingSubmits.has(session.id));

  return (
    <div className="flex flex-col gap-2.5">
      <PopoverHeader>
        <PopoverTitle>{t("sessions.deleteConfirm")}</PopoverTitle>
      </PopoverHeader>
      {remove.error !== null && (
        <p className="text-destructive text-xs">
          {t(`errors.${remove.error.code}`)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          disabled={remove.isPending}
          onClick={onClose}
          size="xs"
          type="button"
          variant="ghost"
        >
          {t("common.cancel")}
        </Button>
        <Button
          disabled={remove.isPending || isSendPending}
          onClick={() =>
            remove.mutate({ sessionId: session.id }, { onSuccess: onClose })
          }
          size="xs"
          type="button"
          variant="destructive"
        >
          {t("sessions.delete")}
        </Button>
      </div>
    </div>
  );
}

function RenameForm({ onClose, session }: SessionActionFormProps) {
  const { t } = useTranslation();
  const rename = useRenameSession();
  const [title, setTitle] = useState(session.title);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !rename.isPending;

  function handleSubmit(): void {
    if (!canSubmit) {
      return;
    }
    rename.mutate(
      { sessionId: session.id, title: trimmedTitle },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <PopoverHeader>
        <PopoverTitle>{t("sessions.title")}</PopoverTitle>
      </PopoverHeader>
      <input
        aria-label={t("sessions.title")}
        className="border-input bg-background focus-visible:ring-ring/50 focus-visible:border-ring h-7 rounded-[6px] px-2 text-sm outline-none focus-visible:ring-3"
        disabled={rename.isPending}
        onChange={(event) => setTitle(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          // IME confirmation can arrive after compositionend. Remove this
          // fallback when supported WebViews report those keydowns as
          // isComposing.
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          const isCompositionKey = event.nativeEvent.keyCode === 229;
          if (event.nativeEvent.isComposing || isCompositionKey) {
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            handleSubmit();
          }
        }}
        value={title}
      />
      {rename.error !== null && (
        <p className="text-destructive text-xs">
          {t(`errors.${rename.error.code}`)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          disabled={rename.isPending}
          onClick={onClose}
          size="xs"
          type="button"
          variant="ghost"
        >
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!canSubmit}
          onClick={handleSubmit}
          size="xs"
          type="button"
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
