import { describe, expect, it } from "vitest";

import { unifiedModelDraftSchema } from "./unified";

describe("unifiedModelDraftSchema", () => {
  it("accepts ordered members and keeps their order", () => {
    const parsed = unifiedModelDraftSchema.parse({
      id: "claude",
      members: [
        { model: "m2", providerId: "p2" },
        { model: "m1", providerId: "p1" },
      ],
    });
    expect(parsed.members?.map((member) => member.providerId)).toEqual([
      "p2",
      "p1",
    ]);
  });

  it("ignores unknown keys", () => {
    const parsed = unifiedModelDraftSchema.safeParse({
      extra: 1,
      id: "claude",
      members: [{ model: "m1", providerId: "p1" }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "extra" in parsed.data).toBe(false);
  });

  it.each([
    ["a blank id", { id: "  ", members: [{ model: "m1", providerId: "p1" }] }],
    ["a missing id", { members: [{ model: "m1", providerId: "p1" }] }],
    ["a missing members key", { id: "claude" }],
    ["an empty member list", { id: "claude", members: [] }],
    [
      "a blank member model",
      { id: "claude", members: [{ model: " ", providerId: "p1" }] },
    ],
    [
      "a blank member provider",
      { id: "claude", members: [{ model: "m1", providerId: "" }] },
    ],
    [
      "a duplicated member pin",
      {
        id: "claude",
        members: [
          { model: "m1", providerId: "p1" },
          { model: "m1", providerId: "p1" },
        ],
      },
    ],
    ["a null member list", { id: "claude", members: null }],
  ])("rejects %s", (_label, unified) => {
    expect(unifiedModelDraftSchema.safeParse(unified).success).toBe(false);
  });

  it("reports a duplicated pin at the offending member", () => {
    const parsed = unifiedModelDraftSchema.safeParse({
      id: "claude",
      members: [
        { model: "m1", providerId: "p1" },
        { model: "m2", providerId: "p2" },
        { model: "m1", providerId: "p1" },
      ],
    });
    expect(
      parsed.success ? [] : parsed.error.issues.map((issue) => issue.path),
    ).toEqual([["members", 2]]);
  });

  it("keeps two different models of one provider apart", () => {
    expect(
      unifiedModelDraftSchema.safeParse({
        id: "claude",
        members: [
          { model: "m1", providerId: "p1" },
          { model: "m2", providerId: "p1" },
        ],
      }).success,
    ).toBe(true);
  });
});
