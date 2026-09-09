import type { UIEvent } from "react";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AppError } from "@/types/ipc";

import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/ui-store";

import { groupSessions, type SessionGroupKey } from "../grouping";
import { useSessions } from "../hooks/use-sessions";
import { SessionRow } from "./SessionRow";

export function SessionList() {
  const { t } = useTranslation();
  const { hasSessions, loadMore, pinned, standard } = useSessions();
  const activeSessionId = useUiStore((s) => s.activeSessionId);
  const setActiveSession = useUiStore((s) => s.setActiveSession);
  // Collapsed groups are sidebar-local UI state; they hide rows but never
  // block either stream from loading its next page.
  const [collapsedGroups, setCollapsedGroups] = useState<
    ReadonlySet<SessionGroupKey>
  >(new Set());

  const favoritesGroup =
    pinned.sessions.length > 0 || pinned.hasNextPage
      ? { key: "favorites" as const, sessions: pinned.sessions }
      : null;
  const timeGroups = groupSessions(standard.sessions);
  const groups = [...(favoritesGroup ? [favoritesGroup] : []), ...timeGroups];

  const isLibraryEmpty = !hasSessions;

  function handleToggleGroup(key: SessionGroupKey): void {
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

  function handleSelect(sessionId: string): void {
    setActiveSession(sessionId);
  }

  function handleScroll(event: UIEvent<HTMLDivElement>): void {
    const container = event.currentTarget;
    // Prefetch one viewport ahead; loadMore guards hasNextPage and the
    // in-flight flag itself, so repeated scroll events are no-ops.
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < container.clientHeight) {
      loadMore(false);
    }
  }

  if (isLibraryEmpty) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="text-muted-foreground px-1 py-6 text-center text-sm select-none">
          {t("sessions.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2" onScroll={handleScroll}>
      <div className="flex flex-col gap-1">
        {pinned.isLoading && <LoadingRows />}
        {pinned.error !== null && (
          <StreamErrorRow error={pinned.error} retry={pinned.retry} />
        )}
        {standard.isLoading && <LoadingRows />}
        {standard.error !== null && (
          <StreamErrorRow error={standard.error} retry={standard.retry} />
        )}
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
                    onSelect={handleSelect}
                    session={session}
                  />
                ))}
              {group.key === "favorites" && pinned.hasNextPage && (
                <LoadMoreRow
                  isFetching={pinned.isFetching}
                  onLoadMore={() => loadMore(true)}
                />
              )}
            </div>
          );
        })}
        {standard.hasNextPage && (
          <LoadMoreRow
            isFetching={standard.isFetching}
            onLoadMore={() => loadMore(false)}
          />
        )}
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      <div className="bg-sidebar-accent/40 h-8 animate-pulse rounded-[6px]" />
      <div className="bg-sidebar-accent/40 h-8 animate-pulse rounded-[6px]" />
    </div>
  );
}

function LoadMoreRow({
  isFetching,
  onLoadMore,
}: {
  isFetching: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-[22px] items-center px-1">
      {isFetching ? (
        <div
          aria-hidden="true"
          className="bg-sidebar-accent/40 h-3 w-16 animate-pulse rounded-[3px]"
        />
      ) : (
        <button
          className="text-muted-foreground hover:text-sidebar-foreground focus-visible:ring-ring/50 rounded-[6px] px-1 text-left text-xs outline-none select-none focus-visible:ring-3"
          onClick={onLoadMore}
          type="button"
        >
          {t("sessions.loadMore")}
        </button>
      )}
    </div>
  );
}

function StreamErrorRow({
  error,
  retry,
}: {
  error: AppError;
  retry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-1 px-1 py-2">
      <p className="text-muted-foreground text-xs">
        {t(`errors.${error.code}`)}
      </p>
      <Button onClick={retry} size="xs" variant="ghost">
        {t("common.retry")}
      </Button>
    </div>
  );
}
