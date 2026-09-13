import type { ReactNode } from "react";

import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DataTablePanel } from "@/components/common/DataTablePanel";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { RevertButton } from "./RevertButton";
import { SettingsInfoButton } from "./SettingsInfoButton";

/** One editable pair; a row whose key is still blank stays visible. */
export interface KeyValueRow {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  /**
   * The row's own controls that are not the map's own — a provenance tag, a
   * restore action — on the heading beside the name.
   */
  actions?: ReactNode;
  /** The button that appends a row. */
  addLabel: string;
  /** What this map is for, shown over the table. */
  info?: string | undefined;
  /** Whether the map holds a validation error. */
  isInvalid?: boolean | undefined;
  /** Column header over the key inputs. */
  keyLabel: string;
  /** The setting's name, on the row and in every control's label. */
  label: string;
  onChange: (rows: KeyValueRow[]) => void;
  /** Puts the whole map back to the stored value. */
  onRevert?: (() => void) | undefined;
  /** Column header over the remove buttons. */
  removeLabel: string;
  rows: KeyValueRow[];
  /** Column header over the value inputs. */
  valueLabel: string;
}

// The well's designed height, in body rows: the table grows with the map
// until it reaches it, and scrolls inside it from then on, so a short map
// costs the space it shows and a long one never pushes the page down.
const MAX_ROWS = 5;

// The one shape every key/value map in the settings is edited through: a
// table of key, value and the row's remove button, so the pairs read as a
// list rather than as a column of unrelated inputs. The rows are the
// caller's state: a map is rebuilt from them on every change, and a row with
// a blank key has to stay visible until it is filled in.
//
// The row's own name, its description, the way back to the stored value and
// the row's add action share one line above the table, so a map reads as one
// setting: the label on the left, the control that grows it on the right.
//
// An empty map is that line alone: a well holding nothing says nothing, and
// the row it would hold back is worth more than the table it announces. The
// table appears with the first row and is exactly as tall as the rows it
// holds, up to the height it was designed for.
export function KeyValueEditor({
  actions,
  addLabel,
  info,
  isInvalid = false,
  keyLabel,
  label,
  onChange,
  onRevert,
  removeLabel,
  rows,
  valueLabel,
}: KeyValueEditorProps) {
  const { t } = useTranslation();
  return (
    <div className="py-2 text-sm">
      <div className="flex min-h-8 min-w-0 items-center gap-1.5">
        <span>{label}</span>
        {info !== undefined && <SettingsInfoButton description={info} />}
        {actions}
        {onRevert !== undefined && <RevertButton onRevert={onRevert} />}
        <Button
          aria-label={`${label} ${addLabel}`}
          className="ml-auto shrink-0"
          onClick={() => onChange([...rows, { key: "", value: "" }])}
          size="xs"
          type="button"
          variant="outline"
        >
          <Plus className="size-3" />
          {addLabel}
        </Button>
      </div>
      {rows.length > 0 && (
        <div className="pt-1">
          <DataTablePanel
            columns={["w-[38%]", undefined, "w-12"]}
            header={
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{keyLabel}</TableHead>
                  <TableHead>{valueLabel}</TableHead>
                  <TableHead className="text-center">
                    {t("common.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
            }
            rows={Math.min(rows.length, MAX_ROWS)}
          >
            <TableBody>
              {rows.map((row, index) => (
                // Rows are positional and their inputs are controlled from
                // state, so the index is the row identity.
                <TableRow className="hover:bg-transparent" key={index}>
                  <TableCell className="p-1">
                    <Input
                      aria-label={`${label} ${keyLabel}`}
                      className="h-7"
                      onChange={(event) =>
                        onChange(
                          rows.map((entry, position) =>
                            position === index
                              ? { ...entry, key: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      placeholder={keyLabel}
                      value={row.key}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      aria-label={`${label} ${valueLabel}`}
                      className="h-7"
                      onChange={(event) =>
                        onChange(
                          rows.map((entry, position) =>
                            position === index
                              ? { ...entry, value: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      placeholder={valueLabel}
                      value={row.value}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <div className="flex justify-center">
                      <IconButton
                        aria-label={`${label} ${removeLabel}`}
                        onClick={() =>
                          onChange(
                            rows.filter((_, position) => position !== index),
                          )
                        }
                        size="icon-xs"
                        type="button"
                        variant="destructive"
                      >
                        <X className="size-3" />
                      </IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTablePanel>
        </div>
      )}
      {isInvalid && (
        <p className="text-destructive pt-1 text-right text-xs" role="alert">
          {t("errors.invalid_input")}
        </p>
      )}
    </div>
  );
}
