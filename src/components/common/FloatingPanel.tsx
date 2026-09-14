import type {
  KeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "cn";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/icon-button";
import { useScrollChaining } from "@/hooks/use-scroll-chaining";
import { isComposing } from "@/lib/keyboard";
import {
  isPointerModality,
  trackPointerModality,
} from "@/lib/pointer-modality";
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
  /**
   * Whether a turn to something else closes the panel. A card someone reads
   * has nothing to lose, so it goes; an editor holds a draft, so the same turn
   * is handed to the host's guard, which is where every other way out of that
   * panel goes too. The turn is the click that ends a press outside the panel,
   * never the press itself: the control the click lands on reads it first, so a
   * host can park what the click asked for before the panel it came from goes.
   * Three clicks are not turns away: one the keyboard made, one ending a press
   * begun inside the panel, and one on the anchor, which the host owns as a
   * switch.
   */
  dismissOnOutsidePress?: boolean;
  footer?: ReactNode;
  /**
   * Controls standing on the heading line between the title and the way out —
   * the panel's own sections, a switch for what it shows.
   */
  headerAccessory?: ReactNode;
  onClose: () => void;
  size?: "card" | "form";
  title: string;
  /**
   * A mark standing on the title's right, part of the heading line and of the
   * panel's accessible name, e.g. the provider a model belongs to.
   */
  titleBadge?: ReactNode;
}

interface PanelDrag {
  offsetLeft: number;
  offsetTop: number;
  pointerId: number;
}

