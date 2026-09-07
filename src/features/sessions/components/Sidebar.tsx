import { cn } from "cn";
import { type PointerEvent, useRef, useState } from "react";

import { useUiStore } from "@/stores/ui-store";

import type { MockSession } from "../mock";

import { AccountBar } from "./AccountBar";
import { SessionList } from "./SessionList";

interface ResizeStart {
  pointerId: number;
  startWidth: number;
  startX: number;
}

interface SidebarProps {
  onDeleteSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  sessions: readonly MockSession[];
}

export function Sidebar({
  onDeleteSession,
  onSelectSession,
  sessions,
}: SidebarProps) {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const activeSessionId = useUiStore((s) => s.activeSessionId);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<null | ResizeStart>(null);

  function handleResizeStart(event: PointerEvent<HTMLDivElement>): void {
    resizeStartRef.current = {
      pointerId: event.pointerId,
      startWidth: useUiStore.getState().sidebarWidth,
      startX: event.clientX,
    };
    // Pointer capture keeps resize deltas flowing to this element even when
    // the cursor outruns the 6px hot zone.
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
  }

  function handleResizeMove(event: PointerEvent<HTMLDivElement>): void {
    const resizeStart = resizeStartRef.current;
    if (!resizeStart || resizeStart.pointerId !== event.pointerId) {
      return;
    }
    useUiStore
      .getState()
      .setSidebarWidth(
        resizeStart.startWidth + event.clientX - resizeStart.startX,
      );
  }

  function handleResizeEnd(event: PointerEvent<HTMLDivElement>): void {
    if (resizeStartRef.current?.pointerId === event.pointerId) {
      resizeStartRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsResizing(false);
  }

  return (
    <div
      className={cn(
        "bg-sidebar shrink-0 overflow-hidden",
        // The width transition animates collapse/expand; during manual
        // resize the width must track the pointer without lag.
        !isResizing && "transition-[width] duration-[220ms] ease-in-out",
      )}
      style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
    >
      {/* Inner column keeps a fixed width so content does not reflow while
          the outer wrapper animates. */}
      <div
        className="relative flex h-full flex-col"
        style={{ width: sidebarWidth }}
      >
        {/* Reserved title row: the sidebar background extends behind the
            traffic lights through this spacer. */}
        <div className="h-[34px] shrink-0" data-tauri-drag-region />
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <SessionList
            activeSessionId={activeSessionId}
            onDelete={onDeleteSession}
            onSelect={onSelectSession}
            sessions={sessions}
          />
        </div>
        <AccountBar />
        {!sidebarCollapsed && (
          <div
            className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize"
            onPointerCancel={handleResizeEnd}
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
          />
        )}
      </div>
    </div>
  );
}
