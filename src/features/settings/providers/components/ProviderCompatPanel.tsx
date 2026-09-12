import { useMemo } from "react";
import { useWatch } from "react-hook-form";

import type { CompatBuckets } from "@/types/ipc";

import type { ProtocolFamily } from "../../components/compat/compat-fields";
import type { ProviderDraftController } from "../use-provider-draft";

import {
  overrideRecord,
  storedBuckets,
  withCompatOverride,
} from "../../components/compat/compat-values";
import { CompatSection } from "../../components/compat/CompatSection";
import { useCompatResolution } from "../../components/compat/use-compat-resolution";
import { BLANK_PROVIDER_DRAFT } from "../draft";

interface ProviderCompatPanelProps {
  baseline?: CompatBuckets | undefined;
  /** The family this pane configures; the switcher above it owns the choice. */
  family: ProtocolFamily;
  form: ProviderDraftController["form"];
}

// The advanced section of the provider form: one protocol family's merged
// effective values with their provenance, and the provider's own overrides on
// top of them. Which family is a decision of the switcher that shares the
// form's tab strip — that switcher also names the family, so the section
// itself carries no heading — and this pane holds no tabs of its own. The
// resolution only supplies the fallback display, so a resolve in flight never
// blocks an edit.
export function ProviderCompatPanel({
  baseline,
  family,
  form,
}: ProviderCompatPanelProps) {
  const baseUrl = useWatch({ control: form.control, name: "baseUrl" });
  const compat = useWatch({ control: form.control, name: "compat" });

  const families = useMemo(() => [family], [family]);
  const overrides = useMemo(() => storedBuckets(compat), [compat]);
  const input = useMemo(
    () => ({
      provider: {
        ...BLANK_PROVIDER_DRAFT,
        baseUrl,
        ...(overrides !== undefined && { compat: overrides }),
      },
    }),
    [baseUrl, overrides],
  );
  const resolved = useCompatResolution(families, input);

  return (
    <CompatSection
      baseline={overrideRecord(baseline?.[family])}
      bucket={overrideRecord(compat?.[family])}
      family={family}
      layerSource="provider"
      onFieldChange={(field, value) => {
        form.setValue(
          "compat",
          withCompatOverride(form.getValues("compat"), family, field, value) ??
            null,
          {
            shouldDirty: true,
            shouldValidate: form.formState.isSubmitted,
          },
        );
      }}
      showHeading={false}
      sources={resolved[family]?.sources ?? {}}
      values={resolved[family]?.values ?? {}}
    />
  );
}
