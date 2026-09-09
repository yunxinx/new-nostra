import { getCurrentWindow } from "@tauri-apps/api/window";
import { SquarePen } from "lucide-react";
import { useEffect } from "react";
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
import { useSidebarPersistence } from "@/features/sessions/use-sidebar-persistence";
import { useSendMessage } from "@/hooks/use-send-message";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { draftKeyFor, useUiStore } from "@/stores/ui-store";

export function App() {
  const { t } = useTranslation();
  useTheme();
  useShortcuts();
  useSidebarPersistence();
  // The send orchestration lives in App's stable lifetime so submissions
  // survive message-list remounts across session and draft switches.
  const { send } = useSendMessage();
  const activeSessionId = useUiStore((s) => s.activeSessionId);
  const draftId = useUiStore((s) => s.draftId);
  const startNewChat = useUiStore((s) => s.startNewChat);

  // The window is created hidden (geometry restores offscreen of view).
  // WebKit never schedules requestAnimationFrame while the host window is
  // ordered out, so a rAF-gated show() would deadlock; reveal must not
  // depend on rAF. setFocus after show: tao's set_focus is a no-op on
  // hidden windows, so it must run once show() resolves; on macOS it also
  // performs the app-level activation (activateIgnoringOtherApps). Both
  // calls are idempotent under StrictMode double-mount.
  useEffect(() => {
    void getCurrentWindow()
      .show()
      .then(() => void getCurrentWindow().setFocus());
  }, []);

  function handleSend(text: string): void {
    send(
      {
        draftId,
        draftKey: activeSessionId ?? draftKeyFor(draftId),
        sessionId: activeSessionId,
      },
      text,
    );
  }

  return (
    <div className="bg-background text-foreground flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Reserved title row: drag surface behind the fixed controls; the
            sidebar paints its own reserved row in sidebar tokens. */}
        <div className="h-[34px] shrink-0" data-tauri-drag-region />
        <section className="min-h-0 flex-1">
          {/* Selection identity is activeSessionId alone: a session stays
              selected even when its sidebar page is evicted or the list
              fails. A null selection is the new-chat draft; the draft key
              change discards the previous draft's component state, while the
              message window and drafts have their own owners. */}
          {activeSessionId !== null ? (
            <MessageList
              composerKey={activeSessionId}
              key={activeSessionId}
              onSend={handleSend}
              sessionId={activeSessionId}
            />
          ) : (
            <MessageList
              composerKey={draftKeyFor(draftId)}
              key={draftKeyFor(draftId)}
              onSend={handleSend}
              sessionId={null}
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
              onClick={startNewChat}
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
