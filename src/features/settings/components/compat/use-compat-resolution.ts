import { useEffect, useRef, useState } from "react";

import type { ModelEntry, ProviderDraft, ResolvedCompat } from "@/types/ipc";

import { resolveCompat } from "@/lib/ipc/providers";

import type { ProtocolFamily } from "./compat-fields";

/**
 * How long the drafts settle before the panel re-resolves. Every trigger is
 * burst-prone — compat map cells commit per keystroke, the base URL changes
 * vendor detection per character, and a model row's identity changes on any
 * edit — so a burst has to collapse into one resolve per section. The controls
 * keep their own immediate display in the meantime.
 */
export const COMPAT_RESOLVE_DEBOUNCE_MS = 250;

export interface CompatResolutionInput {
  /** Model draft of a model-level view; absent asks for the provider view. */
  model?: ModelEntry;
  /** Draft the resolution reads: the base URL drives detection, compat merges. */
  provider: ProviderDraft;
}

interface SettledResolution {
  families: readonly ProtocolFamily[];
  input: CompatResolutionInput;
}

/**
 * Effective compat per protocol family from `resolve_compat`, one entry per
 * family once resolved (a family missing from the result is not resolved yet).
 * The call is a pure function over the submitted drafts, so a draft the schema
 * would reject still resolves: the panel shows values for whatever the form
 * currently holds.
 */
export function useCompatResolution(
  families: readonly ProtocolFamily[],
  input: CompatResolutionInput,
): Partial<Record<ProtocolFamily, ResolvedCompat>> {
  const [settled, setSettled] = useState<SettledResolution>(() => ({
    families: [...families],
    input,
  }));
  const [resolved, setResolved] = useState<
    Partial<Record<ProtocolFamily, ResolvedCompat>>
  >({});
  const latest = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      // A rebuild with unchanged drafts must not re-trigger the resolve:
      // consumers recreate the input object and the family list on unrelated
      // renders (a model row edit rebuilds both).
      setSettled((current) =>
        sameFamilies(current.families, families) &&
        current.input.provider === input.provider &&
        current.input.model === input.model
          ? current
          : { families: [...families], input },
      );
    }, COMPAT_RESOLVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [families, input]);

  useEffect(() => {
    // Every run takes a ticket; a result whose ticket is stale (a newer run
    // started, or the component unmounted) is dropped.
    latest.current += 1;
    const request = latest.current;
    const { input: draft } = settled;
    void (async () => {
      const entries = await Promise.all(
        settled.families.map(async (family) => {
          const resolution = await resolveCompat({
            protocol: family,
            provider: draft.provider,
            ...(draft.model !== undefined && { model: draft.model }),
          });
          return { family, resolution };
        }),
      );
      if (request !== latest.current) {
        return;
      }
      const next: Partial<Record<ProtocolFamily, ResolvedCompat>> = {};
      for (const entry of entries) {
        next[entry.family] = entry.resolution;
      }
      setResolved(next);
    })();
    return () => {
      latest.current += 1;
    };
  }, [settled]);

  return resolved;
}

/** Whether two family lists hold the same protocols in the same order. */
function sameFamilies(
  left: readonly ProtocolFamily[],
  right: readonly ProtocolFamily[],
): boolean {
  return (
    left.length === right.length &&
    left.every((family, index) => family === right[index])
  );
}
