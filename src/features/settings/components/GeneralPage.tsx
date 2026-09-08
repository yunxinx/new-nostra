import { useTranslation } from "react-i18next";

import type { Language } from "@/lib/i18n";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { setLanguage } from "../set-language";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";

// Language names render in their own language (the picker convention), so
// they are literals rather than i18n keys.
const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  zh: "中文",
};

export function GeneralPage() {
  const { i18n, t } = useTranslation();
  const currentLanguage: Language =
    i18n.resolvedLanguage === "zh" ? "zh" : "en";

  function handleLanguageChange(value: string): void {
    if (value !== "en" && value !== "zh") {
      return;
    }
    setLanguage(value);
  }

  return (
    <SettingsSection>
      <SettingsRow
        info={t("settings.languageDesc")}
        label={t("settings.language")}
      >
        <Select onValueChange={handleLanguageChange} value={currentLanguage}>
          <SelectTrigger className="w-36" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LANGUAGE_NAMES) as Language[]).map((language) => (
              <SelectItem key={language} value={language}>
                {LANGUAGE_NAMES[language]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsSection>
  );
}
