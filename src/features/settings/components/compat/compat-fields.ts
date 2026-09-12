import { z } from "zod";

import type { JsonValue, ModelEntry, Protocol } from "@/types/ipc";

import {
  anthropicMessagesCompatSchema,
  openaiCompletionsCompatSchema,
  openaiResponsesCompatSchema,
  protocolFamilySchema,
} from "../../schemas/compat";
import { jsonValueSchema } from "../../schemas/json";

export interface CompatFieldDescriptor {
  kind: CompatControlKind;
  name: string;
  /** Values of a select field, in schema order; empty for the other kinds. */
  options: readonly string[];
  /**
   * The value `raw` as the field stores it, or null when it does not match the
   * field's shape. The JSON editor validates through this before writing; the
   * other controls emit schema-valid values by construction.
   */
  parseValue: (raw: JsonValue) => JsonValue | null;
}

/** Protocol family with a compat struct; unknown wire names take no section. */
export type ProtocolFamily = z.infer<typeof protocolFamilySchema>;

/** Control a compat field is edited with, decided by the field's schema type. */
type CompatControlKind = "json" | "map" | "select" | "switch";

// The three compat structs are the single source of truth for the field set,
// the control kind and the select options: a field added there reaches the
// panel without a second list to update (and without a chance to drop it).
const FIELD_DESCRIPTORS: Record<ProtocolFamily, CompatFieldDescriptor[]> = {
  "anthropic-messages": descriptorsOf(anthropicMessagesCompatSchema.shape),
  "openai-completions": descriptorsOf(openaiCompletionsCompatSchema.shape),
  "openai-responses": descriptorsOf(openaiResponsesCompatSchema.shape),
};

/**
 * The families a directory resolves against: every family its rows check, or
 * the provider's own default protocol while no row checks one. This is the
 * merge order the request layer applies, so a pane can name the family it
 * configures without asking the backend.
 */
export function compatFamiliesFor(
  api: Protocol | undefined,
  models: readonly ModelEntry[],
): ProtocolFamily[] {
  const checked = knownCompatFamilies(
    models.flatMap((model) => model.apis ?? []),
  );
  return checked.length > 0
    ? checked
    : knownCompatFamilies(api === undefined ? [] : [api]);
}

/** The compat fields of one family, sorted by name. */
export function compatFieldsFor(
  family: ProtocolFamily,
): CompatFieldDescriptor[] {
  return FIELD_DESCRIPTORS[family];
}

/**
 * The compat families among `protocols`, deduplicated and ordered like the
 * family schema. Protocol names are an open set, so an unknown name simply
 * takes no compat section.
 */
export function knownCompatFamilies(
  protocols: readonly string[],
): ProtocolFamily[] {
  const named = new Set(protocols);
  return protocolFamilySchema.options.filter((family) => named.has(family));
}

function descriptorOf(name: string, field: z.ZodType): CompatFieldDescriptor {
  const base = withoutNullish(field);
  return {
    kind: kindOf(base),
    name,
    options: optionsOf(base),
    parseValue: (raw) => parseFieldValue(base, raw),
  };
}

function descriptorsOf(
  shape: Record<string, z.ZodType>,
): CompatFieldDescriptor[] {
  const descriptors: CompatFieldDescriptor[] = [];
  for (const name of Object.keys(shape).sort()) {
    const field = shape[name];
    if (field === undefined) {
      continue;
    }
    descriptors.push(descriptorOf(name, field));
  }
  return descriptors;
}

/** The control kind of a field: booleans switch, enums and literals select. */
function kindOf(base: z.ZodType): CompatControlKind {
  if (base instanceof z.ZodBoolean) {
    return "switch";
  }
  if (base instanceof z.ZodEnum || base instanceof z.ZodLiteral) {
    return "select";
  }
  if (base instanceof z.ZodRecord) {
    return "map";
  }
  // Arrays, numbers and whatever a future field adds: the JSON editor parses
  // the text and validates it against this field's own schema.
  return "json";
}

/**
 * The select options of a field. Every compat enum and literal is
 * string-valued; a non-string literal would need a dedicated control because
 * a select value is a string.
 */
function optionsOf(base: z.ZodType): readonly string[] {
  if (base instanceof z.ZodEnum) {
    return base.options.map(String);
  }
  if (base instanceof z.ZodLiteral) {
    return [...base.values].map(String);
  }
  return [];
}

function parseFieldValue(base: z.ZodType, raw: JsonValue): JsonValue | null {
  const parsed = base.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const value = jsonValueSchema.safeParse(parsed.data);
  return value.success ? value.data : null;
}

/** Strips the `.nullish()` wrapper of a stored field down to its value schema. */
function withoutNullish(field: z.core.SomeType): z.ZodType {
  if (field instanceof z.ZodOptional || field instanceof z.ZodNullable) {
    return withoutNullish(field.unwrap());
  }
  if (field instanceof z.ZodType) {
    return field;
  }
  // Unreachable for compat fields, which are all classic wrapped schemas: the
  // field still gets a control, just without a shape to validate against.
  return z.unknown();
}
