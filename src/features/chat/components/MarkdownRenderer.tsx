import MarkdownRender, { setCustomComponents } from "markstream-react";

import { useTheme } from "@/features/appearance/use-theme";

import { MarkdownCodeBlockNode } from "./MarkdownCodeBlockNode";

import "markstream-react/index.tailwind.css";

// Registered once per bundle: every renderer instance shares the custom
// code_block component, so swapping the render stack still only touches this
// file and MarkdownCodeBlockNode.
setCustomComponents({ code_block: MarkdownCodeBlockNode });

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const isDark = useTheme();

  return (
    <div className="chat-markdown">
      <MarkdownRender content={content} fade={false} final isDark={isDark} />
    </div>
  );
}
