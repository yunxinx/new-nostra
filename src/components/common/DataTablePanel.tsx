import { cn } from "cn";
import { type ReactNode } from "react";

import { Table } from "@/components/ui/table";
import { useScrollChaining } from "@/hooks/use-scroll-chaining";

/** Height of the panel's header row, and of one row of its body. */
const HEADER_HEIGHT = "2rem";
const ROW_HEIGHT = "2.25rem";
/** The rule `TableRow` draws under a row; the last row draws none. */
const ROW_RULE = "1px";
/**
 * What the box's own lines cost the rows: its top and bottom edges. The rule
 * under the header is a shadow and lays out as nothing, and the last row
 * leaves its rule undrawn, so the height that fits `rows` rows is the box's
 * edges, the header, `rows` rows, and the `rows - 1` rules between them. A
 * panel a few pixels short of its rows would offer a scrollbar for those
 * pixels and read as scrollable when it is not.
 */
const BOX_RULES = "2px";

/**
 * One table in one scroller, its header stuck to the top of the scroll: the
 * columns cannot drift apart, because header and body are laid out by the
 * same table. The scroll is `auto` — a table that fits its box draws no bar
 * and reserves no strip for one, and when the table outgrows the box the
 * whole table, header included, gives up the bar's width together.
 *
 * The rule under the header is an inset shadow on each `th`, not a border
 * and not a shadow on the `thead` itself: a collapsed table border does not
 * travel with a sticky `thead`, and WebKit paints no box-shadow at all on a
 * table row group. The shadow on the cells travels with them and paints in
 * every engine, and costs no layout, which the height count above relies on.
 * The header also carries the page's ground behind it — every panel sits on
 * the window's plain `background`, so the rows scrolling under the header do
 * not show through it.
 *
 * Sideways is the same scroller: the table, header included, slides as one
 * piece, and a horizontal bar takes a strip off the bottom only while the
 * table is wider than the box.
 */
const SCROLLER = "min-h-0 min-w-0 flex-1 overscroll-contain overflow-auto";
const TABLE =
  "table-fixed [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-[1] [&_thead]:bg-background [&_thead_th]:shadow-[inset_0_-1px_0_0_var(--border)] [&_thead_tr]:border-b-0";

interface DataTablePanelProps {
  /** The body: one `tbody`, or several, one per group. */
  children: ReactNode;
  /**
   * One entry per column, each the column's Tailwind width class; an
   * undefined entry takes a share of what the fixed columns leave. Drawn as
   * the table's `colgroup`, which under `table-fixed` is what fixes each
   * column's width.
   */
  columns: readonly (string | undefined)[];
  /** The header rows, inside their own `thead`. */
  header: ReactNode;
  /**
   * The narrowest the table may get, in pixels: below it the table scrolls
   * sideways instead of squeezing the columns, so a column whose width was
   * chosen to fit its content keeps that width. Omit it and the columns
   * share whatever the panel is given.
   */
  minWidth?: number;
  /**
   * Body rows the panel shows before it scrolls, the header excluded. Left
   * unset, the panel fills the height its container gives it instead: a table
   * that is the page's whole content grows with the window, while a table
   * that sits in a form keeps the height it was given.
   */
  rows?: number;
}

/**
 * A bordered well holding one table whose header sticks to the top of the
 * scroll: the header keeps its place and its own row while the body scrolls
 * under it. A table whose length is not known ahead of time — a header map,
 * a model list — costs the same space wherever it is placed, and never
 * pushes what follows it down the page.
 */
export function DataTablePanel({
  children,
  columns,
  header,
  minWidth,
  rows,
}: DataTablePanelProps) {
  const chainScroller = useScrollChaining();
  // Below this floor the table scrolls sideways rather than squeezing its
  // columns, so a column whose width was chosen to fit its content keeps
  // that width.
  const floor =
    minWidth === undefined ? undefined : { minWidth: `${String(minWidth)}px` };

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-[6px] border",
        rows === undefined && "flex-1",
      )}
      style={
        rows === undefined
          ? undefined
          : {
              height: `calc(${HEADER_HEIGHT} + ${BOX_RULES} + ${String(rows)} * ${ROW_HEIGHT} + (${String(rows)} - 1) * ${ROW_RULE})`,
            }
      }
    >
      <Table
        className={TABLE}
        containerClassName={SCROLLER}
        ref={chainScroller}
        style={floor}
      >
        <colgroup>
          {columns.map((width, index) => (
            <col className={width} key={index} />
          ))}
        </colgroup>
        {header}
        {children}
      </Table>
    </div>
  );
}
