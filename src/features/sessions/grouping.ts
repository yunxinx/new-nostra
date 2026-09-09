import type { Session } from "@/types/ipc";

export interface SessionGroup {
  key: SessionGroupKey;
  sessions: Session[];
}

export type SessionGroupKey =
  "earlier" | "favorites" | "thisMonth" | "thisWeek" | "today" | "yesterday";

// Sidebar display order; empty groups are dropped by groupSessions.
const GROUP_ORDER: readonly SessionGroupKey[] = [
  "favorites",
  "today",
  "yesterday",
  "thisWeek",
  "thisMonth",
  "earlier",
];

const MS_PER_DAY = 86_400_000;

// Buckets the standard (non-pinned) stream by local calendar time; rows keep
// their keyset order. The favorites group is not derived here — the pinned
// query feeds it directly, so pinned sessions never need a time bucket.
export function groupSessions(
  sessions: readonly Session[],
  now: Date = new Date(),
): SessionGroup[] {
  const buckets = new Map<SessionGroupKey, Session[]>();
  for (const session of sessions) {
    const key = timeGroupKey(session.updatedAt, now);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(session);
    } else {
      buckets.set(key, [session]);
    }
  }
  return GROUP_ORDER.flatMap((key) => {
    if (key === "favorites") {
      return [];
    }
    const bucket = buckets.get(key);
    return bucket ? [{ key, sessions: bucket }] : [];
  });
}

// Local calendar-day index, comparable across dates in any timezone.
function localDayIndex(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function timeGroupKey(updatedAt: string, now: Date): SessionGroupKey {
  const updated = new Date(updatedAt);
  // Rounding absorbs DST-shifted local midnights, which are off by an hour.
  const dayDelta = Math.round(
    (localDayIndex(now) - localDayIndex(updated)) / MS_PER_DAY,
  );
  if (dayDelta <= 0) {
    return "today";
  }
  if (dayDelta === 1) {
    return "yesterday";
  }
  if (dayDelta <= 7) {
    return "thisWeek";
  }
  if (
    updated.getFullYear() === now.getFullYear() &&
    updated.getMonth() === now.getMonth()
  ) {
    return "thisMonth";
  }
  return "earlier";
}
