import type { ReactNode } from "react";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { JsonValue } from "@/types/ipc";

import { isDeepEqual } from "@/lib/deep-equal";

import { KeyValueEditor, type KeyValueRow } from "../KeyValueEditor";
import { formatJsonValue, parseCellText } from "./compat-values";

interface CompatMapFieldProps {
  /**
   * The row's provenance tag and its restore action, on the heading beside the
   * name: the table below fills the row's whole width, so the two cannot share
   * a line with the control the way an inline row does.
   */
  actions?: ReactNode;
  /** What this field is for, shown beside its name. */
  info?: string | undefined;
  label: string;
  onChange: (value: null | Record<string, JsonValue>) => void;
  /** Puts the field back to its stored value. */
  onRevert?: (() => void) | undefined;
  /** The field's effective value; anything but a plain object opens empty. */
  value: JsonValue | undefined;
}

// Key-value compat field. Rows are local state so a row whose key is still
// blank stays visible and editable; every change commits the map with
// blank-key rows dropped, and a map left without rows clears the override. A
// cell is JSON when it parses and plain text otherwise, so no cell is invalid.
export function CompatMapField({
  actions,
  info,
  label,
  onChange,
  onRevert,
  value,
}: CompatMapFieldProps) {
  const { t } = useTranslation();
  const [state, setState] = useState(() => ({
    emitted: value,
    received: value,
    rows: mapRows(value),
  }));
  if (!isDeepEqual(state.received, value)) {
    setState({
      emitted: value,
      received: value,
      rows: isDeepEqual(state.emitted, value) ? state.rows : mapRows(value),
    });
  }

  function commit(next: KeyValueRow[]): void {
    const emitted = mapRecord(next);
    setState({ emitted: emitted ?? undefined, received: value, rows: next });
    onChange(emitted);
  }

  return (
    <KeyValueEditor
      actions={actions}
      addLabel={t("settings.providers.compatAddMapEntry")}
      info={info}
      keyLabel={t("settings.providers.compatMapKey")}
      label={label}
      onChange={commit}
      onRevert={onRevert}
      removeLabel={t("settings.providers.compatRemoveMapEntry")}
      rows={state.rows}
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
