import type { NodeComponentProps } from "markstream-react";

import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { highlightCode, normalizeLanguage } from "../highlighter";

interface CodeBlockNodeData {
  code: string;
  language: string;
  type: "code_block";
}

const COPY_FEEDBACK_MS = 1500;

// Shiki output is sanitized at the source: hast serialization escapes the
// code text, so the HTML can be mounted directly.
export function MarkdownCodeBlockNode({
  isDark = false,
  node,
}: NodeComponentProps<CodeBlockNodeData>) {
  const { t } = useTranslation();
  const [html, setHtml] = useState<null | string>(null);
  const [isCopied, setIsCopied] = useState(false);
  const language = normalizeLanguage(node.language);
  const code = node.code;

  useEffect(() => {
    let isCancelled = false;
    void highlightCode(code, node.language, isDark).then((highlighted) => {
      if (!isCancelled) {
        setHtml(highlighted);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [code, isDark, node.language]);

  useEffect(() => {
    if (!isCopied) {
      return;
    }
    const timer = window.setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [isCopied]);

  async function handleCopy(): Promise<void> {
    await writeText(code);
    setIsCopied(true);
  }

  return (
    <div className="border-border overflow-hidden rounded-[6px] border">
      <div className="bg-code-header text-muted-foreground flex items-center justify-between px-3 py-1 select-none">
        <span className="text-[13px]">{language}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t("chat.copyCode")}
              className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-ring/50 flex size-5 items-center justify-center rounded-[6px] outline-none focus-visible:ring-3"
              onClick={() => void handleCopy()}
              type="button"
            >
              {isCopied ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("chat.copyCode")}</TooltipContent>
        </Tooltip>
      </div>
      {/* Header py-1 + body pt-2 keeps the 12px header-to-code gap.
          Body bottom padding is 12px unconditionally; the old app shrank it
          to 2px when content overflowed horizontally — detecting overflow
          is not done here. */}
      {html !== null ? (
        <div
          className="bg-muted text-foreground overflow-x-auto px-3 pt-2 pb-3 font-mono text-[13px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="bg-muted text-foreground overflow-x-auto px-3 pt-2 pb-3 font-mono text-[13px] leading-relaxed">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
