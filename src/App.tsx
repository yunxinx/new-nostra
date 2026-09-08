import { getCurrentWindow } from "@tauri-apps/api/window";
import { SquarePen } from "lucide-react";
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
import { SidebarToggleButton } from "@/features/sessions/components/SidebarToggleButton";
import { MOCK_SESSIONS } from "@/features/sessions/mock";
import { useSidebarPersistence } from "@/features/sessions/use-sidebar-persistence";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useUiStore } from "@/stores/ui-store";

export function App() {
  const { t } = useTranslation();
  useTheme();
  useShortcuts();
  useSidebarPersistence();
  const setActiveSession = useUiStore((s) => s.setActiveSession);
  const activeSessionId = useUiStore((s) => s.activeSessionId);

  // The window is created hidden (geometry restores offscreen of view).
  // useEffect does not guarantee the browser has painted (react.dev), so
  // show() is deferred past two animation frames: the first frame is then
  // guaranteed on screen. Cleanup cancels pending frames, keeping the
  // effect side-effect free under StrictMode double-mount.
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
        <SidebarToggleButton />
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
