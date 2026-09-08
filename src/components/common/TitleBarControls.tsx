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
        "fixed top-0 left-0 z-50 flex h-[34px] gap-1 pr-1.5",
        // macOS reserves x=9..77 for the traffic lights and vertically
        // calibrates against them: the lights center at ~y=13, while an
        // items-center 28px button (icon-sm) in this 34px row centers at
        // y=17, ~2px low. items-start pins the button top to the padding,
        // putting its center at padding + 14px; tune the padding here — the
        // 34px row height and the drag region behind it stay fixed. Other
        // platforms keep a native title bar and center within the row.
        isMacOs() ? "items-start pt-[1px] pl-20" : "items-center pl-3",
      )}
    >
      {children}
    </div>
  );
}
