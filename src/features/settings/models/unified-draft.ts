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

/** Swaps a member with its neighbour; a move off either end is a no-op. */
export function moveMember(
  members: UnifiedMember[],
  index: number,
  offset: -1 | 1,
): UnifiedMember[] {
  const target = index + offset;
  const row = members[index];
  const neighbour = members[target];
  if (row === undefined || neighbour === undefined) {
    return members;
  }
  const next = [...members];
  next[index] = neighbour;
  next[target] = row;
  return next;
}

/** Removes one member by position. */
export function removeMember(
  members: UnifiedMember[],
  index: number,
): UnifiedMember[] {
  return members.filter((_, position) => position !== index);
}
