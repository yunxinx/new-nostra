import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { JsonValue } from "@/types/ipc";

import { Textarea } from "@/components/ui/textarea";

import type { CompatFieldDescriptor } from "./compat-fields";

import { formatJsonValue, parseStrictJson } from "./compat-values";

interface CompatJsonFieldProps {
  label: string;
  onChange: (value: JsonValue | null) => void;
  /** Validates a parsed value against the field's stored shape. */
  parseValue: CompatFieldDescriptor["parseValue"];
  /** The field's effective value; an unset field opens blank. */
  value: JsonValue | undefined;
}

// Structured compat field (arrays, numbers). The text is local state and the
// draft is written on blur, so typing never round-trips through the panel: an
// unparsable or shape-invalid text shows the row error and leaves the stored
// value alone, an emptied box clears the override, and a `null` value clears it
// like the wire contract reads it.
export function CompatJsonField({
  label,
  onChange,
  parseValue,
  value,
}: CompatJsonFieldProps) {
  const { t } = useTranslation();
  const [text, setText] = useState<string>(() => formatJsonValue(value));
  const [isInvalid, setIsInvalid] = useState(false);
  // The last text that reached the draft: an untouched editor must not write
  // its initial value back as an override.
  const committed = useRef(text);

  function handleBlur(): void {
    if (text === committed.current) {
      return;
    }
    if (text.trim() === "") {
      committed.current = text;
      setIsInvalid(false);
      onChange(null);
      return;
    }
    const parsed = parseStrictJson(text);
    if (!parsed.ok) {
      setIsInvalid(true);
      return;
    }
    const value = parseValue(parsed.value);
    if (parsed.value !== null && value === null) {
      setIsInvalid(true);
      return;
    }
    committed.current = text;
    setIsInvalid(false);
    onChange(value);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Textarea
        aria-invalid={isInvalid}
        aria-label={label}
        className="min-h-0 w-80 max-w-full font-mono text-xs"
        onBlur={handleBlur}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        value={text}
      />
      {isInvalid && (
        <span className="text-destructive text-xs" role="alert">
          {t("settings.providers.compatInvalidJson")}
        </span>
      )}
    </div>
  );
}
