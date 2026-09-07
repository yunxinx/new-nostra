import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "cn";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/features/appearance/use-theme";

const SETTINGS_TABS = ["general", "appearance"] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number];

const TAB_TITLE_KEYS = {
  appearance: "settings.tabs.appearance",
  general: "settings.tabs.general",
} as const satisfies Record<SettingsTab, string>;

export function SettingsWindowApp() {
  const { t } = useTranslation();
  useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // The window is created hidden; this mount effect runs after React's first
  // commit, so show() reveals painted content. Idempotent under StrictMode
  // double-mount.
  useEffect(() => {
    void getCurrentWindow().show();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="bg-sidebar flex w-[200px] shrink-0 flex-col">
        {/* Reserved title row: the sidebar background extends behind the
            traffic lights through this spacer. */}
        <div className="h-[34px] shrink-0" data-tauri-drag-region />
        <div className="flex flex-col gap-1 p-2">
          {SETTINGS_TABS.map((tab) => (
            <button
              aria-current={tab === activeTab ? "true" : undefined}
              className={cn(
                "hover:bg-sidebar-accent text-sidebar-foreground flex h-[30px] w-full items-center rounded-[6px] px-2 text-left text-sm",
                tab === activeTab &&
                  "bg-sidebar-selected text-sidebar-accent-foreground",
              )}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {t(TAB_TITLE_KEYS[tab])}
            </button>
          ))}
        </div>
      </nav>
      <main className="bg-background flex min-w-0 flex-1 flex-col">
        {/* Reserved title row: drag surface for the content column. */}
        <div className="h-[34px] shrink-0" data-tauri-drag-region />
        {/* Flat rows without card chrome, matching the main window's
            borderless pane split; real settings items land in the settings
            domain task. */}
        <div className="p-6">
          <h1 className="text-sm font-semibold">
            {t(TAB_TITLE_KEYS[activeTab])}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("settings.placeholder")}
          </p>
        </div>
      </main>
    </div>
  );
}
