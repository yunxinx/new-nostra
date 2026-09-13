import type { ReactNode } from "react";

interface SettingsSectionProps {
  children: ReactNode;
}

// Pure vertical stack: grouping is expressed only through vertical rhythm,
// with no card chrome or separators. The stack also owns its top edge: a row
// carries its own inset for the gap to the row above, and the first row has
// none, so the section's first line starts at the same height the navigation
// column's first row does.
export function SettingsSection({ children }: SettingsSectionProps) {
  return <div className="flex flex-col [&>*:first-child]:pt-0">{children}</div>;
}
