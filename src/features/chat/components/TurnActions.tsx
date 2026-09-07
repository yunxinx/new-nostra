import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { cn } from "cn";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const COPY_FEEDBACK_MS = 1500;

interface TurnActionsProps {
  // "start" sits under assistant prose, "end" sits under user bubbles.
  align: "end" | "start";
  text: string;
}

// End-of-turn action row. Visibility toggles with invisible/visible so the
// row keeps a stable height: hovering a turn changes opacity, never layout.
// Requires an ancestor carrying group/turn (the turn container).
export function TurnActions({ align, text }: TurnActionsProps) {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) {
      return;
    }
    const timer = window.setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [isCopied]);

  async function handleCopy(): Promise<void> {
    await writeText(text);
    setIsCopied(true);
  }

  return (
    <div
      className={cn(
        "invisible mt-1 flex pb-5 group-hover/turn:visible",
        align === "end" && "justify-end",
      )}
    >
      <button
        aria-label={t("chat.copyMessage")}
        className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-[6px]"
        onClick={() => void handleCopy()}
        type="button"
      >
        {isCopied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}
