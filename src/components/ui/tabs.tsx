import { cn } from "cn";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

import { SegmentedIndicator, segmentedTrackClass } from "./segmented-control";

interface TabsListProps extends React.ComponentProps<
  typeof TabsPrimitive.List
> {
  /** Number of segments in the list; the indicator divides the track by it. */
  segmentCount: number;
  /** Zero-based position of the selected segment. */
  segmentIndex: number;
}

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className,
      )}
      data-orientation={orientation}
      data-slot="tabs"
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("flex-1 text-sm outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

// The strip is one segmented track: an inset surface with a sliding indicator,
// so the sections read as one control rather than N buttons. The indicator
// divides the content box evenly, which is why the caller passes the segment
// count and the selected position instead of the list measuring itself.
function TabsList({
  children,
  className,
  segmentCount,
  segmentIndex,
  ...props
}: TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn(segmentedTrackClass, className)}
      data-slot="tabs-list"
      {...props}
    >
      <SegmentedIndicator count={segmentCount} index={segmentIndex} />
      {children}
    </TabsPrimitive.List>
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "hover:text-foreground focus-visible:ring-ring/50 data-active:text-foreground relative inline-flex h-6 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      data-slot="tabs-trigger"
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
