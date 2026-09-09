/**
 * Cache key factories shared by feature hooks; no feature may import another
 * feature's internals to reuse a key. Object filters participate in the key so
 * partial matching by prefix works: invalidating `sessionsKeys.lists()`
 * touches both pinned filters, `messagesKeys.bySession(id)` matches exactly one
 * session's message query.
 */
export const sessionsKeys = {
  all: ["sessions"] as const,
  list: (pinned: boolean) => [...sessionsKeys.lists(), { pinned }] as const,
  lists: () => [...sessionsKeys.all, "list"] as const,
};

export const messagesKeys = {
  bySession: (sessionId: string) => ["messages", sessionId] as const,
};
