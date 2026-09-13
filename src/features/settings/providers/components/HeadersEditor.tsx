import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  KeyValueEditor,
  type KeyValueRow,
} from "../../components/KeyValueEditor";
import { headerRecord, headerRows } from "../draft";

interface HeadersEditorProps {
  /** What this header map is for, shown over the table. */
  info?: string | undefined;
  /** Whether the map holds a validation error. */
  isInvalid?: boolean | undefined;
  /** The setting's name: the layer the headers belong to. */
  label: string;
  onChange: (headers: Record<string, string>) => void;
  /** Puts the whole map back to the stored value. */
  onRevert?: (() => void) | undefined;
  value: Record<string, string> | undefined;
}

// The header map of one layer. The rows are local state rather than a
// projection of the map, because a row whose key is still empty has to stay
// visible and editable; the map is rebuilt on every change with blank-key rows
// dropped, so a half-typed row never reaches the stored document.
export function HeadersEditor({
  info,
  isInvalid,
  label,
  onChange,
  onRevert,
  value,
}: HeadersEditorProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<KeyValueRow[]>(() => headerRows(value));

  return (
    <KeyValueEditor
      addLabel={t("settings.providers.addHeader")}
      info={info}
      isInvalid={isInvalid}
      keyLabel={t("settings.providers.headerKey")}
      label={label}
      onChange={(next) => {
        setRows(next);
        onChange(headerRecord(next));
      }}
      onRevert={onRevert}
      removeLabel={t("settings.providers.removeHeader")}
      rows={rows}
      valueLabel={t("settings.providers.headerValue")}
    />
  );
}
