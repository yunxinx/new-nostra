import type { ReactNode } from "react";

import { SettingsInfoButton } from "./SettingsInfoButton";

interface SettingsRowProps {
  children?: ReactNode;
  info?: string;
  label: string;
}

// Full-width flat form row: label (plus optional info popover) left, control
// right. The min heights keep rows with and without a mounted control on the
// same baseline.
export function SettingsRow({ children, info, label }: SettingsRowProps) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-4 py-3 text-sm">
      <div className="flex min-w-0 items-center gap-1.5">
        <span>{label}</span>
        {info !== undefined && <SettingsInfoButton description={info} />}
      </div>
      <div className="flex min-h-6 items-center">{children}</div>
    </div>
  );
}
