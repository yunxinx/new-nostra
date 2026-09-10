import { z } from "zod";

// Unified-model draft validation, mirroring validate_unified_model
// (src-tauri/src/provider/config.rs). Whether a member pins a stored model is a
// write-transaction check and stays out of the schema.

const memberIdSchema = z
  .string()
  .refine(
    (value) => value.trim() !== "",
    "unified model members must pin a provider and a model",
  );

const unifiedMemberSchema = z.object({
  model: memberIdSchema,
  providerId: memberIdSchema,
});

/**
 * A unified-model draft: a non-blank aggregate name over at least one member,
 * kept in attempt order and free of duplicate pins.
 */
export const unifiedModelDraftSchema = z
  .object({
    hide: z.boolean().optional(),
    id: z
      .string()
      .refine((id) => id.trim() !== "", "unified model id must not be blank"),
    // Absent and empty are one case: the Rust decode defaults to an empty list
    // and validation then rejects it, so both report at the same path.
    members: z.array(unifiedMemberSchema).optional(),
  })
  .superRefine((unified, ctx) => {
    const members = unified.members ?? [];
    if (members.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "unified model needs at least one member",
        path: ["members"],
      });
      return;
    }
    const seen = new Set<string>();
    members.forEach((member, index) => {
      // The NUL separator keeps two different pins from colliding when their
      // ids are concatenated.
      const pin = member.providerId + "\u0000" + member.model;
      if (seen.has(pin)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate unified model member \`${member.providerId}/${member.model}\``,
          path: ["members", index],
        });
        return;
      }
      seen.add(pin);
    });
  });
