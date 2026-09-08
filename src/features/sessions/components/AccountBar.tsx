import { Moon, Settings, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TOOLTIP_HOVER_DELAY_MS,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toggleTheme } from "@/features/appearance/toggle-theme";
import { useTheme } from "@/features/appearance/use-theme";
import { openSettings } from "@/lib/windows";

const ACCOUNT_PLACEHOLDER_NAME = "Nostra";

export function AccountBar() {
  const { t } = useTranslation();
  const isDark = useTheme();
  // The tooltip is open only while the pointer rests on the trigger and the
  // menu is closed. Menu close returns focus to the trigger, which an
  // uncontrolled TooltipTrigger would treat as an open signal; with the
  // pointer elsewhere there is no leave event to close it, so the tooltip
  // would linger until the next click. Focus alone never opens it here; the
  // button's accessible name comes from aria-label.
  // A controlled open bypasses Radix's delayDuration, so the hover delay is
  // re-applied manually: the pointer must rest on the trigger for
  // TOOLTIP_HOVER_DELAY_MS before the tooltip opens. Every timer start has a
  // paired clear (pointer leave, menu open, unmount), so no pending timer can
  // open a tooltip on a stale trigger.
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPointerOverTrigger, setIsPointerOverTrigger] = useState(false);
  const hoverTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearHoverTimer();
    },
    [clearHoverTimer],
  );

  // Opening the menu cancels the pending delay and closes the tooltip, so
  // the focus return on menu close never finds it open to resurrect.
  function handleMenuOpenChange(open: boolean): void {
    setIsMenuOpen(open);
    if (open) {
      clearHoverTimer();
      setIsPointerOverTrigger(false);
    }
  }

  return (
    <div className="flex h-[52px] shrink-0 items-center px-2">
      <DropdownMenu onOpenChange={handleMenuOpenChange} open={isMenuOpen}>
        <Tooltip open={isPointerOverTrigger && !isMenuOpen}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={t("account.menu")}
                className="hover:bg-sidebar-accent focus-visible:ring-ring/50 flex items-center gap-2 rounded-[6px] p-1 text-left outline-none select-none focus-visible:ring-3"
                onPointerEnter={() => {
                  hoverTimerRef.current = setTimeout(
                    () => setIsPointerOverTrigger(true),
                    TOOLTIP_HOVER_DELAY_MS,
                  );
                }}
                onPointerLeave={() => {
                  clearHoverTimer();
                  setIsPointerOverTrigger(false);
                }}
                type="button"
              >
                <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full text-xs font-medium">
                  {ACCOUNT_PLACEHOLDER_NAME.charAt(0)}
                </span>
                <span className="text-sidebar-foreground text-sm font-medium">
                  {ACCOUNT_PLACEHOLDER_NAME}
                </span>
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("account.menu")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-48" side="top">
          {/* preventDefault on select keeps the menu open so the user can
              preview themes back-to-back; the settings item keeps the
              default close-on-select behavior. */}
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              toggleTheme();
            }}
          >
            {isDark ? <Moon /> : <Sun />}
            {t(isDark ? "account.switchToLight" : "account.switchToDark")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void openSettings()}>
            <Settings />
            {t("account.settings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
