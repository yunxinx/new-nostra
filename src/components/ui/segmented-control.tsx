import type { KeyboardEvent } from "react";

import { cn } from "cn";
import { useRef } from "react";

/** The track every segmented control shares: one inset surface whose segments
 *  divide the content box evenly, with room for the sliding indicator. */
export const segmentedTrackClass =
  "relative inline-grid min-w-0 auto-cols-fr grid-flow-col items-center gap-0 rounded-lg bg-muted p-[3px] text-muted-foreground";

interface SegmentedControlOption {
  /** The text of one segment. */
  label: string;
  value: string;
}

interface SegmentedControlProps {
  className?: string;
  /** Accessible name of the group. */
  label: string;
  onValueChange: (value: string) => void;
  options: readonly SegmentedControlOption[];
  value: string;
}

// A radio group drawn as one track: the selection is a surface that slides
// between segments rather than a background swapped per button, which is what
// makes the group read as a single control. Roles stay radio (the control
// picks a value; it does not own a panel tree), so arrows move the selection
// and focus together, as the pattern requires.
export function SegmentedControl({
  className,
  label,
  onValueChange,
  options,
  value,
}: SegmentedControlProps) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const index = options.findIndex((option) => option.value === value);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const offset =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (offset === 0) {
      return;
    }
    event.preventDefault();
    const count = options.length;
    const next = ((index < 0 ? 0 : index) + offset + count) % count;
    const option = options[next];
    if (option === undefined) {
      return;
    }
    onValueChange(option.value);
    buttonsRef.current[next]?.focus();
  }

  return (
    <div
      aria-label={label}
      className={cn(segmentedTrackClass, className)}
      onKeyDown={handleKeyDown}
      role="radiogroup"
    >
      {index >= 0 && (
        <SegmentedIndicator count={options.length} index={index} />
      )}
      {options.map((option, position) => (
        <button
          aria-checked={option.value === value}
          className="aria-checked:text-foreground focus-visible:ring-ring/50 hover:text-foreground relative inline-flex h-6 min-w-0 items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
          key={option.value}
          onClick={() => onValueChange(option.value)}
          ref={(element) => {
            buttonsRef.current[position] = element;
          }}
          role="radio"
          tabIndex={option.value === value ? 0 : -1}
          type="button"
        >
          {/* Truncating rather than forcing the track wider: a switcher that
              shares a row with another strip gives up its own room first, so
              the two never end up on separate lines. */}
          <span className="min-w-0 truncate">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The surface that marks the selected segment. Positioned by ratio, so every
 *  caller gets the same travel without measuring anything. */
export function SegmentedIndicator({
  count,
  index,
}: {
  count: number;
  index: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="bg-background dark:bg-accent pointer-events-none absolute inset-y-[3px] left-[3px] rounded-md shadow-sm transition-transform duration-200 ease-out"
      style={{
        transform: `translateX(${String(index * 100)}%)`,
        width: `calc((100% - 6px) / ${String(count)})`,
      }}
    />
  );
}
