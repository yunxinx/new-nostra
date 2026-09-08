import type { ReactNode } from "react";

interface SettingsSectionProps {
  children: ReactNode;
}

// Pure vertical stack: grouping is expressed only through vertical rhythm,
// with no card chrome or separators.
export function SettingsSection({ children }: SettingsSectionProps) {
  return <div className="flex flex-col">{children}</div>;
}
