import { useTranslation } from "react-i18next";

import type { ModelEntry } from "@/types/ipc";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
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
export function ModelThinkingLevels({
  baseline,
  model,
  onChange,
}: ModelThinkingLevelsProps) {
  const { t } = useTranslation();
  const map = model.thinkingLevelMap;
  return (
    <div className="w-72">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-20">
              {t("settings.providers.thinkingLevelHeader")}
            </TableHead>
            <TableHead className="w-9 text-center">
              {t("settings.providers.thinkingOverrideHeader")}
            </TableHead>
            <TableHead>{t("settings.providers.thinkingValueHeader")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {THINKING_LEVELS.map((level) => {
            const label = t(`settings.providers.thinkingLevels.${level}`);
            const isOverridden = map !== undefined && level in map;
            return (
              <TableRow className="hover:bg-transparent" key={level}>
                <TableCell className="text-muted-foreground p-1 text-xs">
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
                  <div className="flex items-center gap-1.5">
                    {map?.[level] !== baseline.thinkingLevelMap?.[level] && (
                      <RevertButton
                        onRevert={() =>
                          onChange(
                            withThinkingLevel(
                              model,
                              level,
                              baseline.thinkingLevelMap?.[level],
                            ),
                          )
                        }
                      />
                    )}
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
                            event.target.value === ""
                              ? null
                              : event.target.value,
                          ),
                        )
                      }
                      value={map?.[level] ?? ""}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
