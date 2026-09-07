import { ArrowUp, Plus } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

const LINE_HEIGHT_PX = 20;
// 8 lines of text-sm (14px/20px line-height); taller input scrolls internally.
const MAX_TEXT_HEIGHT_PX = 8 * LINE_HEIGHT_PX;

interface ComposerProps {
  onSend: (text: string) => void;
}

export function Composer({ onSend }: ComposerProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
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

  function handleSubmit(): void {
    const text = value.trim();
    if (!text) {
      return;
    }
    onSend(text);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="bg-background border-border flex flex-col gap-0.5 rounded-lg border p-1 shadow-md">
      <textarea
        aria-label={t("chat.composer.placeholder")}
        className="text-foreground placeholder:text-muted-foreground max-h-40 w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-5 outline-none"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("chat.composer.placeholder")}
        ref={textareaRef}
        rows={1}
        value={value}
      />
      <div className="flex items-center gap-1 px-1">
        {/* Attachment is a provider-domain placeholder; the affordance lands
            now so the toolbar layout is final. */}
        <Button
          aria-label={t("chat.composer.attach")}
          size="icon-sm"
          variant="ghost"
        >
          <Plus />
        </Button>
        <div className="flex-1" />
        <Button
          aria-label={t("chat.composer.send")}
          disabled={!value.trim()}
          onClick={handleSubmit}
          size="icon-sm"
          variant="default"
        >
          <ArrowUp />
        </Button>
      </div>
    </div>
  );
}
