import { useState } from "react";

import { Input } from "@/components/ui/input";

import { msFromSecondsText, secondsText } from "../duration";

interface SecondsFieldProps {
  ariaLabel: string;
  onChange: (ms: number) => void;
  /** The stored timeout in milliseconds. */
  value: number | undefined;
}

// A millisecond timeout edited in seconds. The text is local state so a
// half-typed value ("1." while reaching for "1.25") stays visible; the stored
// value is rewritten on every keystroke and rounds to whole milliseconds,
// which is the resolution the wire contract carries.
export function SecondsField({
  ariaLabel,
  onChange,
  value,
}: SecondsFieldProps) {
  const [text, setText] = useState(() => secondsText(value));
  return (
    // The unit sits inside the field rather than beside it: a trailing
    // sibling would pull the input's right edge in, and the column of
    // controls would end at a different x on every row that has one.
    <div className="relative w-32 max-w-full">
      <Input
        aria-label={ariaLabel}
        className="pr-7 tabular-nums"
        inputMode="decimal"
        onChange={(event) => {
          setText(event.target.value);
          onChange(msFromSecondsText(event.target.value));
        }}
        value={text}
      />
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs select-none">
        s
      </span>
    </div>
  );
}
