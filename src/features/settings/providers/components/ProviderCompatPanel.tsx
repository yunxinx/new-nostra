import { useWatch } from "react-hook-form";

import type { CompatBuckets } from "@/types/ipc";

import type { CompatInputDrafts } from "../../components/compat/compat-draft";
import type { ProtocolFamily } from "../../components/compat/compat-fields";
import type { CompatResolution } from "../../components/compat/use-compat-resolution";
import type { ProviderDraftController } from "../use-provider-draft";

import {
  overrideRecord,
  withCompatOverride,
} from "../../components/compat/compat-values";
import { CompatResolutionNotice } from "../../components/compat/CompatResolutionNotice";
import { CompatSection } from "../../components/compat/CompatSection";

interface ProviderCompatPanelProps {
  baseline?: CompatBuckets | undefined;
  /** The family this pane configures; the switcher above it owns the choice. */
  family: ProtocolFamily;
  form: ProviderDraftController["form"];
  inputs: CompatInputDrafts;
  onInputsChange: (inputs: CompatInputDrafts) => void;
  resolution: CompatResolution;
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
  inputs,
  onInputsChange,
  resolution,
}: ProviderCompatPanelProps) {
  const compat = useWatch({ control: form.control, name: "compat" });

  return (
    <div aria-busy={resolution.isLoading}>
      <CompatResolutionNotice resolution={resolution} />
      <CompatSection
        baseline={overrideRecord(baseline?.[family])}
        bucket={overrideRecord(compat?.[family])}
        fallbacks={resolution.data[family]?.values ?? {}}
        family={family}
        inputs={inputs}
        layerSource="provider"
        onFieldChange={(field, value) => {
          form.setValue(
            "compat",
            withCompatOverride(
              form.getValues("compat"),
              family,
              field,
              value,
            ) ?? null,
            {
              shouldDirty: true,
              shouldValidate: form.formState.isSubmitted,
            },
          );
        }}
        onInputsChange={onInputsChange}
        showHeading={false}
        sources={resolution.data[family]?.sources ?? {}}
      />
    </div>
  );
}
