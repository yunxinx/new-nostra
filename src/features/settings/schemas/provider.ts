import { z } from "zod";

import { compatBucketsSchema, isKnownProtocolFamily } from "./compat";
import { jsonValueSchema } from "./json";
import { modelCostSchema } from "./model-cost";

// Provider draft validation, mirroring the DB-free half of the Rust rules
// (src-tauri/src/provider/config.rs: normalize_base_url, validate_provider,
// validate_model). Rules that read the stored provider set — provider name
// uniqueness, cross-provider alias conflicts, unified-name collisions, member
// registration — stay in the write transaction and are not duplicated here.

/** Largest value a Rust `u32` field accepts. */
const U32_MAX = 4_294_967_295;

// Endpoint paths the request layer derives from the protocol family, so a
// stored base URL ending with one would double up.
const ENDPOINT_SUFFIXES = [
  "/chat/completions",
  "/responses",
  "/messages",
  "/v1/messages",
];

/**
 * Returns the rule a base URL violates, or null when it is acceptable: an
 * absolute http(s) URL with a host, no query or fragment, and no chat endpoint
 * path (trailing slashes do not matter).
 */
function baseUrlError(raw: string): null | string {
  const url = raw.trim().replace(/\/+$/, "");
  if (url === "") {
    return "base URL must not be blank";
  }
  if (/\s/.test(url)) {
    return "base URL must not contain whitespace";
  }
  if (url.includes("?") || url.includes("#")) {
    return "base URL must not carry a query or fragment";
  }
  const separator = url.indexOf("://");
  const scheme = separator === -1 ? "" : url.slice(0, separator).toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    return "base URL must be an absolute http(s) URL with a host";
  }
  const rest = url.slice(separator + 3);
  const pathStart = rest.search(/[/?#]/);
  const authority = pathStart === -1 ? rest : rest.slice(0, pathStart);
  const path = pathStart === -1 ? "" : rest.slice(pathStart);
  const at = authority.lastIndexOf("@");
  if (stripPort(at === -1 ? authority : authority.slice(at + 1)) === "") {
    return "base URL must be an absolute http(s) URL with a host";
  }
  if (ENDPOINT_SUFFIXES.some((suffix) => path.endsWith(suffix))) {
    return "base URL must not include a chat endpoint path";
  }
  return null;
}

/** Drops the `:port` part of an authority, leaving IPv6 literals intact. */
function stripPort(authority: string): string {
  const index = authority.lastIndexOf(":");
  return index !== -1 && !authority.slice(index + 1).includes("]")
    ? authority.slice(0, index)
    : authority;
}

const baseUrlSchema = z.string().superRefine((url, ctx) => {
  const violation = baseUrlError(url);
  if (violation !== null) {
    ctx.addIssue({ code: "custom", message: violation });
  }
});

const providerNameSchema = z
  .string()
  .refine((name) => name.trim() !== "", "provider name must not be blank");

const apiSchema = z.string().superRefine((api, ctx) => {
  if (!isKnownProtocolFamily(api)) {
    ctx.addIssue({
      code: "custom",
      message: `unknown default protocol \`${api}\``,
    });
  }
});

const modelIdSchema = z
  .string()
  .refine((id) => id.trim() !== "", "model id must not be blank");

/** Checked protocol set: known families only, each listed once. */
const apisSchema = z.array(z.string()).superRefine((apis, ctx) => {
  const seen = new Set<string>();
  apis.forEach((protocol, index) => {
    if (!isKnownProtocolFamily(protocol)) {
      ctx.addIssue({
        code: "custom",
        message: `unknown protocol family \`${protocol}\``,
        path: [index],
      });
      return;
    }
    if (seen.has(protocol)) {
      ctx.addIssue({
        code: "custom",
        message: `protocol \`${protocol}\` is listed twice`,
        path: [index],
      });
      return;
    }
    seen.add(protocol);
  });
});

/**
 * A null value disables the level; an absent key falls back to the family
 * default. Unknown keys are rejected, exactly like the Rust map decode.
 */
const thinkingLevelMapSchema = z.strictObject({
  high: z.string().nullish(),
  low: z.string().nullish(),
  max: z.string().nullish(),
  medium: z.string().nullish(),
  minimal: z.string().nullish(),
  off: z.string().nullish(),
  xhigh: z.string().nullish(),
});

/**
 * One model row: `id` is the upstream request name, `apis` the checked protocol
 * set and `aliases` the downstream reference names. Uniqueness of ids, display
 * names and aliases inside a provider is checked by `providerDraftSchema`,
 * which sees the whole model list.
 */
export const modelEntrySchema = z
  .object({
    aliases: z.array(z.string()).optional(),
    apis: apisSchema.optional(),
    baseUrl: baseUrlSchema.nullish(),
    compat: compatBucketsSchema.nullish(),
    contextWindow: z
      .int()
      .min(1, "contextWindow must be greater than zero")
      .max(U32_MAX, "contextWindow exceeds the supported range")
      .nullish(),
    cost: modelCostSchema.nullish(),
    headers: z.record(z.string(), z.string()).nullish(),
    id: modelIdSchema,
    input: z
      .array(z.enum(["image", "text"]))
      .min(1, "model input must accept at least one modality")
      .optional(),
    maxTokens: z
      .int()
      .min(1, "maxTokens must be greater than zero")
      .max(U32_MAX, "maxTokens exceeds the supported range")
      .nullish(),
    name: z.string().nullish(),
    reasoning: z.boolean().optional(),
    samplingParams: z.record(z.string(), jsonValueSchema).nullish(),
    thinkingLevelMap: thinkingLevelMapSchema.nullish(),
  })
  .superRefine((model, ctx) => {
    if ((model.aliases ?? []).some((alias) => alias.trim() === "")) {
      ctx.addIssue({
        code: "custom",
        message: "model alias must not be blank",
        path: ["aliases"],
      });
    }
  });

/** Parsed model row, as the cross-model identity rules read it. */
type ParsedModelEntry = z.output<typeof modelEntrySchema>;

// Cross-model identity rules. A model whose own fields failed parsing is
// skipped: its errors are reported per field already.
function checkModelIdentities(
  models: ParsedModelEntry[],
  ctx: z.RefinementCtx,
): void {
  const ids = new Set<string>();
  models.forEach((model, index) => {
    if (model.id.trim() === "") {
      return;
    }
    if (ids.has(model.id)) {
      ctx.addIssue({
        code: "custom",
        message: `duplicate model id \`${model.id}\``,
        path: ["models", index, "id"],
      });
      return;
    }
    ids.add(model.id);
  });
  const names = new Set<string>();
  models.forEach((model, index) => {
    const name = model.name?.trim();
    if (name === undefined || name === "") {
      return;
    }
    if (names.has(name)) {
      ctx.addIssue({
        code: "custom",
        message: `duplicate model name \`${name}\``,
        path: ["models", index, "name"],
      });
      return;
    }
    names.add(name);
  });
  // An alias is a downstream name: never another model's request name, never a
  // second time in the same provider.
  const aliases = new Set<string>();
  models.forEach((model, index) => {
    for (const alias of model.aliases ?? []) {
      const trimmed = alias.trim();
      if (trimmed === "") {
        continue;
      }
      if (ids.has(trimmed)) {
        ctx.addIssue({
          code: "custom",
          message: `alias \`${trimmed}\` is also a model id`,
          path: ["models", index, "aliases"],
        });
        return;
      }
      if (aliases.has(trimmed)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate alias \`${trimmed}\``,
          path: ["models", index, "aliases"],
        });
        return;
      }
      aliases.add(trimmed);
    }
  });
}

