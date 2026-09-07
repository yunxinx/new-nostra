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
                "text-sidebar-foreground focus-visible:ring-ring/50 flex h-[30px] w-full cursor-default items-center rounded-[6px] px-2 text-left text-sm outline-none select-none focus-visible:ring-3",
                // Full-width row: the arrow cursor marks it as a row
                // selection, not a button press. The hover variant
                // out-specifies a plain selected class, so the selected tab
                // must not carry the hover class at all.
                tab === activeTab
                  ? "bg-sidebar-selected text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent",
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
