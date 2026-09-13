import type { ReactNode } from "react";

import { cn } from "cn";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/icon-button";
import { useScrollChaining } from "@/hooks/use-scroll-chaining";

interface FloatingPanelProps {
  children: ReactNode;
  /** Actions under the content; the panel's own way out is in its header. */
  footer?: ReactNode;
  onClose: () => void;
  /**
   * `form` is the width a form reads at; `card` the wider one a read-only
   * summary needs to lay its sections out side by side.
   */
  size?: "card" | "form";
  /** Secondary line under the title, for what the panel is about. */
  subtitle?: ReactNode;
  title: string;
}

/**
 * A window over the page: the work that belongs to one row, opened and closed
 * without leaving the list it came from. It is a panel and not a page because
 * the list stays readable behind it — the row being edited keeps the context
 * that made it worth editing, and closing is one click rather than a way back
 * through the navigation.
 */
export function FloatingPanel({
  children,
  footer,
  onClose,
  size = "form",
  subtitle,
  title,
}: FloatingPanelProps) {
  const { t } = useTranslation();
  const bodyRef = useScrollChaining();
  return (
    <DialogPrimitive.Root
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Content
          className={cn(
            "bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-full -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl ring-1 duration-100 outline-none",
            size === "form" ? "max-w-lg" : "max-w-2xl",
          )}
          data-size={size}
        >
          <div className="flex shrink-0 items-start gap-2 border-b px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-sm font-medium">
                {title}
              </DialogPrimitive.Title>
              {subtitle !== undefined && (
                <DialogPrimitive.Description className="text-muted-foreground mt-0.5 truncate text-xs">
                  {subtitle}
                </DialogPrimitive.Description>
              )}
            </div>
            <IconButton
              aria-label={t("common.close")}
              onClick={onClose}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <X className="size-3.5" />
            </IconButton>
          </div>
          {/* The pane holds the wheel until the wheel keeps pressing against
              its end — see `useScrollChaining`. */}
          <div
            className="min-h-0 flex-1 scrollbar-none overflow-x-clip overflow-y-auto overscroll-contain px-4 py-3"
            ref={bodyRef}
          >
            {children}
          </div>
          {footer !== undefined && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2.5">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
