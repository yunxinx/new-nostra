import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";

import type {
  AnthropicMessagesCompat,
  CompatBuckets,
  ModelCost,
  ModelEntry,
  OpenaiCompletionsCompat,
  OpenaiResponsesCompat,
  ProviderDraft,
  UnifiedModel,
} from "@/types/ipc";

import {
  anthropicMessagesCompatSchema,
  compatBucketsSchema,
  openaiCompletionsCompatSchema,
  openaiResponsesCompatSchema,
} from "./compat";
import { modelCostSchema } from "./model-cost";
import { modelEntrySchema, providerDraftSchema } from "./provider";
import { unifiedModelDraftSchema } from "./unified";

/**
 * Resolves the two modelling differences between a parsed draft and the IPC
 * mirror before shapes are compared: zod types an absent optional key as
 * `T | undefined` where the mirror writes `T` (exactOptionalPropertyTypes makes
 * those distinct), and a draft may omit exactly the keys the Rust decode fills
 * with defaults, so absent optionals are resolved to required ones.
 */
type DraftValueShape<T> = T extends readonly (infer U)[]
  ? Array<DraftValueShape<U>>
  : T extends object
    ? { [K in keyof T]-?: DraftValueShape<Exclude<T[K], null | undefined>> }
    : T;

// Every assertion below is compile-time: `toExtend` fails the build when the
// schema drifts from the mirror, `toEqualTypeOf` when a key set changes.

describe("providerDraftSchema against the IPC mirror", () => {
  it("accepts drafts shaped by the mirror and emits the same shape", () => {
    expectTypeOf<
      DraftValueShape<z.output<typeof providerDraftSchema>>
    >().toExtend<ProviderDraft>();
    expectTypeOf<ProviderDraft>().toExtend<
      z.input<typeof providerDraftSchema>
    >();
  });

  it("covers exactly the mirror keys", () => {
    expectTypeOf<
      keyof DraftValueShape<z.output<typeof providerDraftSchema>>
    >().toEqualTypeOf<keyof ProviderDraft>();
  });
});

describe("modelEntrySchema against the IPC mirror", () => {
  it("accepts rows shaped by the mirror and emits the same shape", () => {
    expectTypeOf<
      DraftValueShape<z.output<typeof modelEntrySchema>>
    >().toExtend<ModelEntry>();
    expectTypeOf<ModelEntry>().toExtend<z.input<typeof modelEntrySchema>>();
  });

  it("covers exactly the mirror keys", () => {
    expectTypeOf<
      keyof DraftValueShape<z.output<typeof modelEntrySchema>>
    >().toEqualTypeOf<keyof ModelEntry>();
  });
});

describe("modelCostSchema against the IPC mirror", () => {
  it("accepts costs shaped by the mirror and emits the same shape", () => {
    expectTypeOf<
      DraftValueShape<z.output<typeof modelCostSchema>>
    >().toExtend<ModelCost>();
    expectTypeOf<ModelCost>().toExtend<z.input<typeof modelCostSchema>>();
  });

  it("covers exactly the mirror keys", () => {
    expectTypeOf<
      keyof DraftValueShape<z.output<typeof modelCostSchema>>
    >().toEqualTypeOf<keyof ModelCost>();
  });
});

describe("compatBucketsSchema against the IPC mirror", () => {
  it("accepts buckets shaped by the mirror and emits the same shape", () => {
    expectTypeOf<
      DraftValueShape<z.output<typeof compatBucketsSchema>>
    >().toExtend<CompatBuckets>();
    expectTypeOf<CompatBuckets>().toExtend<
      z.input<typeof compatBucketsSchema>
    >();
  });

  it("covers exactly the mirror keys", () => {
    expectTypeOf<
      keyof DraftValueShape<z.output<typeof compatBucketsSchema>>
    >().toEqualTypeOf<keyof CompatBuckets>();
  });
});

describe("compat fragments against the IPC mirror", () => {
  it("keeps each family assignable in both directions", () => {
    expectTypeOf<
      DraftValueShape<z.output<typeof openaiCompletionsCompatSchema>>
    >().toExtend<OpenaiCompletionsCompat>();
    expectTypeOf<OpenaiCompletionsCompat>().toExtend<
      z.input<typeof openaiCompletionsCompatSchema>
    >();
    expectTypeOf<
      keyof DraftValueShape<z.output<typeof openaiCompletionsCompatSchema>>
    >().toEqualTypeOf<keyof OpenaiCompletionsCompat>();

    expectTypeOf<
      DraftValueShape<z.output<typeof openaiResponsesCompatSchema>>
    >().toExtend<OpenaiResponsesCompat>();
    expectTypeOf<OpenaiResponsesCompat>().toExtend<
      z.input<typeof openaiResponsesCompatSchema>
    >();
    expectTypeOf<
      keyof DraftValueShape<z.output<typeof openaiResponsesCompatSchema>>
    >().toEqualTypeOf<keyof OpenaiResponsesCompat>();

    expectTypeOf<
      DraftValueShape<z.output<typeof anthropicMessagesCompatSchema>>
    >().toExtend<AnthropicMessagesCompat>();
    expectTypeOf<AnthropicMessagesCompat>().toExtend<
      z.input<typeof anthropicMessagesCompatSchema>
    >();
    expectTypeOf<
      keyof DraftValueShape<z.output<typeof anthropicMessagesCompatSchema>>
    >().toEqualTypeOf<keyof AnthropicMessagesCompat>();
  });
});

describe("unifiedModelDraftSchema against the IPC mirror", () => {
  it("accepts aggregates shaped by the mirror and emits the same shape", () => {
    expectTypeOf<
      DraftValueShape<z.output<typeof unifiedModelDraftSchema>>
    >().toExtend<UnifiedModel>();
    expectTypeOf<UnifiedModel>().toExtend<
      z.input<typeof unifiedModelDraftSchema>
    >();
  });

  it("covers exactly the mirror keys", () => {
    expectTypeOf<
      keyof DraftValueShape<z.output<typeof unifiedModelDraftSchema>>
    >().toEqualTypeOf<keyof UnifiedModel>();
  });
});
