import { useTranslation } from "react-i18next";

import type { JsonValue } from "@/types/ipc";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CompatSelectFieldProps {
  label: string;
  /** The picked value, or null to clear this layer's override. */
  onValueChange: (value: null | string) => void;
  /** Allowed values, in schema order. */
  options: readonly string[];
  /** The field's effective value; unset shows the unset entry. */
  value: JsonValue | undefined;
}

// Radix Select refuses an empty string as an item value, so "unset" travels as
// a sentinel; compat enums are business literals, none of which matches it. The
// sentinel never leaves this component — the commit path only ever sees null.
const UNSET = "__unset__";

// Enum compat field. Options render their wire value verbatim: they are the
// tokens the request carries, not copy to translate. The unset entry stays
// first because a select has no blank state of its own: without it, an enum
// whose option set the lower layer already satisfies could never be cleared
// back to that layer.
export function CompatSelectField({
  label,
  onValueChange,
  options,
  value,
}: CompatSelectFieldProps) {
  const { t } = useTranslation();
  return (
    <Select
      onValueChange={(next) => {
        onValueChange(next === UNSET ? null : next);
      }}
      value={typeof value === "string" ? value : UNSET}
    >
      <SelectTrigger aria-label={label} className="w-56 max-w-full" size="sm">
        <SelectValue placeholder={t("settings.providers.compatUnset")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>
          {t("settings.providers.compatUnset")}
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
