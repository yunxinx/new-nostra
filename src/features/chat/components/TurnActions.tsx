import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { cn } from "cn";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const COPY_FEEDBACK_MS = 1500;

interface TurnActionsProps {
  // "start" sits under assistant prose, "end" sits under user bubbles.
  align: "end" | "start";
  text: string;
}

// End-of-turn action row. Opacity (not visibility) hides it: the row keeps a
// stable height and the copy button stays in the tab order, so keyboard
// focus within the turn reveals the row just like hover does. Requires an
// ancestor carrying group/turn (the turn container).
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
        "mt-1 flex pb-5 opacity-0 group-focus-within/turn:opacity-100 group-hover/turn:opacity-100",
        align === "end" && "justify-end",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={t("chat.copyMessage")}
            className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-ring/50 flex size-6 items-center justify-center rounded-[6px] outline-none focus-visible:ring-3"
            onClick={() => void handleCopy()}
            type="button"
          >
            {isCopied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{t("chat.copyMessage")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
