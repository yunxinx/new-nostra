import type { ReactNode } from "react";

import { useTranslation } from "react-i18next";

import { RevertButton } from "./RevertButton";
import { SettingsInfoButton } from "./SettingsInfoButton";

interface SettingsRowProps {
  children?: ReactNode;
  info?: string;
  /** Whether the row's control holds a validation error. */
  isInvalid?: boolean;
  label: string;
  /**
   * `inline` puts the control beside the label, `stacked` puts it on a line of
   * its own below. A control that needs the row's whole width — a table of
   * pairs — only reads as one thing when it is stacked.
   */
  layout?: "inline" | "stacked";
  /**
   * Puts the row's own field back to the stored value. It is the row's whole
   * answer to "what did I change here": the mark that the value moved, and the
   * one click that moves it back.
   */
  onRevert?: (() => void) | undefined;
}

// Full-width flat form row: label (plus optional info popover) left, control
// right. Both slots are 32px tall and centre their own content, and the row
// aligns them at the top, so a single-line control always sits on the label's
// line and a stacked editor hangs from it. The validation message takes its
// own line below the row rather than the control slot: growing that slot is
// what pushes a control off the label's line.
export function SettingsRow({
  children,
  info,
  isInvalid = false,
  label,
  layout = "inline",
  onRevert,
}: SettingsRowProps) {
  const { t } = useTranslation();
  const heading = (
    <div className="flex min-h-8 min-w-0 items-center gap-1.5">
      <span>{label}</span>
      {info !== undefined && <SettingsInfoButton description={info} />}
    </div>
  );
  const revert =
    onRevert === undefined ? null : <RevertButton onRevert={onRevert} />;
  return (
    <div className="py-2 text-sm">
      {layout === "stacked" ? (
        <>
          <div className="flex items-center gap-1.5">{heading}</div>
          <div className="flex items-start gap-1.5 pt-1">
            {revert}
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-4">
          {heading}
          <div className="flex min-h-8 min-w-0 items-center justify-end gap-1.5">
            {revert}
            {children}
          </div>
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
