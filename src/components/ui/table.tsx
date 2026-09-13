"use client";

import { cn } from "cn";
import * as React from "react";

function Table({
  className,
  containerClassName,
  ref,
  ...props
}: Omit<React.ComponentProps<"table">, "ref"> & {
  containerClassName?: string;
  /** Addresses the scrolling wrapper, not the `table` element it holds. */
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      className={cn(
        "relative w-full",
        // A panel that scrolls the table itself passes its own overflow: a
        // second scroll container in between would claim the sticky header,
        // which then scrolls away with the body.
        containerClassName ?? "overflow-x-auto",
      )}
      data-slot="table-container"
      ref={ref}
    >
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        data-slot="table"
        {...props}
      />
    </div>
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      className={cn("[&_tr:last-child]:border-0", className)}
      data-slot="table-body"
      {...props}
    />
  );
}

// Cells do not force their own width: a table inside a settings pane has to
// shrink with the pane, and a blanket `whitespace-nowrap` is what makes it
// demand a horizontal scrollbar instead. Cells that must stay on one line
// (numbers, controls) say so themselves.
function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("px-2 py-1.5 align-middle", className)}
      data-slot="table-cell"
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "text-muted-foreground h-8 px-2 text-left align-middle text-xs font-medium whitespace-nowrap select-none",
        className,
      )}
      data-slot="table-head"
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn("[&_tr]:border-b", className)}
      data-slot="table-header"
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className,
      )}
      data-slot="table-row"
      {...props}
    />
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
