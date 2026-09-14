import {
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";

export interface MemberDrag {
  /** Position of the row being dragged, while a drag is running. */
  from: null | number;
  /** Props for the handle of one row, keyed by that row's position. */
  handleProps: (index: number) => MemberDragHandle;
  /** Position of the row the pointer is over, while a drag is running. */
  to: null | number;
}

/** The events of one row's drag handle; every event of a drag travels to it. */
interface MemberDragHandle {
  onLostPointerCapture: (event: ReactPointerEvent) => void;
  onPointerCancel: (event: ReactPointerEvent) => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
}

interface MemberDragOptions {
  /** Attribute each row carries its position in, e.g. `data-member-row`. */
  attribute: string;
  /** While true a press starts nothing: no row may move right now. */
  isDisabled?: boolean;
  /** Runs on release with the positions the drag started and ended on. */
  onDrop: (from: number, to: number) => void;
}

/**
 * Which edge of the row at `index` a running drag would land on: the rows
 * between the dragged one and its target shift towards the gap it left, so the
 * line is drawn above the target when the drag travels up and below it when it
 * travels down. Null on every row a drag is not aiming at.
 */
export function dropEdgeOf(
  drag: MemberDrag,
  index: number,
): "after" | "before" | null {
  if (drag.from === null || drag.from === index || drag.to !== index) {
    return null;
  }
  return drag.from > index ? "before" : "after";
}

/**
 * Reordering by pointer over rows that carry their position in `attribute`.
 * The handle captures the pointer, so the moves all arrive on it and no other
 * row sees one: the row under the pointer is resolved from the point, not
 * from the event's target, and only rows of the dragged list count — a page
 * may hold several of them, and a position means nothing across two lists.
 */
export function useMemberDrag({
  attribute,
  isDisabled = false,
  onDrop,
}: MemberDragOptions): MemberDrag {
  const fromRef = useRef<null | { container: Element | null; index: number }>(
    null,
  );
  const [from, setFrom] = useState<null | number>(null);
  const [to, setTo] = useState<null | number>(null);

  /**
   * Ends the drag on every path out of it: capture released, state dropped.
   * The `lostpointercapture` entry covers the capture going away with no
   * cancel event — another element taking this pointer's capture while the
   * handle stays mounted. A handle removed from the page mid-drag never
   * arrives here: React listens for the event at the root container, and the
   * browser fires the loss on the detached node, whose ancestor chain no
   * longer leads there. A drag that ends that way is dropped by the next
   * press, which overwrites the positions this hook keeps.
   */
  function release(event: ReactPointerEvent): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    fromRef.current = null;
    setFrom(null);
    setTo(null);
  }

  function handleProps(index: number): MemberDragHandle {
    return {
      onLostPointerCapture: release,
      onPointerCancel: release,
      onPointerDown: (event) => {
        if (isDisabled) {
          return;
        }
        // The drag sweeps the pointer across the row's text, so the selection
        // anchor it would otherwise extend is dropped before it is set.
        event.preventDefault();
        document.getSelection()?.removeAllRanges();
        event.currentTarget.setPointerCapture(event.pointerId);
        const row = event.currentTarget.closest(`[${attribute}]`);
        fromRef.current = { container: row?.parentElement ?? null, index };
        setFrom(index);
        setTo(index);
      },
      onPointerMove: (event) => {
        const drag = fromRef.current;
        if (drag === null) {
          return;
        }
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const row = element?.closest(`[${attribute}]`);
        if (row == null) {
          // A point that is still inside this list but between its rows — a
          // gap, the list's own box — keeps the last position; anywhere else
          // has none, so the drag stops showing a place to land and a release
          // there moves nothing.
          setTo((current) =>
            element instanceof Node && drag.container?.contains(element)
              ? current
              : null,
          );
          return;
        }
        if (row.parentElement !== drag.container) {
          setTo(null);
          return;
        }
        const position = row.getAttribute(attribute);
        if (position !== null) {
          setTo(Number(position));
        }
      },
      onPointerUp: (event) => {
        const start = fromRef.current?.index ?? null;
        const end = to;
        release(event);
        if (start === null || end === null || start === end) {
          return;
        }
        onDrop(start, end);
      },
    };
  }

  return { from, handleProps, to };
}
