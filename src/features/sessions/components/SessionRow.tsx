import type { KeyboardEvent } from "react";

import { cn } from "cn";
import { Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  SESSION_ROW_ANIMATION_MS,
  useDeleteSession,
  useRenameSession,
  useSetSessionPinned,
} from "../hooks/use-sessions";

interface DeleteConfirmProps {
  onClose: () => void;
  onConfirm: () => void;
  session: Session;
}

interface InlineRenameProps {
  onDone: () => void;
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
  const remove = useDeleteSession();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  // Visual-layer exit: the row collapses while the delete runs in the
  // background; the cache removal lands when the animation window and the
  // IPC write have both completed. A failed delete clears the flag, so the
  // row recovers and shows the error code.
  const [isExiting, setIsExiting] = useState(false);
  const isEntering = useUiStore((s) => s.enteringSessionId === session.id);
  const clearEnteringSession = useUiStore((s) => s.clearEnteringSession);

  // The enter marker outlives the animation only for its duration; the timer
  // owns the clear (not the CSS event) so reduced-motion and environments
  // without CSS animation support still converge. The cleanup pairs with the
  // timeout so an unmount or a StrictMode remount leaves no stray timer.
  useEffect(() => {
    if (!isEntering) {
      return;
    }
    const timer = setTimeout(
      () => clearEnteringSession(),
      SESSION_ROW_ANIMATION_MS,
    );
    return () => clearTimeout(timer);
  }, [isEntering, clearEnteringSession]);

  // The edit takes over the row's interactive surface; the action cluster
  // and the hover ramp would only collide with the input.
  const isActionClusterHidden = isEditingTitle || isExiting;
  const actionError = remove.error ?? pin.error;

