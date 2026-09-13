import { useTranslation } from "react-i18next";

import type { ModelEntry } from "@/types/ipc";

import { DataTablePanel } from "@/components/common/DataTablePanel";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { RevertButton } from "../../components/RevertButton";
import { THINKING_LEVELS, withThinkingLevel } from "../model-rows";

interface ModelThinkingLevelsProps {
  baseline: ModelEntry;
  model: ModelEntry;
  onChange: (model: ModelEntry) => void;
}

// Thinking-level overrides of one model, as a table of the fixed levels: one
// row per level, so a level is found by reading down a column instead of
// scanning a stack of controls. Three states per row: the checkbox off leaves
// the key out (the protocol family default applies), on with an empty value
// disables the level (an explicit null), on with text sends that text
// upstream.
//
// It is the key/value table's shape — a well of fixed height with a header
// row of its own and an actions column — so the two maps a model carries read
// as the same control. The levels are fixed, so the actions column carries the one
// action a row has: putting that level back to the stored value.
export function ModelThinkingLevels({
  baseline,
  model,
  onChange,
}: ModelThinkingLevelsProps) {
  const { t } = useTranslation();
  const map = model.thinkingLevelMap;
  return (
    <DataTablePanel
      columns={["w-28", "w-12", undefined, "w-12"]}
      header={
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("settings.providers.thinkingLevelHeader")}</TableHead>
            <TableHead className="text-center">
              {t("settings.providers.thinkingOverrideHeader")}
            </TableHead>
            <TableHead>{t("settings.providers.thinkingValueHeader")}</TableHead>
            <TableHead className="text-center">{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
      }
      rows={THINKING_LEVELS.length}
    >
      <TableBody>
        {THINKING_LEVELS.map((level) => {
          const label = t(`settings.providers.thinkingLevels.${level}`);
          const isOverridden = map !== undefined && level in map;
          const stored = baseline.thinkingLevelMap?.[level];
          return (
            <TableRow className="hover:bg-transparent" key={level}>
              <TableCell className="text-muted-foreground text-xs">
                {label}
              </TableCell>
              <TableCell className="p-1">
                <div className="flex justify-center">
                  <Checkbox
                    aria-label={label}
                    checked={isOverridden}
                    onCheckedChange={(checked) =>
                      onChange(
                        withThinkingLevel(
                          model,
                          level,
                          checked === true ? null : undefined,
                        ),
                      )
                    }
                  />
                </div>
              </TableCell>
              <TableCell className="p-1">
                <Input
                  aria-label={t("settings.providers.thinkingLevelValue", {
                    level: label,
                  })}
                  className="h-7"
                  disabled={!isOverridden}
                  onChange={(event) =>
                    onChange(
                      withThinkingLevel(
                        model,
                        level,
                        event.target.value === "" ? null : event.target.value,
                      ),
                    )
                  }
                  value={map?.[level] ?? ""}
                />
              </TableCell>
              <TableCell className="p-1">
                <div className="flex justify-center">
                  {map?.[level] !== stored && (
                    <RevertButton
                      onRevert={() =>
                        onChange(withThinkingLevel(model, level, stored))
                      }
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </DataTablePanel>
  );
}
