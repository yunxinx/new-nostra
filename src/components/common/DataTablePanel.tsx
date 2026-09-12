import type { ReactNode } from "react";

import { cn } from "cn";

/** Height of the panel's header row, and of one row of its body. */
const HEADER_HEIGHT = "2rem";
const ROW_HEIGHT = "2.25rem";

/**
 * Sticky header of a table inside a `DataTablePanel`. The bottom rule is an
 * inset shadow because a collapsed border stays behind with the header cell
 * that owns it when that cell is taken out of flow.
 */
export const STICKY_TABLE_HEADER =
  "[&_th]:bg-background [&_th]:shadow-[inset_0_-1px_0_0_var(--border)] [&_th]:sticky [&_th]:top-0 [&_th]:z-10";

interface DataTablePanelProps {
  children: ReactNode;
  className?: string;
  /**
   * Body rows the panel shows before it scrolls, the header excluded. Left
   * unset, the panel fills the height its container gives it instead: a table
   * that is the page's whole content grows with the window, while a table
   * that sits in a form keeps the height it was given.
   */
  rows?: number;
}

/**
 * A bordered well holding one table: the header keeps its place while the body
 * scrolls inside the well. A table whose length is not known ahead of time —
 * a header map, a model list — costs the same space wherever it is placed, and
 * never pushes what follows it down the page.
 */
export function DataTablePanel({
  children,
  className,
  rows,
}: DataTablePanelProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-[6px] border",
        rows === undefined && "flex-1",
        className,
      )}
      style={
        rows === undefined
          ? undefined
          : {
              height: `calc(${HEADER_HEIGHT} + ${String(rows)} * ${ROW_HEIGHT})`,
            }
      }
    >
      {children}
    </div>
  );
}