export function FloatingPanel({
  anchor,
  children,
  dismissOnOutsidePress = false,
  footer,
  headerAccessory,
  onClose,
  size = "form",
  title,
  titleBadge,
}: FloatingPanelProps) {
  const { t } = useTranslation();
  const bodyRef = useScrollChaining();
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<null | PanelPosition>(null);
  const [viewport, setViewport] = useState(panelViewport);
  const [drag, setDrag] = useState<null | PanelDrag>(null);
  // Whether the press under way began outside the panel. It outlives the
  // dismissal effect below: a press that turns the host's own state over
  // re-subscribes that effect before the click it ends in arrives.
  const pressedOutside = useRef(false);
  // The close the click parked, waiting for the end of its dispatch.
  const dismissal = useRef<null | number>(null);
  const isPositioned = position !== null;
  const moveHintId = useId();

  // The panel is the overlay root, so the tracker is installed while it is up:
  // it is what tells a pointer close from a keyboard close.
  useEffect(trackPointerModality, []);

  // The parked close is revoked only by the panel itself going away: it is the
  // hand-over this click owes the control it landed on, and a host that swapped
  // the panel out has answered that click already — a close arriving after the
  // swap would take down the panel it just opened. A re-render is not the panel
  // leaving, and must not swallow the close a reader asked for.
  useEffect(
    () => () => {
      if (dismissal.current !== null) {
        window.clearTimeout(dismissal.current);
        dismissal.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!dismissOnOutsidePress) return;

    const surface = appSurfaceOf(anchor);

    /**
     * Arms the dismissal with the press it may follow. The listener stands on
     * the surface, so a press inside the panel never reaches it; what it tells
     * apart is a press on the anchor — the control that owns the panel asking
     * for it again, which the host answers on its own — from a turn to
     * something else.
     */
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target;
      pressedOutside.current =
        target instanceof Node && !anchor.contains(target);
    }

    /**
     * A keystroke is not a press: the click a key ends on a background control
     * belongs to the keyboard, and a non-modal panel never took the keyboard
     * away.
     */
    function handleKeyDown(): void {
      pressedOutside.current = false;
    }

    /**
     * A press inside the panel ends the outside one. The surface never sees
     * it, and a press that began outside and produced no click at all —
     * released outside the window — would otherwise leave the next click
     * reading as the one that ended an outside press.
     */
    function handleInsidePress(): void {
      pressedOutside.current = false;
    }

    /**
     * Closes on the click that ends the press, but only after that click's
     * dispatch is over: the control it landed on reads it first and needs the
     * panel still standing — the host parks what the click asked for there,
     * and a dirty draft takes the same guard every other way out takes. So
     * the close is a fresh task of its own; a microtask would run between the
     * click's own listeners, which is the very timing this has to escape.
     */
    function handleClick(): void {
      const isOutside = pressedOutside.current;
      pressedOutside.current = false;
      if (!isOutside) return;
      if (dismissal.current !== null) window.clearTimeout(dismissal.current);
      dismissal.current = window.setTimeout(() => {
        // Fired, so it is no longer a close waiting to happen.
        dismissal.current = null;
        onClose();
      }, 0);
    }

    surface.addEventListener("pointerdown", handlePointerDown, true);
    surface.addEventListener("keydown", handleKeyDown, true);
    surface.addEventListener("click", handleClick, true);
    content?.addEventListener("pointerdown", handleInsidePress, true);
    return () => {
      surface.removeEventListener("pointerdown", handlePointerDown, true);
      surface.removeEventListener("keydown", handleKeyDown, true);
      surface.removeEventListener("click", handleClick, true);
      content?.removeEventListener("pointerdown", handleInsidePress, true);
    };
  }, [anchor, content, dismissOnOutsidePress, onClose]);

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

  function handleDragStart(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || position === null || drag !== null) return;
    // The capture a drag takes would swallow the press the control needs, so
    // the bar hands on whatever ends on one of its controls.
    if (claimsPress(event.target)) return;
    event.preventDefault();
    // The title bar is the panel's keyboard handle as well as its pointer one,
    // so a drag leaves focus on it rather than on whatever lies behind.
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      offsetLeft: event.clientX - position.left,
      offsetTop: event.clientY - position.top,
      pointerId: event.pointerId,
    });
  }

  function handleDragMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    moveTo({
      left: event.clientX - drag.offsetLeft,
      top: event.clientY - drag.offsetTop,
    });
  }

  function handleDragEnd(event: ReactPointerEvent<HTMLDivElement>): void {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  }

  function handleMoveKey(event: KeyboardEvent<HTMLDivElement>): void {
    if (
      // The bar is the handle: a keystroke a control on it takes — a section
      // tab's arrow navigation — is that control's, not a move.
      event.target !== event.currentTarget ||
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
            // A pointer close leaves the pointer on the anchor, so focus has
            // nowhere to go that the user did not just point at — returning it
            // would only light up the anchor's own tooltip. A keyboard close
            // has no such anchor under the hand.
            if (isPointerModality()) return;
            const active = anchor.ownerDocument.activeElement;
            // A background control or the next panel may already own focus.
            if (active === anchor.ownerDocument.body && anchor.isConnected) {
              anchor.focus({ preventScroll: true });
            }
          }}
          onEscapeKeyDown={(event) => {
            if (isComposing(event)) event.preventDefault();
          }}
          // Losing focus to another control is not a decision to close, and
          // neither is the dismissal Radix offers: closing is the click the
          // surface sees, above, so every path Radix would dismiss through is
          // refused here.
          onFocusOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          ref={setContent}
          style={{
            left: position?.left ?? viewport.left + PANEL_EDGE_INSET,
            maxHeight: Math.max(0, viewport.height - PANEL_EDGE_INSET * 2),
            maxWidth: Math.max(0, viewport.width - PANEL_EDGE_INSET * 2),
            top: position?.top ?? viewport.top + PANEL_EDGE_INSET,
            visibility: position === null ? "hidden" : "visible",
          }}
        >
          {/* Focusable because the arrow keys move the panel from here: the
              title bar is the one place where a keystroke is a decision about
              the panel itself rather than about whatever field has focus. */}
          <div
            aria-describedby={moveHintId}
            aria-label={t("common.movePanel", { title })}
            className={cn(
              // The ring is drawn inside: the bar is flush with the panel's
              // own edge, and a ring on the outside would spill past it.
              "focus-visible:ring-ring/50 flex shrink-0 touch-none items-center gap-2 border-b px-3 py-2.5 outline-none select-none focus-visible:ring-3 focus-visible:ring-inset",
              drag === null ? "cursor-grab" : "cursor-grabbing",
            )}
            onKeyDown={handleMoveKey}
            onLostPointerCapture={() => setDrag(null)}
            onPointerCancel={handleDragEnd}
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            role="group"
            tabIndex={0}
          >
            {/* One line whatever the badge is: the name truncates and the
                badge keeps its box, so a long name never pushes it out. */}
            <DialogPrimitive.Title className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
              <span className="truncate">{title}</span>
              {/* The space separates the two in the panel's accessible name
                  and is not rendered: a flex container drops a whitespace
                  run of its own. */}
              {titleBadge !== undefined && (
                <>
                  {" "}
                  <span className="shrink-0">{titleBadge}</span>
                </>
              )}
            </DialogPrimitive.Title>
            {headerAccessory !== undefined && (
              <div className="flex shrink-0 items-center">
                {headerAccessory}
              </div>
            )}
            <IconButton
              aria-label={t("common.close")}
              className="ms-1"
              onClick={onClose}
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

/**
 * The element the app's own UI renders under. Radix portals every layer into a
 * container of its own beside it — this panel, a select's list, a dialog — so
 * the surface is where a press means the reader turned to something else, and a
 * press it never saw belongs to a layer instead.
 */
function appSurfaceOf(anchor: HTMLElement): HTMLElement {
  const { body } = anchor.ownerDocument;
  let node = anchor;
  while (node.parentElement !== null && node.parentElement !== body) {
    node = node.parentElement;
  }
  return node;
}

/**
 * Whether a press landed on a control the title bar carries — the way out, the
 * panel's sections — rather than on the bar itself.
 */
function claimsPress(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("a[href], button, input, select, textarea") !== null
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
