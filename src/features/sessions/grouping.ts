import type { MockSession, MockSessionGroup } from "./mock";

export interface SessionGroup {
  key: SessionGroupKey;
  sessions: MockSession[];
}

export type SessionGroupKey =
  "earlier" | "favorites" | "thisMonth" | MockSessionGroup;

// Sidebar display order; empty groups are dropped by groupSessions.
const GROUP_ORDER: readonly SessionGroupKey[] = [
  "favorites",
  "today",
  "yesterday",
  "thisWeek",
  "thisMonth",
  "earlier",
];

export function groupSessions(
  sessions: readonly MockSession[],
): SessionGroup[] {
  return GROUP_ORDER.map((key) => ({
    key,
    sessions: sessions.filter((session) => effectiveGroupKey(session) === key),
  })).filter((group) => group.sessions.length > 0);
}

function effectiveGroupKey(session: MockSession): SessionGroupKey {
  // Favorites is a manual bucket that overrides the time bucket.
  return session.starred ? "favorites" : session.group;
}
