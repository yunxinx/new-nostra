import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DataTablePanel,
  STICKY_TABLE_HEADER,
} from "@/components/common/DataTablePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** One editable pair; a row whose key is still blank stays visible. */
export interface KeyValueRow {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  /** The button that appends a row. */
  addLabel: string;
  /** Column header over the key inputs. */
  keyLabel: string;
  label?: string;
  onChange: (rows: KeyValueRow[]) => void;
  /** Column header over the remove buttons. */
  removeLabel: string;
  rows: KeyValueRow[];
  /** Column header over the value inputs. */
  valueLabel: string;
}

// The one shape every key/value map in the settings is edited through: a
// table of key, value and the row's remove button, so the pairs read as a
// list rather than as a column of unrelated inputs. The rows are the
// caller's state: a map is rebuilt from them on every change, and a row with
// a blank key has to stay visible until it is filled in.
//
// It runs the full width below its own label and scrolls inside a fixed
// well: a map has no natural length, and a table that grew would push
// everything under it down the page as rows are added.
export function KeyValueEditor({
  addLabel,
  keyLabel,
  label,
  onChange,
  removeLabel,
  rows,
  valueLabel,
}: KeyValueEditorProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-1.5">
      <DataTablePanel className="w-full shrink-0" rows={5}>
        <Table
          className="table-fixed"
          containerClassName="h-full overflow-y-auto"
        >
          <TableHeader className={STICKY_TABLE_HEADER}>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[38%]">{keyLabel}</TableHead>
              <TableHead>{valueLabel}</TableHead>
              <TableHead className="w-9 pl-0 text-center">
                <span className="sr-only">{removeLabel}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              // Rows are positional and their inputs are controlled from state,
              // so the index is the row identity.
              <TableRow className="hover:bg-transparent" key={index}>
                <TableCell className="p-1">
                  <Input
                    aria-label={
                      label === undefined ? keyLabel : `${label} ${keyLabel}`
                    }
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
                    aria-label={
                      label === undefined
                        ? valueLabel
                        : `${label} ${valueLabel}`
                    }
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
                <TableCell className="p-1 pl-0">
                  <Button
                    aria-label={
                      label === undefined
                        ? removeLabel
                        : `${label} ${removeLabel}`
                    }
                    onClick={() =>
                      onChange(rows.filter((_, position) => position !== index))
                    }
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <X className="size-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  className="text-muted-foreground py-3 text-center text-xs"
                  colSpan={3}
                >
                  {t("common.emptyRows")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DataTablePanel>
      <Button
        aria-label={label === undefined ? addLabel : `${label} ${addLabel}`}
        onClick={() => onChange([...rows, { key: "", value: "" }])}
        size="xs"
        type="button"
        variant="ghost"
      >
        <Plus className="size-3" />
        {addLabel}
      </Button>
    </div>
  );
}
