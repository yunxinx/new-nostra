import { Moon, Settings, Sun } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toggleTheme } from "@/features/appearance/toggle-theme";
import { useTheme } from "@/features/appearance/use-theme";
import { openSettings } from "@/lib/windows";

const ACCOUNT_PLACEHOLDER_NAME = "Nostra";

export function AccountBar() {
  const { t } = useTranslation();
  const isDark = useTheme();
  // Suppressing the focus return only for the settings path: opening the
  // settings window unfocuses this webview while the returned focus leaves
  // the trigger :focus-visible, so the ring persists until the window is
  // clicked. Esc and other closes keep the default focus return.
  const isSettingsOpenPending = useRef(false);

  return (
    <div className="flex h-[52px] shrink-0 items-center px-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t("account.menu")}
            className="hover:bg-sidebar-accent flex items-center gap-2 rounded-[6px] p-1 text-left"
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
        <DropdownMenuContent
          align="start"
          className="w-48"
          onCloseAutoFocus={(event) => {
            if (isSettingsOpenPending.current) {
              event.preventDefault();
            }
            isSettingsOpenPending.current = false;
          }}
          side="top"
        >
          <DropdownMenuItem onSelect={() => toggleTheme()}>
            {isDark ? <Moon /> : <Sun />}
            {t(isDark ? "account.switchToLight" : "account.switchToDark")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              isSettingsOpenPending.current = true;
              void openSettings();
            }}
          >
            <Settings />
            {t("account.settings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
