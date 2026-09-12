import { describe, expect, it } from "vitest";

import type { UnifiedMember } from "@/types/ipc";

import {
  addMember,
  isMember,
  memberKey,
  moveMember,
  removeMember,
} from "./unified-draft";

function member(providerId: string, model: string): UnifiedMember {
  return { model, providerId };
}

describe("memberKey", () => {
  it("separates the provider and the model so pins never collide", () => {
    expect(memberKey(member("p1", "a"))).toBe("p1\u0000a");
  });
});

describe("addMember", () => {
  it("appends a new pin and keeps the existing order", () => {
    const members = [member("p1", "a"), member("p2", "b")];
    expect(addMember(members, member("p3", "c"))).toEqual([
      member("p1", "a"),
      member("p2", "b"),
      member("p3", "c"),
    ]);
  });

  it("keeps the list unchanged for a duplicate pin", () => {
    const members = [member("p1", "a")];
    expect(addMember(members, member("p1", "a"))).toBe(members);
  });
});

describe("isMember", () => {
  it("answers whether a pin is present", () => {
    const members = [member("p1", "a")];
    expect(isMember(members, member("p1", "a"))).toBe(true);
    expect(isMember(members, member("p2", "a"))).toBe(false);
  });
});

describe("moveMember", () => {
  it("swaps a member with its neighbour", () => {
    const members = [member("p1", "a"), member("p2", "b"), member("p3", "c")];
    expect(moveMember(members, 0, 1)).toEqual([
      member("p2", "b"),
      member("p1", "a"),
      member("p3", "c"),
    ]);
  });

  it("stays unchanged for a move off either end", () => {
    const members = [member("p1", "a"), member("p2", "b")];
    expect(moveMember(members, 0, -1)).toBe(members);
    expect(moveMember(members, 1, 1)).toBe(members);
  });
});

describe("removeMember", () => {
  it("removes one member by position", () => {
    const members = [member("p1", "a"), member("p2", "b")];
    expect(removeMember(members, 0)).toEqual([member("p2", "b")]);
  });
});
