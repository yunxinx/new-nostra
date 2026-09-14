import { describe, expect, it } from "vitest";

import type { UnifiedMember } from "@/types/ipc";

import {
  addMember,
  isMember,
  memberKey,
  moveMemberTo,
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

describe("moveMemberTo", () => {
  it("moves a member one place up or down, shifting the ones in between", () => {
    const members = [member("p1", "a"), member("p2", "b"), member("p3", "c")];
    expect(moveMemberTo(members, 0, 1)).toEqual([
      member("p2", "b"),
      member("p1", "a"),
      member("p3", "c"),
    ]);
    expect(moveMemberTo(members, 2, 1)).toEqual([
      member("p1", "a"),
      member("p3", "c"),
      member("p2", "b"),
    ]);
  });

  it("moves a member across several places", () => {
    const members = [member("p1", "a"), member("p2", "b"), member("p3", "c")];
    expect(moveMemberTo(members, 2, 0)).toEqual([
      member("p3", "c"),
      member("p1", "a"),
      member("p2", "b"),
    ]);
  });

  it("stays unchanged for a move onto itself or off either end", () => {
    const members = [member("p1", "a"), member("p2", "b")];
    expect(moveMemberTo(members, 0, 0)).toBe(members);
    expect(moveMemberTo(members, 0, -1)).toBe(members);
    expect(moveMemberTo(members, 1, 2)).toBe(members);
    expect(moveMemberTo(members, 2, 0)).toBe(members);
  });
});

describe("removeMember", () => {
  it("removes one member by position", () => {
    const members = [member("p1", "a"), member("p2", "b")];
    expect(removeMember(members, 0)).toEqual([member("p2", "b")]);
  });
});
