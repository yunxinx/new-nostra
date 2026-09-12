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
  onValueChange: (value: string) => void;
  /** Allowed values, in schema order. */
  options: readonly string[];
  /** The field's effective value; unset shows the placeholder. */
  value: JsonValue | undefined;
}

// Enum compat field. Options render their wire value verbatim: they are the
// tokens the request carries, not copy to translate.
export function CompatSelectField({
  label,
  onValueChange,
  options,
  value,
}: CompatSelectFieldProps) {
  const { t } = useTranslation();
  return (
    <Select
      onValueChange={onValueChange}
      value={typeof value === "string" ? value : ""}
    >
      <SelectTrigger aria-label={label} className="w-56 max-w-full" size="sm">
        <SelectValue placeholder={t("settings.providers.compatUnset")} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
