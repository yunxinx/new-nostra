import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  KeyValueEditor,
  type KeyValueRow,
} from "../../components/KeyValueEditor";
import { headerRecord, headerRows } from "../draft";

interface HeadersEditorProps {
  onChange: (headers: Record<string, string>) => void;
  value: Record<string, string> | undefined;
}

// The header map of one layer. The rows are local state rather than a
// projection of the map, because a row whose key is still empty has to stay
// visible and editable; the map is rebuilt on every change with blank-key rows
// dropped, so a half-typed row never reaches the stored document.
export function HeadersEditor({ onChange, value }: HeadersEditorProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<KeyValueRow[]>(() => headerRows(value));

  return (
    <KeyValueEditor
      addLabel={t("settings.providers.addHeader")}
      keyLabel={t("settings.providers.headerKey")}
      onChange={(next) => {
        setRows(next);
        onChange(headerRecord(next));
      }}
      removeLabel={t("settings.providers.removeHeader")}
      rows={rows}
      valueLabel={t("settings.providers.headerValue")}
    />
  );
}
