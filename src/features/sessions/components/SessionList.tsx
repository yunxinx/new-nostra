import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { MockSession } from "../mock";

import { groupSessions } from "../grouping";
import { SessionRow } from "./SessionRow";

interface SessionListProps {
  activeSessionId: null | string;
  onDelete: (sessionId: string) => void;
  onSelect: (sessionId: string) => void;
  sessions: readonly MockSession[];
}

export function SessionList({
  activeSessionId,
  onDelete,
  onSelect,
  sessions,
}: SessionListProps) {
  const { t } = useTranslation();
  // Star state is display-only and never persisted, so it lives here rather
  // than in the ui store; keyed overrides keep the mock source untouched.
  const [starOverrides, setStarOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const effectiveSessions = sessions.map((session) => {
    const starOverride = starOverrides[session.id];
    return starOverride === undefined
      ? session
      : { ...session, starred: starOverride };
  });
  const groups = groupSessions(effectiveSessions);

  function handleToggleStar(sessionId: string): void {
    setStarOverrides((prev) => ({
      ...prev,
      [sessionId]: !(
        prev[sessionId] ??
        sessions.find((s) => s.id === sessionId)?.starred ??
        false
      ),
    }));
  }

  function handleToggleGroup(key: string): void {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground px-1 py-6 text-center text-sm select-none">
        {t("sessions.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {groups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.key);
        return (
          <div className="flex flex-col gap-1" key={group.key}>
            <div className="flex h-[22px] items-center">
              <button
                aria-expanded={!isCollapsed}
                className="group/header hover:bg-sidebar-accent/60 text-sidebar-foreground/60 focus-visible:ring-ring/50 inline-flex h-full items-center gap-0.5 rounded-[6px] px-1 text-left text-xs outline-none select-none focus-visible:ring-3"
                onClick={() => handleToggleGroup(group.key)}
                type="button"
              >
                {t(`sessions.groups.${group.key}`)}
                {isCollapsed ? (
                  <ChevronRight className="size-3 opacity-0 group-hover/header:opacity-100" />
                ) : (
                  <ChevronDown className="size-3 opacity-0 group-hover/header:opacity-100" />
                )}
              </button>
            </div>
            {!isCollapsed &&
              group.sessions.map((session) => (
                <SessionRow
                  isActive={session.id === activeSessionId}
                  key={session.id}
                  onDelete={() => onDelete(session.id)}
                  onSelect={() => onSelect(session.id)}
                  onToggleStar={() => handleToggleStar(session.id)}
                  session={session}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