/**
 * A provider draft as the form submits it: `name`, `api` and `baseUrl` are
 * required, every other key may be absent (the Rust decode fills its documented
 * default) or null where the domain type is optional. Unknown keys are ignored,
 * matching the stored-document contract; compat buckets stay strict because
 * their Rust decode is.
 */
export const providerDraftSchema = z
  .object({
    abortOnDisconnect: z.boolean().optional(),
    api: apiSchema,
    apiKey: z.string().optional(),
    baseUrl: baseUrlSchema,
    compat: compatBucketsSchema.nullish(),
    enabled: z.boolean().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    maxRetries: z
      .int()
      .min(0, "maxRetries must be within [0, 4]")
      .max(4, "maxRetries must be within [0, 4]")
      .optional(),
    models: z.array(modelEntrySchema).optional(),
    name: providerNameSchema,
    reasoningOutput: z.enum(["always", "auto", "off"]).optional(),
    requestTimeoutMs: z
      .int()
      .min(1_000, "requestTimeoutMs must be within [1000, 600000]")
      .max(600_000, "requestTimeoutMs must be within [1000, 600000]")
      .optional(),
    streamIdleTimeoutMs: z
      .int()
      .min(1_000, "streamIdleTimeoutMs must be within [1000, 600000]")
      .max(600_000, "streamIdleTimeoutMs must be within [1000, 600000]")
      .optional(),
  })
  .superRefine((draft, ctx) => {
    checkModelIdentities(draft.models ?? [], ctx);
  });
