import type { KeyboardEvent, PointerEvent, ReactNode } from "react";

import { cn } from "cn";
import { GripVertical, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/icon-button";
import { useScrollChaining } from "@/hooks/use-scroll-chaining";
import { isComposing } from "@/lib/keyboard";
import { TITLE_BAR_HEIGHT } from "@/lib/window-layout";

import {
  constrainPanelPosition,
  PANEL_EDGE_INSET,
  type PanelPosition,
  type PanelViewport,
  positionPanelAtAnchor,
} from "./floating-panel-position";

interface FloatingPanelProps {
  anchor: HTMLElement;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: "card" | "form";
  subtitle?: ReactNode;
  title: string;
}

interface PanelDrag {
  offsetLeft: number;
  offsetTop: number;
  pointerId: number;
}

export function FloatingPanel({
  anchor,
  children,
  footer,
  onClose,
  size = "form",
  subtitle,
  title,
}: FloatingPanelProps) {
  const { t } = useTranslation();
  const bodyRef = useScrollChaining();
  const moveHandleRef = useRef<HTMLButtonElement>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<null | PanelPosition>(null);
  const [viewport, setViewport] = useState(panelViewport);
  const [drag, setDrag] = useState<null | PanelDrag>(null);
  const isPositioned = position !== null;
  const moveHintId = useId();

  useLayoutEffect(() => {
    if (content === null) return;

    function measure(): void {
      if (content === null) return;
      const nextViewport = panelViewport();
      const bounds = content.getBoundingClientRect();
      setViewport((current) =>
        current.left === nextViewport.left &&
        current.top === nextViewport.top &&
        current.width === nextViewport.width &&
        current.height === nextViewport.height
          ? current
          : nextViewport,
      );
      setPosition((current) => {
        // Content growth must preserve the point the user opened or dragged
        // to; only a viewport collision may move an already placed panel.
        const next =
          current === null
            ? positionPanelAtAnchor(
                anchor.getBoundingClientRect(),
                bounds,
                nextViewport,
              )
            : constrainPanelPosition(current, bounds, nextViewport);
        return current?.left === next.left && current.top === next.top
          ? current
          : next;
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    window.addEventListener("resize", measure);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", measure);
    visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      visualViewport?.removeEventListener("resize", measure);
      visualViewport?.removeEventListener("scroll", measure);
    };
  }, [anchor, content]);

  useLayoutEffect(() => {
    if (isPositioned) content?.focus({ preventScroll: true });
  }, [content, isPositioned]);

  function moveTo(next: PanelPosition): void {
    if (content === null) return;
    setPosition(
      constrainPanelPosition(
        next,
        content.getBoundingClientRect(),
        panelViewport(),
      ),
    );
  }

  function handleDragStart(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || position === null || drag !== null) return;
    event.preventDefault();
    moveHandleRef.current?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      offsetLeft: event.clientX - position.left,
      offsetTop: event.clientY - position.top,
      pointerId: event.pointerId,
    });
  }

  function handleDragMove(event: PointerEvent<HTMLDivElement>): void {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    moveTo({
      left: event.clientX - drag.offsetLeft,
      top: event.clientY - drag.offsetTop,
    });
  }

  function handleDragEnd(event: PointerEvent<HTMLDivElement>): void {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  }

  function handleMoveKey(event: KeyboardEvent<HTMLButtonElement>): void {
    if (
      position === null ||
      isComposing(event.nativeEvent) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    const step = event.shiftKey ? 32 : 8;
    const next = { ...position };
    switch (event.key) {
      case "ArrowDown":
        next.top += step;
        break;
      case "ArrowLeft":
        next.left -= step;
        break;
      case "ArrowRight":
        next.left += step;
        break;
      case "ArrowUp":
        next.top -= step;
        break;
      default:
        return;
    }
    event.preventDefault();
    moveTo(next);
  }

  return (
    <DialogPrimitive.Root
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className={cn(
            "bg-popover text-popover-foreground ring-foreground/10 fixed z-50 flex flex-col rounded-lg shadow-md ring-1 outline-none",
            size === "form" ? "w-lg" : "w-2xl",
          )}
          data-size={size}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const active = anchor.ownerDocument.activeElement;
            // A background control or the next panel may already own focus.
            if (active === anchor.ownerDocument.body && anchor.isConnected) {
              anchor.focus({ preventScroll: true });
            }
          }}
          onEscapeKeyDown={(event) => {
            if (isComposing(event)) event.preventDefault();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => event.preventDefault()}
          ref={setContent}
          style={{
            left: position?.left ?? viewport.left + PANEL_EDGE_INSET,
            maxHeight: Math.max(0, viewport.height - PANEL_EDGE_INSET * 2),
            maxWidth: Math.max(0, viewport.width - PANEL_EDGE_INSET * 2),
            top: position?.top ?? viewport.top + PANEL_EDGE_INSET,
            visibility: position === null ? "hidden" : "visible",
          }}
        >
          <div
            className={cn(
              "flex shrink-0 touch-none items-start gap-2 border-b px-3 py-2.5 select-none",
              drag === null ? "cursor-grab" : "cursor-grabbing",
            )}
            onLostPointerCapture={() => setDrag(null)}
            onPointerCancel={handleDragEnd}
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
          >
            <IconButton
              aria-describedby={moveHintId}
              aria-label={t("common.movePanel", { title })}
              className="cursor-inherit"
              onKeyDown={handleMoveKey}
              ref={moveHandleRef}
            >
              <GripVertical className="size-3.5" />
            </IconButton>
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
              onPointerDown={(event) => event.stopPropagation()}
            >
              <X className="size-3.5" />
            </IconButton>
          </div>
          <p className="sr-only" id={moveHintId}>
            {t("common.movePanelHint")}
          </p>
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

function panelViewport(): PanelViewport {
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const top = Math.max(viewportTop, TITLE_BAR_HEIGHT);
  return {
    height: Math.max(
      0,
      viewportTop + (viewport?.height ?? window.innerHeight) - top,
    ),
    left: viewport?.offsetLeft ?? 0,
    top,
    width: viewport?.width ?? window.innerWidth,
  };
}
