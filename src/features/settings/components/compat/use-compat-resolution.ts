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

export interface CompatResolution {
  data: Partial<Record<ProtocolFamily, ResolvedCompat>>;
  error: Error | null;
  isLoading: boolean;
  retry: () => void;
}

export interface CompatResolutionInput {
  /** Model draft of a model-level view; absent asks for the provider view. */
  model?: ModelEntry;
  /** Draft the resolution reads: the base URL drives detection, compat merges. */
  provider: ProviderDraft;
}

interface ResolutionResult {
  data: CompatResolution["data"];
  error: Error | null;
  input: SettledResolution;
}

interface SettledResolution {
  families: readonly ProtocolFamily[];
  input: CompatResolutionInput;
}

/**
 * Effective compat per protocol family from `resolve_compat`, one entry per
 * family once resolved (a family missing from the result is not resolved yet).
 * Drafts can fail IPC decoding before the resolver runs; failures clear the
 * effective values and remain retryable until the input changes.
 */
export function useCompatResolution(
  families: readonly ProtocolFamily[],
  input: CompatResolutionInput,
): CompatResolution {
  const [settled, setSettled] = useState<SettledResolution>(() => ({
    families: [...families],
    input,
  }));
  const [result, setResult] = useState<null | ResolutionResult>(null);
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
      try {
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
        if (request !== latest.current) return;
        const data: CompatResolution["data"] = {};
        for (const entry of entries) data[entry.family] = entry.resolution;
        setResult({ data, error: null, input: settled });
      } catch (error: unknown) {
        if (request !== latest.current) return;
        setResult({
          data: {},
          error:
            error instanceof Error
              ? error
              : new Error("Compatibility resolution failed"),
          input: settled,
        });
      }
    })();
    return () => {
      latest.current += 1;
    };
  }, [settled]);

  return {
    data: result?.data ?? {},
    error: result?.input === settled ? result.error : null,
    isLoading:
      result?.input !== settled ||
      !sameFamilies(settled.families, families) ||
      settled.input.provider !== input.provider ||
      settled.input.model !== input.model,
    retry: () => setSettled((current) => ({ ...current })),
  };
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
