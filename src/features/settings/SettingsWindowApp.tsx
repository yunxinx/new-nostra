import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "cn";
import {
  Boxes,
  ChevronRight,
  Info,
  type LucideIcon,
  Network,
  Palette,
  Server,
  Settings2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { SidebarToggleButton } from "@/components/common/SidebarToggleButton";
import { TitleBarControls } from "@/components/common/TitleBarControls";
import { useTheme } from "@/features/appearance/use-theme";
import { useUiStore } from "@/stores/ui-store";

import { AboutPage } from "./components/AboutPage";
import { AppearancePage } from "./components/AppearancePage";
import { GeneralPage } from "./components/GeneralPage";
import { ModelsListPage } from "./models/ModelsListPage";
import { UnifiedModelsPage } from "./models/UnifiedModelsPage";
import { ProvidersPage } from "./providers/ProvidersPage";

// The navigation column in render order: page rows, a heading that opens the
// model-services group, and the gateway group, whose children are the pages
// that decide what a downstream client can ask for. The model list is a page
// of its own under the heading: it is the catalogue of what exists, while the
// gateway is what is served from it.
const NAV_ITEMS = [
  { page: "general" },
  { page: "appearance" },
  { heading: "settings.tabs.modelServices" },
  { page: "providers" },
  { page: "modelsList" },
  { heading: "settings.tabs.gateway" },
  { children: ["modelsUnified"], group: "gateway" },
  { page: "about" },
] as const;

type NavGroup = Extract<NavItem, { group: string }>;
type NavItem = (typeof NAV_ITEMS)[number];
type SettingsPage =
  Extract<NavItem, { page: string }>["page"] | NavGroup["children"][number];

/** The navigation column's width; collapsing animates it to zero. */
const NAV_WIDTH = 200;

const PAGE_ICONS: Record<string, LucideIcon> = {
  about: Info,
  appearance: Palette,
  gateway: Network,
  general: Settings2,
  modelsList: Boxes,
  providers: Server,
};

const TITLE_KEYS = {
  about: "settings.tabs.about",
  appearance: "settings.tabs.appearance",
  gateway: "settings.tabs.gateway",
  general: "settings.tabs.general",
  modelsList: "settings.models.list",
  modelsUnified: "settings.models.unified",
  providers: "settings.providers.title",
} as const satisfies Record<NavGroup["group"] | SettingsPage, string>;

interface NavGroupRowProps {
  activePage: SettingsPage;
  group: NavGroup;
  isExpanded: boolean;
  onRequestPage: (page: SettingsPage) => void;
  onToggle: () => void;
}

interface NavRowProps {
  activePage: SettingsPage;
  isNested?: boolean;
  onRequestPage: (page: SettingsPage) => void;
  page: SettingsPage;
}

export function SettingsWindowApp() {
  const { t } = useTranslation();
  useTheme();
  const [activePage, setActivePage] = useState<SettingsPage>("general");
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [requestedPage, setRequestedPage] = useState<null | SettingsPage>(null);
  const navCollapsed = useUiStore((s) => s.settingsNavCollapsed);
  const toggleNavCollapsed = useUiStore((s) => s.toggleSettingsNavCollapsed);

  // The window is created hidden. WebKit never schedules
  // requestAnimationFrame while the host window is ordered out, so a
  // rAF-gated show() would deadlock; reveal must not depend on rAF.
  // setFocus after show: tao's set_focus is a no-op on hidden windows, so
  // it must run once show() resolves; on macOS it also performs the
  // app-level activation (activateIgnoringOtherApps). Both calls are
  // idempotent under StrictMode double-mount.
  useEffect(() => {
    void getCurrentWindow()
      .show()
      .then(() => void getCurrentWindow().setFocus());
  }, []);

  function requestPage(page: SettingsPage): void {
    if (page === activePage) {
      return;
    }
    if (["modelsList", "modelsUnified", "providers"].includes(activePage)) {
      setRequestedPage(page);
      return;
    }
    setActivePage(page);
  }

  function resolveNavRequest(accepted: boolean): void {
    if (accepted && requestedPage !== null) {
      setActivePage(requestedPage);
    }
    setRequestedPage(null);
  }

  function toggleGroup(group: NavGroup): void {
    setCollapsedGroups((collapsed) =>
      collapsed.includes(group.group)
        ? collapsed.filter((name) => name !== group.group)
        : [...collapsed, group.group],
    );
  }

  // The shell fills the viewport, clips it, and is the containing block for
  // what is positioned inside it. The clip only covers boxes it contains, so
  // without the positioning a stray absolute box with no closer positioned
  // ancestor (Radix renders a switch's hidden checkbox and a select's hidden
  // native select as absolute siblings inside unpositioned rows) resolves
  // against the initial containing block, escapes the clip, and puts a
  // scrollable overflow on the document that shifts the whole window.
  return (
    <div className="relative flex h-screen overflow-hidden">
      {/* The collapsing wrapper carries the width so the column inside keeps
          its own: the navigation does not reflow while the column animates,
          exactly as the main window's session sidebar collapses. */}
      <div
        className="shrink-0 overflow-hidden transition-[width] duration-[220ms] ease-in-out"
        inert={navCollapsed}
        style={{ width: navCollapsed ? 0 : NAV_WIDTH }}
      >
        <nav className="bg-sidebar flex h-full w-[200px] shrink-0 flex-col">
          {/* Reserved title row: the sidebar background extends behind the
            traffic lights through this spacer. */}
          <div className="h-[34px] shrink-0" data-tauri-drag-region />
          {/* No top pad: the first row's 32px box starts at the title strip's
            edge, and every page's first line starts at that same height. */}
          <div className="flex flex-col gap-1 px-2 pb-2">
            {NAV_ITEMS.map((item) =>
              "heading" in item ? (
                <p
                  className="text-muted-foreground px-2 pt-2 pb-1 text-xs select-none"
                  key={item.heading}
                >
                  {t(item.heading)}
                </p>
              ) : "group" in item ? (
                <NavGroupRow
                  activePage={activePage}
                  group={item}
                  isExpanded={!collapsedGroups.includes(item.group)}
                  key={item.group}
                  onRequestPage={requestPage}
                  onToggle={() => toggleGroup(item)}
                />
              ) : (
                <NavRow
                  activePage={activePage}
                  key={item.page}
                  onRequestPage={requestPage}
                  page={item.page}
                />
              ),
            )}
          </div>
        </nav>
      </div>
      <main className="bg-background flex min-w-0 flex-1 flex-col">
        {/* Reserved title row: drag surface for the content column. The
            provider page reserves one per column instead, because its divider
            has to reach the window's top edge. */}
        {activePage !== "providers" && (
          <div className="h-[34px] shrink-0" data-tauri-drag-region />
        )}
        {activePage === "providers" ? (
          // The provider page owns two independently scrolling columns, so it
          // sits outside the shared form scroll container.
          <ProvidersPage
            isNavRequested={requestedPage !== null}
            onNavRequestResolved={resolveNavRequest}
          />
        ) : activePage === "modelsList" || activePage === "modelsUnified" ? (
          // Both model pages are tables that fill the pane and scroll their
          // own rows, so they own the pane's height rather than joining the
          // shared form scroll.
          <>
            {activePage === "modelsList" ? (
              <ModelsListPage
                isNavRequested={requestedPage !== null}
                onNavRequestResolved={resolveNavRequest}
              />
            ) : (
              <UnifiedModelsPage
                isNavRequested={requestedPage !== null}
                onNavRequestResolved={resolveNavRequest}
              />
            )}
          </>
        ) : (
          <div className="min-h-0 flex-1 scrollbar-none overflow-x-clip overflow-y-auto">
            {/* Shared vertical scroll for the form pages; rows carry their own
                rhythm with no card chrome. The About page centers itself
                instead of joining the padded form column. */}
            {activePage === "about" ? (
              <AboutPage />
            ) : (
              <div className="px-10 pb-6">
                {activePage === "appearance" ? (
                  <AppearancePage />
                ) : (
                  <GeneralPage />
                )}
              </div>
            )}
          </div>
        )}
      </main>
      <TitleBarControls>
        <SidebarToggleButton
          isCollapsed={navCollapsed}
          onToggle={toggleNavCollapsed}
        />
      </TitleBarControls>
    </div>
  );
}

// A group row: the whole row toggles its children and nothing else. Opening a
// group is not a navigation, so the content column keeps whatever page it was
// showing until one of the children is chosen.
function NavGroupRow({
  activePage,
  group,
  isExpanded,
  onRequestPage,
  onToggle,
}: NavGroupRowProps) {
  const { t } = useTranslation();
  const GroupIcon = PAGE_ICONS[group.group];
  const holdsActivePage = group.children.some((page) => page === activePage);

  return (
    <>
      <button
        aria-current={holdsActivePage && !isExpanded ? "true" : undefined}
        aria-expanded={isExpanded}
        className={cn(
          "text-sidebar-foreground focus-visible:ring-ring/50 flex h-8 w-full cursor-default items-center gap-2 rounded-[6px] px-2 text-left text-sm outline-none select-none focus-visible:ring-3",
          holdsActivePage && !isExpanded
            ? "bg-sidebar-selected text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent",
        )}
        onClick={onToggle}
        type="button"
      >
        {GroupIcon !== undefined && (
          <GroupIcon className="size-4 shrink-0 opacity-80" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {t(TITLE_KEYS[group.group])}
        </span>
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 opacity-60 transition-transform",
            isExpanded && "rotate-90",
          )}
        />
      </button>
      {isExpanded && (
        // The children hang from a rail drawn on the parent icon's centre
        // line: one column of labels, with a mark that says whose children
        // they are.
        <div className="relative flex flex-col gap-1">
          <span
            aria-hidden="true"
            className="bg-sidebar-border absolute inset-y-0 left-4 w-px"
          />
          {group.children.map((page) => (
            <NavRow
              activePage={activePage}
              isNested
              key={page}
              onRequestPage={onRequestPage}
              page={page}
            />
          ))}
        </div>
      )}
    </>
  );
}

function NavRow({
  activePage,
  isNested = false,
  onRequestPage,
  page,
}: NavRowProps) {
  const { t } = useTranslation();
  const PageIcon = PAGE_ICONS[page];
  return (
    <button
      aria-current={page === activePage ? "true" : undefined}
      className={cn(
        "text-sidebar-foreground focus-visible:ring-ring/50 flex h-8 w-full cursor-default items-center gap-2 rounded-[6px] px-2 text-left text-sm outline-none select-none focus-visible:ring-3",
        // A nested row drops its icon and indents to where the parent's label
        // starts (16px icon + 8px gap), so the group reads as one column of
        // labels rather than two competing icon columns.
        isNested && "pl-8",
        // Full-width row: the arrow cursor marks it as a row
        // selection, not a button press. The hover variant
        // out-specifies a plain selected class, so the selected tab
        // must not carry the hover class at all.
        page === activePage
          ? "bg-sidebar-selected text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent",
      )}
      onClick={() => onRequestPage(page)}
      type="button"
    >
      {/* 80%-opacity icon in the row's current text color; sits a
          step back from the label like the old app's nav icons. */}
      {PageIcon !== undefined && (
        <PageIcon className="size-4 shrink-0 opacity-80" />
      )}
      <span className="min-w-0 flex-1 truncate">{t(TITLE_KEYS[page])}</span>
    </button>
  );
}
