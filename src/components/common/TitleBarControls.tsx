import type { ReactNode } from "react";

import { cn } from "cn";

import { isMacOs } from "@/lib/platform";
import { TITLE_BAR_HEIGHT } from "@/lib/window-layout";

interface TitleBarControlsProps {
  children: ReactNode;
}

export function TitleBarControls({ children }: TitleBarControlsProps) {
  return (
    <div
      className={cn(
        "fixed top-0 left-0 z-50 flex gap-1 pr-1.5",
        // macOS traffic lights occupy the first 80px; 28px controls align
        // with their y=16 center when inset 2px from the top.
        isMacOs() ? "items-start pt-[2px] pl-20" : "items-center pl-3",
      )}
      style={{ height: TITLE_BAR_HEIGHT }}
    >
      {children}
    </div>
  );
}
