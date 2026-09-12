import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { JsonValue } from "@/types/ipc";

import { KeyValueEditor, type KeyValueRow } from "../KeyValueEditor";
import { formatJsonValue, parseCellText } from "./compat-values";

interface CompatMapFieldProps {
  label: string;
  onChange: (value: null | Record<string, JsonValue>) => void;
  /** The field's effective value; anything but a plain object opens empty. */
  value: JsonValue | undefined;
}

// Key-value compat field. Rows are local state so a row whose key is still
// blank stays visible and editable; every change commits the map with
// blank-key rows dropped, and a map left without rows clears the override. A
// cell is JSON when it parses and plain text otherwise, so no cell is invalid.
export function CompatMapField({
  label,
  onChange,
  value,
}: CompatMapFieldProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<KeyValueRow[]>(() => mapRows(value));

  function commit(next: KeyValueRow[]): void {
    setRows(next);
    onChange(mapRecord(next));
  }

  return (
    <KeyValueEditor
      addLabel={t("settings.providers.compatAddMapEntry")}
      keyLabel={t("settings.providers.compatMapKey")}
      label={label}
      onChange={commit}
      removeLabel={t("settings.providers.compatRemoveMapEntry")}
      rows={rows}
      valueLabel={t("settings.providers.compatMapValue")}
    />
  );
}

/** The map to commit, or null when no row carries a key. */
function mapRecord(rows: KeyValueRow[]): null | Record<string, JsonValue> {
  const record: Record<string, JsonValue> = {};
  let hasKey = false;
  for (const row of rows) {
    if (row.key.trim() === "") {
      continue;
    }
    record[row.key] = parseCellText(row.value);
    hasKey = true;
  }
  return hasKey ? record : null;
}

/** Editor rows of a stored map; a value shows as its JSON text. */
function mapRows(value: JsonValue | undefined): KeyValueRow[] {
  if (value === null || value === undefined || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return [];
  }
  return Object.entries(value).map(([key, entry]) => ({
    key,
    value: formatJsonValue(entry),
  }));
}
