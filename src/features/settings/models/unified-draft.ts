import type { UnifiedMember } from "@/types/ipc";

/** Appends a member unless the same pin is already present. */
export function addMember(
  members: UnifiedMember[],
  member: UnifiedMember,
): UnifiedMember[] {
  return members.some((existing) => memberKey(existing) === memberKey(member))
    ? members
    : [...members, member];
}

/** Whether a pin is already a member. */
export function isMember(
  members: UnifiedMember[],
  member: UnifiedMember,
): boolean {
  return members.some((existing) => memberKey(existing) === memberKey(member));
}

/** The stable key of a member pin, for dedupe and React keys. */
export function memberKey(member: UnifiedMember): string {
  return `${member.providerId}\u0000${member.model}`;
}

/**
 * Moves one member to another position, shifting the ones in between. A move
 * onto itself or off either end leaves the list alone: walking the order one
 * step at a time lands off an end at the first and the last row, and the
 * bounds are checked here rather than left to `splice`, which would read a
 * negative target as a position from the end.
 */
export function moveMemberTo(
  members: UnifiedMember[],
  from: number,
  to: number,
): UnifiedMember[] {
  const row = members[from];
  if (row === undefined || to < 0 || to >= members.length || from === to) {
    return members;
  }
  const next = [...members];
  next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

/** Removes one member by position. */
export function removeMember(
  members: UnifiedMember[],
  index: number,
): UnifiedMember[] {
  return members.filter((_, position) => position !== index);
}
