import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "cn";
import { Info, type LucideIcon, Palette, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/features/appearance/use-theme";

import { AboutPage } from "./components/AboutPage";
import { AppearancePage } from "./components/AppearancePage";
import { GeneralPage } from "./components/GeneralPage";

const SETTINGS_PAGES = ["general", "appearance", "about"] as const;

type SettingsPage = (typeof SETTINGS_PAGES)[number];

const PAGE_ICONS: Record<SettingsPage, LucideIcon> = {
  about: Info,
  appearance: Palette,
  general: Settings2,
};

const PAGE_TITLE_KEYS = {
  about: "settings.tabs.about",
  appearance: "settings.tabs.appearance",
  general: "settings.tabs.general",
} as const satisfies Record<SettingsPage, string>;

export function SettingsWindowApp() {
  const { t } = useTranslation();
  useTheme();
  const [activePage, setActivePage] = useState<SettingsPage>("general");

  // The window is created hidden. useEffect does not guarantee the browser
  // has painted (react.dev), so show() is deferred past two animation
  // frames: the first frame is then guaranteed on screen. Cleanup cancels
  // pending frames, keeping the effect side-effect free under StrictMode
  // double-mount.
  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => void getCurrentWindow().show());
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="bg-sidebar flex w-[200px] shrink-0 flex-col">
        {/* Reserved title row: the sidebar background extends behind the
            traffic lights through this spacer. */}
        <div className="h-[34px] shrink-0" data-tauri-drag-region />
        <div className="flex flex-col gap-1 p-2">
          {SETTINGS_PAGES.map((page) => {
            const PageIcon = PAGE_ICONS[page];
            return (
              <button
                aria-current={page === activePage ? "true" : undefined}
                className={cn(
                  "text-sidebar-foreground focus-visible:ring-ring/50 flex h-[30px] w-full cursor-default items-center gap-2 rounded-[6px] px-2 text-left text-sm outline-none select-none focus-visible:ring-3",
                  // Full-width row: the arrow cursor marks it as a row
                  // selection, not a button press. The hover variant
                  // out-specifies a plain selected class, so the selected tab
                  // must not carry the hover class at all.
                  page === activePage
                    ? "bg-sidebar-selected text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent",
                )}
                key={page}
                onClick={() => setActivePage(page)}
                type="button"
              >
                {/* 80%-opacity icon in the row's current text color; sits a
                    step back from the label like the old app's nav icons. */}
                <PageIcon className="size-4 shrink-0 opacity-80" />
                {t(PAGE_TITLE_KEYS[page])}
              </button>
            );
          })}
        </div>
      </nav>
      <main className="bg-background flex min-w-0 flex-1 flex-col">
        {/* Reserved title row: drag surface for the content column. */}
        <div className="h-[34px] shrink-0" data-tauri-drag-region />
        {/* Shared vertical scroll for the form pages; rows carry their own
            rhythm with no card chrome. The About page centers itself
            instead of joining the padded form column. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Baseline alignment with the nav column: the nav centers its
              20px text line in a 30px row under p-2 (13px from the title
              row to the text top) while SettingsRow centers the label
              within its first row's content height — 28px, driven by the
              h-7 select control — under py-3 (16px). The 3px lift on the
              padded column closes the gap; recompute it if the first row's
              tallest control changes. */}
          {activePage === "about" ? (
            <AboutPage />
          ) : (
            <div className="-mt-[3px] px-10 pb-4">
              {activePage === "appearance" ? (
                <AppearancePage />
              ) : (
                <GeneralPage />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
