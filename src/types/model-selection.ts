/** A local chat target; e.g. { kind: "provider", providerId: "p1", modelId: "m1" }. */
export type ModelSelection =
  | { kind: "provider"; modelId: string; providerId: string }
  | { kind: "unified"; modelId: string };
