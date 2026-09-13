import type { JsonValue } from "@/types/ipc";

import { Switch } from "@/components/ui/switch";

interface CompatSwitchFieldProps {
  label: string;
  onCheckedChange: (checked: boolean) => void;
  /** The field's effective value; anything but `true` reads as off. */
  value: JsonValue | undefined;
}

// Boolean compat field. The switch is controlled from the effective value, so
// a resolved default and an override look the same until the value is edited.
export function CompatSwitchField({
  label,
  onCheckedChange,
  value,
}: CompatSwitchFieldProps) {
  return (
    <Switch
      aria-label={label}
      checked={value === true}
      onCheckedChange={onCheckedChange}
      size="sm"
    />
  );
}
