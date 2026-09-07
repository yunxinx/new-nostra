import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { MarkdownRenderer } from "./MarkdownRenderer";

const COPY_FEEDBACK_MS = 1500;

interface AssistantMessageProps {
  content: string;
}

export function AssistantMessage({ content }: AssistantMessageProps) {
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
    await writeText(content);
    setIsCopied(true);
  }

  return (
    <div className="group/turn">
      <MarkdownRenderer content={content} />
      <div className="invisible mt-1 group-hover/turn:visible">
        <button
          aria-label={t("chat.copyMessage")}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-6 items-center justify-center rounded-[6px]"
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
    </div>
  );
}
