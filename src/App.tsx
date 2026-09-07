import { getCurrentWindow } from "@tauri-apps/api/window";
import { PanelLeft, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { TitleBarControls } from "@/components/common/TitleBarControls";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/features/appearance/use-theme";
import { MessageList } from "@/features/chat/components/MessageList";
import { Sidebar } from "@/features/sessions/components/Sidebar";
import { MOCK_SESSIONS } from "@/features/sessions/mock";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useUiStore } from "@/stores/ui-store";

export function App() {
  const { t } = useTranslation();
  useTheme();
  useShortcuts();
  const toggleSidebarCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const setActiveSession = useUiStore((s) => s.setActiveSession);
  const activeSessionId = useUiStore((s) => s.activeSessionId);

  // The window is created hidden (geometry restores offscreen of view); this
  // mount effect runs after React's first commit, so show() reveals painted
  // content. Idempotent under StrictMode double-mount.
  useEffect(() => {
    void getCurrentWindow().show();
  }, []);

  // Mock deletion only hides rows locally and never persists; the session
  // domain owns real deletion (persistence plus the confirm popover).
  const [hiddenSessionIds, setHiddenSessionIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const sessions = MOCK_SESSIONS.filter(
    (session) => !hiddenSessionIds.has(session.id),
  );
  const activeSession = sessions.find(
    (session) => session.id === activeSessionId,
  );

  function handleDeleteSession(sessionId: string): void {
    setHiddenSessionIds((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
  }

  return (
    <div className="bg-background text-foreground flex h-screen overflow-hidden">
      <Sidebar
        onDeleteSession={handleDeleteSession}
        onSelectSession={setActiveSession}
        sessions={sessions}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Reserved title row: drag surface behind the fixed controls; the
            sidebar paints its own reserved row in sidebar tokens. */}
        <div className="h-[34px] shrink-0" data-tauri-drag-region />
        <section className="min-h-0 flex-1">
          {activeSession ? (
            <MessageList
              hasSessions={sessions.length > 0}
              key={activeSession.id}
              messages={activeSession.messages}
            />
          ) : (
            // A null selection is the new-chat state; with no sessions left
            // the list shows the no-sessions empty state instead. The session
            // domain replaces the data source without touching the components.
            <MessageList
              hasSessions={sessions.length > 0}
              key="draft"
              messages={[]}
            />
          )}
        </section>
      </main>
      <TitleBarControls>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t("app.toggleSidebar")}
              onClick={toggleSidebarCollapsed}
              size="icon-sm"
              variant="ghost"
            >
              <PanelLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("app.toggleSidebar")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t("app.newChat")}
              onClick={() => setActiveSession(null)}
              size="icon-sm"
              variant="ghost"
            >
              <SquarePen />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("app.newChat")}</TooltipContent>
        </Tooltip>
      </TitleBarControls>
    </div>
  );
}