  function handleDeleteConfirm(): void {
    setIsDeleteOpen(false);
    pin.reset();
    setIsExiting(true);
    remove.mutate(
      { sessionId: session.id },
      {
        onError: () => setIsExiting(false),
      },
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // Nested buttons keep their own keyboard handling; their keydown events
    // bubble here, so only the row itself triggers selection.
    if (event.target !== event.currentTarget) {
      return;
    }
    // CSS pointer-events already disables the mouse path on an exiting row;
    // this closes the keyboard path so a collapsing row is not operable
    // through Tab + Enter/Space either.
    if (isExiting) {
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      setIsEditingTitle(true);
    } else if (event.key === "Enter" || event.key === " ") {
      // Prevent Space from scrolling the sidebar list.
      event.preventDefault();
      onSelect(session.id);
    }
  }

  return (
    <div
      aria-current={isActive ? "true" : undefined}
      aria-keyshortcuts="F2"
      aria-label={session.title}
      className={cn(
        "text-sidebar-foreground group/row focus-visible:ring-ring/50 relative flex h-8 items-center rounded-[6px] px-2 text-sm outline-none select-none focus-visible:ring-3",
        // Selected rows keep their tint while hovered or focused, so they
        // drop the hover/focus background classes entirely.
        isActive
          ? "session-row-selected"
          : "focus-within:bg-sidebar-accent hover:bg-sidebar-accent",
        isEntering && "session-row-enter",
        isExiting && "session-row-exit",
      )}
      onClick={() => onSelect(session.id)}
      onDoubleClick={(event) => {
        // Double-click anywhere on the row opens the inline edit, except on
        // the interactive controls (star/delete buttons and their popovers)
        // where a double click means repeated activation, not editing.
        if ((event.target as HTMLElement).closest("button")) {
          return;
        }
        setIsEditingTitle(true);
      }}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {isEditingTitle ? (
        <InlineRename
          onDone={() => setIsEditingTitle(false)}
          session={session}
        />
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{session.title}</span>
          {actionError !== null && !isExiting && (
            <p
              className="text-destructive max-w-[120px] shrink-0 truncate text-xs"
              role="alert"
            >
              {t(`errors.${actionError.code}`)}
            </p>
          )}
        </>
      )}
      {!isActionClusterHidden && (
        <>
          <div
            aria-hidden="true"
            className="session-fade pointer-events-none invisible absolute inset-y-0 right-0 w-[120px] rounded-[6px] group-focus-within/row:visible group-hover/row:visible"
          />
          <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
            <Button
              aria-label={t(
                session.pinned ? "sessions.unfavorite" : "sessions.favorite",
              )}
              disabled={pin.isPending}
              onClick={(event) => {
                event.stopPropagation();
                remove.reset();
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
              onOpenChange={(open) => setIsDeleteOpen(open)}
              open={isDeleteOpen}
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
              {/* React synthetic events traverse portals along the React
                  tree, so popover clicks otherwise reach the row's onClick
                  and select the session being deleted. */}
              <PopoverContent
                align="end"
                className="w-auto"
                onClick={(event) => event.stopPropagation()}
              >
                <DeleteConfirmForm
                  onClose={() => setIsDeleteOpen(false)}
                  onConfirm={handleDeleteConfirm}
                  session={session}
                />
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}
    </div>
  );
}

// Pure confirmation surface: the parent closes the popover the moment the
// confirm lands, and the row's exit animation carries the rest of the
// feedback. The pending and failure states live in the row, not here.
function DeleteConfirmForm({
  onClose,
  onConfirm,
  session,
}: DeleteConfirmProps) {
  const { t } = useTranslation();
  // A pending send for the same session blocks the delete: the two writes
  // are mutually exclusive and the composer already refuses while a delete
  // is in flight.
  const isSendPending = useUiStore((s) => s.pendingSubmits.has(session.id));

  return (
    <div className="flex flex-col gap-2.5">
      <PopoverHeader>
        <PopoverTitle>{t("sessions.deleteConfirm")}</PopoverTitle>
      </PopoverHeader>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} size="xs" type="button" variant="ghost">
          {t("common.cancel")}
        </Button>
        <Button
          disabled={isSendPending}
          onClick={onConfirm}
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

// In-place title editor replacing the row's title span. Enter and blur
// commit; Escape reverts. An unchanged (after trim) or blank title never
// reaches the mutation: the edit simply closes and the original title
// stays. A failed rename keeps the input and surfaces the error code
// beside it so the user can retry by pressing Enter again.
function InlineRename({ onDone, session }: InlineRenameProps) {
  const { t } = useTranslation();
  const rename = useRenameSession();
  const [title, setTitle] = useState(session.title);
  // Set once Enter or Escape initiated the exit; the blur that follows the
  // input losing focus (or being removed) must not submit a second time.
  const exitedRef = useRef(false);

  function handleSubmit(): void {
    if (rename.isPending) {
      return;
    }
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0 || trimmedTitle === session.title) {
      exitedRef.current = true;
      onDone();
      return;
    }
    rename.mutate(
      { sessionId: session.id, title: trimmedTitle },
      {
        // The intentional exit lost its meaning: the edit stays open, so a
        // later blur must be able to commit the retry.
        onError: () => {
          exitedRef.current = false;
        },
        onSuccess: onDone,
      },
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {/* The outline container follows the composer's input language: a
          bordered surface that highlights as one unit on focus, with the
          input itself transparent. The -mx-2 cancels the row's px-2 and the
          full h-8 cancels the row's fixed height, so the container's edges
          meet the row's own background boundary on all four sides — the
          tinted surface is replaced by the input control in place, with no
          tint bleeding out around it. Corner radius matches the row's
          rounded-[6px] so the replacement keeps the row silhouette. */}
      <div className="border-input bg-background focus-within:border-ring focus-within:ring-ring/50 -mx-2 flex h-8 min-w-0 flex-1 items-center rounded-[6px] border px-1.5 focus-within:ring-3">
        <input
          aria-label={t("sessions.title")}
          autoFocus
          className="w-full min-w-0 cursor-text bg-transparent text-sm outline-none disabled:opacity-70"
          disabled={rename.isPending}
          onBlur={() => {
            if (!exitedRef.current) {
              handleSubmit();
            }
          }}
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
              // Mark the exit intentional: the pending state disables the
              // focused input, and the blur that fires from that must not
              // submit again.
              exitedRef.current = true;
              handleSubmit();
            } else if (event.key === "Escape") {
              event.stopPropagation();
              exitedRef.current = true;
              onDone();
            }
          }}
          value={title}
        />
      </div>
      {rename.error !== null && (
        <p className="text-destructive max-w-[120px] shrink-0 truncate text-xs">
          {t(`errors.${rename.error.code}`)}
        </p>
      )}
    </div>
  );
}
