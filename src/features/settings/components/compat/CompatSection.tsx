import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { CompatSource, JsonValue } from "@/types/ipc";

import { isDeepEqual } from "@/lib/deep-equal";

import { compatFieldsFor, type ProtocolFamily } from "./compat-fields";
import { CompatField } from "./CompatField";

interface CompatSectionProps {
  baseline?: Record<string, JsonValue>;
  /** This layer's overrides in the family, as the wire shape holds them. */
  bucket: Record<string, JsonValue>;
  family: ProtocolFamily;
  /** Source tag this layer's own overrides report as theirs. */
  layerSource: CompatSource;
  /** Writes one field into (`value`) or out of (`null`) this layer. */
  onFieldChange: (field: string, value: JsonValue | null) => void;
  /**
   * Whether the section heads itself with the family name. A panel that names
   * the family in a tab turns this off, so the name appears exactly once.
   */
  showHeading?: boolean;
  /** Winning layer per effective value, from the resolution. */
  sources: Record<string, CompatSource>;
  /** Merged effective values of the family, from the resolution. */
  values: Record<string, JsonValue>;
}

// One protocol family of the compat panel: a heading and one row per field of
// the family's struct. The field set comes from the struct's schema, so a new
// compat field shows up without a second list to keep in step.
export function CompatSection({
  baseline,
  bucket,
  family,
  layerSource,
  onFieldChange,
  showHeading = true,
  sources,
  values,
}: CompatSectionProps) {
  const { t } = useTranslation();
  // Restoring drops the layer's key; the stateful editors (map, JSON) hold
  // local text, so the row is re-keyed to re-read the fallen-back value.
  const [restored, setRestored] = useState<Record<string, number>>({});

  function restore(field: string, value: JsonValue | null = null): void {
    setRestored((current) => ({
      ...current,
      [field]: (current[field] ?? 0) + 1,
    }));
    onFieldChange(field, value);
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
        return (
          <CompatField
            descriptor={descriptor}
            isOverridden={isOverridden}
            key={`${descriptor.name}:${String(restored[descriptor.name] ?? 0)}`}
            onCommit={(value) => onFieldChange(descriptor.name, value)}
            onRestore={() => restore(descriptor.name)}
            onRevert={
              baseline !== undefined &&
              !isDeepEqual(baseline[descriptor.name], bucket[descriptor.name])
                ? () =>
                    restore(descriptor.name, baseline[descriptor.name] ?? null)
                : undefined
            }
            source={isOverridden ? layerSource : sources[descriptor.name]}
            value={
              isOverridden ? bucket[descriptor.name] : values[descriptor.name]
            }
          />
        );
      })}
    </div>
  );
}
