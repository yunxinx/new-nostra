import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { JsonValue } from "@/types/ipc";

import {
  KeyValueEditor,
  type KeyValueRow,
} from "../../components/KeyValueEditor";
import { samplingParamsRecord, samplingRows } from "../model-rows";

interface ModelSamplingParamsProps {
  onChange: (params: Record<string, JsonValue> | undefined) => void;
  value: Record<string, JsonValue> | undefined;
}

// The sampling-parameter map of one model, edited through the same key/value
// table as a header map: a row whose key is still blank has to stay visible,
// so the rows are local state and the map is rebuilt on every change with
// blank-key rows dropped. A value is JSON when it parses and plain text
// otherwise, so no text is ever invalid.
export function ModelSamplingParams({
  onChange,
  value,
}: ModelSamplingParamsProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<KeyValueRow[]>(() => samplingRows(value));

  return (
    <KeyValueEditor
      addLabel={t("settings.providers.addSamplingParam")}
      keyLabel={t("settings.providers.samplingKey")}
      onChange={(next) => {
        setRows(next);
        onChange(samplingParamsRecord(next));
      }}
      removeLabel={t("settings.providers.removeSamplingParam")}
      rows={rows}
      valueLabel={t("settings.providers.samplingValue")}
    />
  );
}
