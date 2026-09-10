import { ArrowUp, Plus } from "lucide-react";
import { type KeyboardEvent, useContext, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { AppError } from "@/types/ipc";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { ComposerFocusContext } from "../composer-focus-context";

const LINE_HEIGHT_PX = 20;
// 8 lines of text-sm (14px/20px line-height); taller input scrolls internally.
const MAX_TEXT_HEIGHT_PX = 8 * LINE_HEIGHT_PX;

interface ComposerProps {
  // In-flight submit for this target, or in-flight delete of the session:
  // the field and button stay inert until the write settles.
  disabled: boolean;
  // Last submit failure; the input below it is retained for retry.
  error: AppError | null;
  onSend: (text: string) => void;
  onTextChange: (text: string) => void;
  value: string;
}

export function Composer({
  disabled,
  error,
  onSend,
  onTextChange,
  value,
}: ComposerProps) {
  const { t } = useTranslation();
  const focusRequest = useContext(ComposerFocusContext);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    // Inline style: dynamic pixel value derived from scrollHeight.
    const clampedHeight = Math.min(textarea.scrollHeight, MAX_TEXT_HEIGHT_PX);
    textarea.style.height = `${String(clampedHeight)}px`;
  }, [value]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!focusRequest?.shouldRestoreFocus || disabled || !textarea) {
      return;
    }
    if (document.activeElement === document.body) {
      textarea.focus();
    }
    focusRequest.onFocusRestored();
  }, [disabled, focusRequest]);

  function handleSubmit(): void {
    const text = value.trim();
    if (disabled || text.length === 0) {
      return;
    }
    // The draft clears only after the write is confirmed persisted; a
    // failure keeps the input for a manual retry.
    onSend(text);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // IME confirmation can arrive after compositionend. Remove this fallback
    // when supported WebViews report those keydowns as isComposing.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const isCompositionKey = event.nativeEvent.keyCode === 229;
    if (event.nativeEvent.isComposing || isCompositionKey) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  const sendLabel = disabled
    ? t("chat.composer.sending")
    : t("chat.composer.send");

  return (
    <div className="bg-background border-border flex flex-col gap-0.5 rounded-lg border p-1 shadow-md">
      {/* select-text/cursor-text whitelist the field under the body-wide
          no-selection backout; relying on the UA default would inherit the
          arrow cursor instead of the I-beam. */}
      <textarea
        aria-label={t("chat.composer.placeholder")}
        className="text-foreground placeholder:text-muted-foreground max-h-40 w-full cursor-text resize-none bg-transparent px-2 py-1.5 text-sm leading-5 outline-none select-text disabled:opacity-70"
        disabled={disabled}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("chat.composer.placeholder")}
        ref={textareaRef}
        rows={1}
        value={value}
      />
      {error !== null && (
        <p className="text-destructive px-2 pb-0.5 text-xs" role="alert">
          {t(`errors.${error.code}`)}
        </p>
      )}
      <div className="flex items-center gap-1 px-1">
        {/* Attachment is a provider-domain placeholder; the affordance lands
            now so the toolbar layout is final. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t("chat.composer.attach")}
              size="icon-sm"
              variant="ghost"
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("chat.composer.attach")}</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={sendLabel}
              disabled={disabled || value.trim().length === 0}
              onClick={handleSubmit}
              size="icon-sm"
              variant="default"
            >
              <ArrowUp />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sendLabel}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
