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
        // calibrates against them: the lights center at ~y=16 (bisected from
        // user observations — y=15 read high, y=17 read low). items-start
        // pins the 28px button (icon-sm) top to the padding, so its center
        // is padding + 14px; pt-2 lands on y=16. Retina allows 0.5px steps
        // if finer tuning is needed. The 34px row height and the drag region
        // behind it stay fixed. Other platforms keep a native title bar and
        // center within the row.
        isMacOs() ? "items-start pt-[2px] pl-20" : "items-center pl-3",
      )}
    >
      {children}
    </div>
  );
}
