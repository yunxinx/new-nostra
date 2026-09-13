import { cn } from "cn";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarToggleButtonProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

// The icon states the action a click performs (expanded -> collapse), not the
// current layout, matching the aria-label.
// Crossfade: both icons stay mounted and absolutely stacked so the outgoing
// icon coexists with the incoming one for the fade; the shared size-4 class
// keeps their strokes pixel-aligned during the overlap.
const iconClassName = cn(
  "absolute size-4 transition-[opacity] duration-150 ease-out",
  "motion-reduce:transition-none",
);

// Shared by both windows so the two title bars offer one gesture: the button
// reports the column it drives and nothing else — which store holds that
// state is the caller's business.
export function SidebarToggleButton({
  isCollapsed,
  onToggle,
}: SidebarToggleButtonProps) {
  const { t } = useTranslation();
  const label = isCollapsed ? t("app.expandSidebar") : t("app.collapseSidebar");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          onClick={onToggle}
          size="icon-sm"
          variant="ghost"
        >
          <span className="relative inline-flex size-4 items-center justify-center">
            <PanelLeftClose
              className={cn(iconClassName, isCollapsed && "opacity-0")}
            />
            <PanelLeftOpen
              className={cn(iconClassName, !isCollapsed && "opacity-0")}
            />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
