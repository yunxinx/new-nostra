import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setThemeMode } from "@/features/appearance/set-theme-mode";
import { type ThemeOverride, useUiStore } from "@/stores/ui-store";

import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";

const THEME_MODES = ["dark", "light", "system"] as const;

export function AppearancePage() {
  const { t } = useTranslation();
  const themeOverride = useUiStore((s) => s.themeOverride);

  function handleThemeModeChange(value: string): void {
    if (!isThemeOverride(value)) {
      return;
    }
    setThemeMode(value);
  }

  return (
    <SettingsSection>
      <SettingsRow
        info={t("settings.themeModeDesc")}
        label={t("settings.themeMode")}
      >
        <Select onValueChange={handleThemeModeChange} value={themeOverride}>
          <SelectTrigger className="w-36" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEME_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {t(`settings.themeModes.${mode}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsSection>
  );
}

function isThemeOverride(value: string): value is ThemeOverride {
  return (THEME_MODES as readonly string[]).includes(value);
}
