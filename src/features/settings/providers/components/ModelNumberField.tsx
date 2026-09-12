import { useState } from "react";

import { Input } from "@/components/ui/input";

import { optionalNumber, rateText } from "../model-rows";

interface ModelNumberFieldProps {
  ariaLabel: string;
  className?: string;
  onChange: (value: number | undefined) => void;
  value: number | undefined;
}

// Numeric input for an optional model field. The text is local state so a
// partly typed number stays visible, and a blank field clears the key instead
// of submitting a zero the schema would reject.
export function ModelNumberField({
  ariaLabel,
  className,
  onChange,
  value,
}: ModelNumberFieldProps) {
  const [text, setText] = useState(() => rateText(value));
  return (
    <Input
      aria-label={ariaLabel}
      className={className}
      inputMode="decimal"
      onChange={(event) => {
        setText(event.target.value);
        onChange(optionalNumber(event.target.value));
      }}
      value={text}
    />
  );
}
