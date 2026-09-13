import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { JsonValue } from "@/types/ipc";

import {
  KeyValueEditor,
  type KeyValueRow,
} from "../../components/KeyValueEditor";
import { samplingParamsRecord, samplingRows } from "../model-rows";

interface ModelSamplingParamsProps {
  /** What this parameter map is for, shown over the table. */
  info?: string | undefined;
  /** Whether the map holds a validation error. */
  isInvalid?: boolean | undefined;
  label: string;
  onChange: (params: Record<string, JsonValue> | undefined) => void;
  /** Puts the whole map back to the stored value. */
  onRevert?: (() => void) | undefined;
  value: Record<string, JsonValue> | undefined;
}

// The sampling-parameter map of one model, edited through the same key/value
// table as a header map: a row whose key is still blank has to stay visible,
// so the rows are local state and the map is rebuilt on every change with
// blank-key rows dropped. A value is JSON when it parses and plain text
// otherwise, so no text is ever invalid.
export function ModelSamplingParams({
  info,
  isInvalid,
  label,
  onChange,
  onRevert,
  value,
}: ModelSamplingParamsProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<KeyValueRow[]>(() => samplingRows(value));

  return (
    <KeyValueEditor
      addLabel={t("settings.providers.addSamplingParam")}
      info={info}
      isInvalid={isInvalid}
      keyLabel={t("settings.providers.samplingKey")}
      label={label}
      onChange={(next) => {
        setRows(next);
        onChange(samplingParamsRecord(next));
      }}
      onRevert={onRevert}
      removeLabel={t("settings.providers.removeSamplingParam")}
      rows={rows}
      valueLabel={t("settings.providers.samplingValue")}
    />
  );
}
