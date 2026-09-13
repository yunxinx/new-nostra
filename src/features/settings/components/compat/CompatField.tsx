import { useTranslation } from "react-i18next";

import type { CompatSource, JsonValue } from "@/types/ipc";

import type { CompatInputDraft } from "./compat-draft";
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
  input: CompatInputDraft | undefined;
  onCommit: (value: JsonValue | null) => void;
  onInputChange: (input: CompatInputDraft | undefined) => void;
  onRevert?: (() => void) | undefined;
  /** Winning layer of the shown value; absent while the value is unset. */
  source: CompatSource | undefined;
  /** Shown value: this layer's override, else the merged effective value. */
  value: JsonValue | undefined;
}

// One compat field: the field's name with its explanation and provenance on
// the left, the control and the restore action on the right. The row is a
// named group so a field and its control stay addressable together.
//
// A table of pairs is the one control that names itself and owns its own
// heading, so it takes the row whole: wrapping it in a row of its own would
// put the field's name on the pane twice.
export function CompatField({
  descriptor,
  input,
  onCommit,
  onInputChange,
  onRevert,
  source,
  value,
}: CompatFieldProps) {
  const { t } = useTranslation();
  const label = t(`settings.providers.compatFields.${descriptor.name}`);
  const info = t(`settings.providers.compatFields.${descriptor.name}Desc`);
  const actions =
    source === undefined ? null : <CompatSourceBadge source={source} />;

  if (descriptor.kind === "map") {
    return (
      // The row keeps the settings row shape; the named group around it scopes
      // the field, whose name repeats across families.
      <div aria-label={label} role="group">
        <CompatMapField
          actions={actions}
          info={info}
          label={label}
          onChange={onCommit}
          onRevert={onRevert}
          value={value}
        />
      </div>
    );
  }

  // The map is handled above, so this switch never sees it: it renders the
  // controls that share the row with the field's name.
  function renderControl() {
    switch (descriptor.kind) {
      case "json":
      case "list":
        return (
          <CompatJsonField
            input={input}
            kind={descriptor.kind}
            label={label}
            onChange={onCommit}
            onInputChange={onInputChange}
            parseValue={descriptor.parseValue}
            value={value}
          />
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
    <div aria-label={label} role="group">
      <SettingsRow
        info={info}
        label={label}
        // A list is a block of text, so it hangs from the label's line rather
        // than sharing it.
        layout={descriptor.kind === "list" ? "stacked" : "inline"}
      >
        <div className="flex items-center gap-1.5">
          {actions}
          {onRevert !== undefined && <RevertButton onRevert={onRevert} />}
          {/* A list is a block of text on a line of its own, so it takes the
              whole width that line has left. */}
          <div
            className={
              descriptor.kind === "list" ? "min-w-0 flex-1" : "min-w-0"
            }
          >
            {renderControl()}
          </div>
        </div>
      </SettingsRow>
    </div>
  );
}
