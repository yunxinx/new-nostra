import type { ReactNode } from "react";

import { cn } from "cn";

import { isMacOs } from "@/lib/platform";

interface TitleBarControlsProps {
  children: ReactNode;
}

export function TitleBarControls({ children }: TitleBarControlsProps) {
  return (
    <div
      className={cn(
        "fixed top-0 left-0 z-50 flex h-[34px] items-center gap-1 pr-1.5",
        // macOS reserves x=9..77 for the traffic lights; other platforms keep
        // a native title bar and only need a small inset.
        isMacOs() ? "pl-20" : "pl-3",
      )}
    >
      {children}
    </div>
  );
}
