import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { CompatSource, JsonValue } from "@/types/ipc";

import { changedValueCount } from "@/lib/draft-values";

import {
  canonicalCompatValue,
  type CompatInputDrafts,
  withCompatInput,
} from "./compat-draft";
import { compatFieldsFor, type ProtocolFamily } from "./compat-fields";
import { CompatField } from "./CompatField";

interface CompatSectionProps {
  baseline?: Record<string, JsonValue>;
  /** This layer's overrides in the family, as the wire shape holds them. */
  bucket: Record<string, JsonValue>;
  /**
   * Effective values of the layers under this one, keyed by field name. An
   * override that repeats one of them is what a preset leaves behind, and
   * dropping it would move the document without moving a value.
   */
  fallbacks: Record<string, JsonValue>;
  family: ProtocolFamily;
  inputs: CompatInputDrafts;
  /** Source tag this layer's own overrides report as theirs. */
  layerSource: CompatSource;
  /** Writes one field into (`value`) or out of (`null`) this layer. */
  onFieldChange: (field: string, value: JsonValue | null) => void;
  onInputsChange: (inputs: CompatInputDrafts) => void;
  /**
   * Whether the section heads itself with the family name. A panel that names
   * the family in a tab turns this off, so the name appears exactly once.
   */
  showHeading?: boolean;
  /** Winning layer per effective value, from the resolution. */
  sources: Record<string, CompatSource>;
}

// One protocol family of the compat panel: a heading and one row per field of
// the family's struct. The field set comes from the struct's schema, so a new
// compat field shows up without a second list to keep in step.
export function CompatSection({
  baseline,
  bucket,
  fallbacks,
  family,
  inputs,
  layerSource,
  onFieldChange,
  onInputsChange,
  showHeading = true,
  sources,
}: CompatSectionProps) {
  const { t } = useTranslation();
  // A map can hold unfinished rows absent from its stored value; reverting remounts it.
  const [restored, setRestored] = useState<Record<string, number>>({});

  function revert(field: string): void {
    setRestored((current) => ({
      ...current,
      [field]: (current[field] ?? 0) + 1,
    }));
    onInputsChange(withCompatInput(inputs, family, field, undefined));
    onFieldChange(field, baseline?.[field] ?? null);
  }

  return (
    // The family's accessible name scopes it: field names repeat across
    // families (`supportsLongCacheRetention`, `supportsDeveloperRole`), so a
    // row is only addressable through the section that holds it.
    <div
      aria-label={t(`settings.providers.protocols.${family}`)}
      className="flex flex-col"
      role="group"
    >
      {showHeading && (
        <h3 className="text-muted-foreground pt-6 pb-2 text-xs font-medium select-none">
          {t(`settings.providers.protocols.${family}`)}
        </h3>
      )}
      {compatFieldsFor(family).map((descriptor) => {
        const isOverridden = Object.hasOwn(bucket, descriptor.name);
        // A map keeps its two layers apart — its rows read the effective value
        // and submit this layer's own fragment — so it takes the raw bucket
        // entry; the other controls show the folded effective value.
        const isMap = descriptor.kind === "map";
        return (
          <CompatField
            baseline={isMap ? baseline?.[descriptor.name] : undefined}
            descriptor={descriptor}
            inherited={isMap ? fallbacks[descriptor.name] : undefined}
            input={inputs[family]?.[descriptor.name]}
            key={`${descriptor.name}:${String(restored[descriptor.name] ?? 0)}`}
            onCommit={(value) =>
              onFieldChange(
                descriptor.name,
                canonicalCompatValue(
                  descriptor.kind,
                  value,
                  baseline?.[descriptor.name],
                  fallbacks[descriptor.name],
                ),
              )
            }
            onInputChange={(input) =>
              onInputsChange(
                withCompatInput(inputs, family, descriptor.name, input),
              )
            }
            onRevert={
              baseline !== undefined &&
              (changedValueCount(
                baseline[descriptor.name],
                bucket[descriptor.name],
              ) > 0 ||
                inputs[family]?.[descriptor.name]?.isInvalid === true)
                ? () => revert(descriptor.name)
                : undefined
            }
            source={isOverridden ? layerSource : sources[descriptor.name]}
            value={
              isMap || isOverridden
                ? bucket[descriptor.name]
                : fallbacks[descriptor.name]
            }
          />
        );
      })}
    </div>
  );
}
