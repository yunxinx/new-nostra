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
    // React escapes every string it renders, so i18next's own escaping only
    // double-escapes: an interpolated model id like "vendor/model" would
    // reach the DOM as "vendor&#x2F;model".
    interpolation: { escapeValue: false },
    lng: language,
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
  });
}
