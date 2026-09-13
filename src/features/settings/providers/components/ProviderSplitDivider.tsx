import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

/** How far one arrow key moves the divider. */
const KEYBOARD_STEP = 16;

interface DragStart {
  startValue: number;
  startX: number;
}

interface ProviderSplitDividerProps {
  label: string;
  /** Largest list width the divider grants, in pixels. */
  max: number;
  /** Smallest list width the divider grants, in pixels. */
  min: number;
  /** Reports the list width the new divider position implies. */
  onChange: (width: number) => void;
  /** Current list width, in pixels. */
  value: number;
}

// The divider between the provider list and its detail pane. It reports the
// width of the list rather than a position, so the two columns never disagree
// about which side the value describes, and every path — drag, arrow key, Home
// and End — clamps to the same travel range.
export function ProviderSplitDivider({
  label,
  max,
  min,
  onChange,
  value,
}: ProviderSplitDividerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<DragStart | null>(null);

  // A drag sweeps the pointer across the neighbouring text, so selection is off
  // for its duration. The cleanup pairs with the add so every exit path
  // (pointerup, pointercancel, unmount) restores selection.
  useEffect(() => {
    if (!isDragging) {
      return;
    }
    document.body.classList.add("select-none");
    return () => {
      document.body.classList.remove("select-none");
    };
  }, [isDragging]);

  function clamp(width: number): number {
    return Math.min(Math.max(width, min), max);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    // Preventing the default pointerdown behavior blocks the text-selection
    // anchor that would otherwise extend across the pane during the drag.
    event.preventDefault();
    document.getSelection()?.removeAllRanges();
    dragStartRef.current = { startValue: value, startX: event.clientX };
    // Pointer capture keeps resize deltas flowing here even when the cursor
    // outruns the 1px line.
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const start = dragStartRef.current;
    if (start === null) {
      return;
    }
    onChange(clamp(start.startValue + event.clientX - start.startX));
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>): void {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStartRef.current = null;
    setIsDragging(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    switch (event.key) {
      case "ArrowLeft":
        onChange(clamp(value - KEYBOARD_STEP));
        break;
      case "ArrowRight":
        onChange(clamp(value + KEYBOARD_STEP));
        break;
      case "End":
        onChange(max);
        break;
      case "Home":
        onChange(min);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className="bg-border focus-visible:ring-ring/50 relative w-px shrink-0 outline-none focus-visible:ring-3"
      onKeyDown={handleKeyDown}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      role="separator"
      tabIndex={0}
    >
      {/* Grab area wider than the line: 12px of hit zone centred on 1px of
          paint, the same reach the sidebar's resize handle has. */}
      <span className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 cursor-col-resize" />
    </div>
  );
}
