import { cn } from "cn";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUiStore } from "@/stores/ui-store";

// The icon states the action a click performs (expanded -> collapse), not the
// current layout, matching the aria-label.
// Crossfade: both icons stay mounted and absolutely stacked so the outgoing
// icon coexists with the incoming one for the fade; the shared size-4 class
// keeps their strokes pixel-aligned during the overlap.
const iconClassName = cn(
  "absolute size-4 transition-[opacity] duration-150 ease-out",
  "motion-reduce:transition-none",
);

export function SidebarToggleButton() {
  const { t } = useTranslation();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);

  const label = sidebarCollapsed
    ? t("app.expandSidebar")
    : t("app.collapseSidebar");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          onClick={toggleSidebarCollapsed}
          size="icon-sm"
          variant="ghost"
        >
          <span className="relative inline-flex size-4 items-center justify-center">
            <PanelLeftClose
              className={cn(iconClassName, sidebarCollapsed && "opacity-0")}
            />
            <PanelLeftOpen
              className={cn(iconClassName, !sidebarCollapsed && "opacity-0")}
            />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
