import type { NodeComponentProps } from "markstream-react";

import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  highlightCode,
  type HighlightedToken,
  normalizeLanguage,
} from "../highlighter";

interface CodeBlockNodeData {
  code: string;
  language: string;
  type: "code_block";
}

interface HighlightedCode {
  code: string;
  isDark: boolean;
  language: string;
  tokens: HighlightedToken[][] | null;
}

const COPY_FEEDBACK_MS = 1500;

// React applies token styles through CSSOM, which the CSP permits.
export function MarkdownCodeBlockNode({
  isDark = false,
  node,
}: NodeComponentProps<CodeBlockNodeData>) {
  const { t } = useTranslation();
  const [highlighted, setHighlighted] = useState<HighlightedCode | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const language = normalizeLanguage(node.language);
  const code = node.code;
  const tokens =
    highlighted?.code === code &&
    highlighted.language === node.language &&
    highlighted.isDark === isDark
      ? highlighted.tokens
      : null;

  useEffect(() => {
    let isCancelled = false;
    void highlightCode(code, node.language, isDark).then((tokens) => {
      if (!isCancelled) {
        setHighlighted({ code, isDark, language: node.language, tokens });
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
    <div className="border-chat-border overflow-hidden rounded-[6px] border">
      <div className="bg-code-header text-chat-muted-foreground flex cursor-default items-center justify-between px-3 py-1 select-none">
        <span className="text-[13px]">{language}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t("chat.copyCode")}
              className="text-chat-muted-foreground hover:bg-chat-foreground/10 hover:text-chat-foreground focus-visible:ring-ring/50 flex size-5 items-center justify-center rounded-[6px] outline-none focus-visible:ring-3"
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
      <pre
        className="bg-chat-muted text-chat-foreground cursor-text overflow-x-auto px-3 pt-2 pb-3 font-mono text-[13px] leading-relaxed select-text"
        tabIndex={0}
      >
        <code>
          {tokens === null
            ? code
            : tokens.map((line, lineIndex) => (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 && "\n"}
                  {line.map((token) => (
                    <span key={token.offset} style={token.style}>
                      {token.content}
                    </span>
                  ))}
                </Fragment>
              ))}
        </code>
      </pre>
    </div>
  );
}
