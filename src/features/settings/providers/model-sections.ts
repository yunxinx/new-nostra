/**
 * The sections one model is edited in. Identity, capability, pricing and
 * compatibility are the four questions a model answers, and the strip that
 * picks between them is the same wherever a model is edited — a pane under the
 * provider, or a panel over the list.
 */
export const MODEL_SECTIONS = [
  "identity",
  "capability",
  "pricing",
  "compat",
] as const;
