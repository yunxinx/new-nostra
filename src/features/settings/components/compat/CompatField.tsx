import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CompatSource, JsonValue } from "@/types/ipc";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { CompatFieldDescriptor } from "./compat-fields";

import { RevertButton } from "../RevertButton";
import { SettingsRow } from "../SettingsRow";
import { CompatJsonField } from "./CompatJsonField";
import { CompatMapField } from "./CompatMapField";
import { CompatSelectField } from "./CompatSelectField";
import { CompatSourceBadge } from "./CompatSourceBadge";
import { CompatSwitchField } from "./CompatSwitchField";

interface CompatFieldProps {
  descriptor: CompatFieldDescriptor;
  /** Whether the edited layer overrides the field (the layer's own key is set). */
  isOverridden: boolean;
  onCommit: (value: JsonValue | null) => void;
  onRestore: () => void;
  onRevert?: (() => void) | undefined;
  /** Winning layer of the shown value; absent while the value is unset. */
  source: CompatSource | undefined;
  /** Shown value: this layer's override, else the merged effective value. */
  value: JsonValue | undefined;
}

// One compat field: label with its explanation and provenance on the left, the
// control and the restore action on the right. The row is a named group so a
// field and its control stay addressable together.
export function CompatField({
  descriptor,
  isOverridden,
  onCommit,
  onRestore,
  onRevert,
  source,
  value,
}: CompatFieldProps) {
  const { t } = useTranslation();
  const label = t(`settings.providers.compatFields.${descriptor.name}`);

  function renderControl() {
    switch (descriptor.kind) {
      case "json":
        return (
          <CompatJsonField
            label={label}
            onChange={onCommit}
            parseValue={descriptor.parseValue}
            value={value}
          />
        );
      case "map":
        return (
          <CompatMapField label={label} onChange={onCommit} value={value} />
        );
      case "select":
        return (
          <CompatSelectField
            label={label}
            onValueChange={onCommit}
            options={descriptor.options}
            value={value}
          />
        );
      case "switch":
        return (
          <CompatSwitchField
            label={label}
            onCheckedChange={onCommit}
            value={value}
          />
        );
    }
  }

  return (
    // The row keeps the settings row shape; the named group around it scopes
    // the field, whose name repeats across families.
    <div aria-label={label} role="group">
      <SettingsRow
        info={t(`settings.providers.compatFields.${descriptor.name}Desc`)}
        label={label}
        layout={descriptor.kind === "map" ? "stacked" : "inline"}
      >
        <div className="flex items-center gap-1.5">
          {source !== undefined && <CompatSourceBadge source={source} />}
          {isOverridden && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("settings.providers.restoreDefault")}
                  onClick={onRestore}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <RotateCcw className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t("settings.providers.restoreDefault")}
              </TooltipContent>
            </Tooltip>
          )}
          {onRevert !== undefined && <RevertButton onRevert={onRevert} />}
          <div
            className={descriptor.kind === "map" ? "min-w-0 flex-1" : "min-w-0"}
          >
            {renderControl()}
          </div>
        </div>
      </SettingsRow>
    </div>
  );
}
