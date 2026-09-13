import { z } from "zod";

import type { JsonValue } from "@/types/ipc";

// One lazily built schema for every provider-owned free-form JSON field, typed
// as the IPC mirror's JsonValue. The built-in zod JSON schema is avoided on
// purpose: its self-referential schema type makes form libraries expand their
// mapped types until TypeScript bails out with TS2589.
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
