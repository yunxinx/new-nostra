import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en.json";
import zh from "@/locales/zh.json";

// Supported interface languages; persisted under PREFERENCE_KEYS.language.
export type Language = "en" | "zh";

export function initI18n(): void {
  const language = navigator.language.toLowerCase().startsWith("zh")
    ? "zh"
    : "en";
  void i18next.use(initReactI18next).init({
    fallbackLng: "en",
    lng: language,
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
  });
}
