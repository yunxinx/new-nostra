import { cn } from "cn";
import { useTranslation } from "react-i18next";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";

import { MODEL_SECTIONS } from "../model-sections";

/**
 * The model's section strip. The tab root stands above it wherever the host
 * puts it — the strip may sit in a pane's own header row or in a panel's title
 * bar, and both read the same selection.
 */
export function ModelSectionTabs({
  className,
  section,
  size = "md",
}: {
  className?: string;
  section: string;
  /**
   * `sm` stands the strip on a panel's title bar, whose line is as tall as the
   * way out and the title beside it; `md` matches the taller controls of a
   * pane's own row.
   */
  size?: "md" | "sm";
}) {
  const { t } = useTranslation();
  const sectionIndex = Math.max(
    0,
    MODEL_SECTIONS.findIndex((entry) => entry === section),
  );
  const isCompact = size === "sm";
  return (
    <TabsList
      className={className}
      segmentCount={MODEL_SECTIONS.length}
      segmentIndex={sectionIndex}
    >
      {MODEL_SECTIONS.map((entry) => (
        <TabsTrigger
          className={cn(isCompact && "h-4.5 px-2 text-xs")}
          key={entry}
          value={entry}
        >
          {t(`settings.providers.modelSections.${entry}`)}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
