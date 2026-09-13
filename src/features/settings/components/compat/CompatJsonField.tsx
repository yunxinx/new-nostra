import { cn } from "cn";
import { useTranslation } from "react-i18next";

import type { JsonValue } from "@/types/ipc";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isDeepEqual } from "@/lib/deep-equal";

import type { CompatInputDraft } from "./compat-draft";
import type { CompatFieldDescriptor } from "./compat-fields";

import { formatJsonValue, parseStrictJson } from "./compat-values";

const SIZING = {
  json: "w-80 max-w-full",
  // min-h-0: the box's height is the design's, not the textarea base's floor.
  list: "h-12 min-h-0 w-full resize-none overscroll-contain overflow-y-auto field-sizing-fixed",
} as const;

interface CompatJsonFieldProps {
  input: CompatInputDraft | undefined;
  /**
   * The box the field's kind asks for: a list takes the row's whole width and
   * a fixed height it scrolls inside, so a long one neither grows the row nor
   * hands its wheel to the pane around it; a scalar is one line of text.
   */
  kind: keyof typeof SIZING;
  label: string;
  onChange: (value: JsonValue | null) => void;
  onInputChange: (input: CompatInputDraft | undefined) => void;
  /** Validates a parsed value against the field's stored shape. */
  parseValue: CompatFieldDescriptor["parseValue"];
  /** The field's effective value; an unset field opens blank. */
  value: JsonValue | undefined;
}

// Raw text belongs to the form, including invalid input. Untouched fields
// follow the resolved value; typing preserves the text until blur.
export function CompatJsonField({
  input,
  kind,
  label,
  onChange,
  onInputChange,
  parseValue,
  value,
}: CompatJsonFieldProps) {
  const { t } = useTranslation();
  const text = input?.text ?? formatJsonValue(value);
  const isInvalid = input?.isInvalid ?? false;

  function handleChange(text: string): void {
    if (text.trim() === "") {
      onInputChange({ isInvalid: false, text });
      onChange(null);
      return;
    }
    const parsed = parseStrictJson(text);
    if (!parsed.ok) {
      onInputChange({ isInvalid: true, text });
      return;
    }
    const next = parseValue(parsed.value);
    if (parsed.value !== null && next === null) {
      onInputChange({ isInvalid: true, text });
      return;
    }
    onInputChange({ isInvalid: false, text });
    if (next === null || !isDeepEqual(next, value)) onChange(next);
  }

  function handleBlur(): void {
    if (!isInvalid) onInputChange(undefined);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {kind === "list" ? (
        <Textarea
          aria-invalid={isInvalid}
          aria-label={label}
          className={cn(SIZING.list, "font-mono text-xs")}
          onBlur={handleBlur}
          onChange={(event) => handleChange(event.target.value)}
          value={text}
        />
      ) : (
        <Input
          aria-invalid={isInvalid}
          aria-label={label}
          className={cn(SIZING.json, "font-mono text-xs")}
          onBlur={handleBlur}
          onChange={(event) => handleChange(event.target.value)}
          value={text}
        />
      )}
      {isInvalid && (
        <span className="text-destructive text-xs" role="alert">
          {t("settings.providers.compatInvalidJson")}
        </span>
      )}
    </div>
  );
}
