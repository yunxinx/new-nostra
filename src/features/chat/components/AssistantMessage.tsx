import type { ContentBlock } from "@/types/ipc";

import { textOfParts } from "../types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { TurnActions } from "./TurnActions";

interface AssistantMessageProps {
  isTurnEnd: boolean;
  parts: ContentBlock[];
}

export function AssistantMessage({ isTurnEnd, parts }: AssistantMessageProps) {
  return (
    <div className="group/turn">
      {/* The whitelist has to sit on this wrapper, above the renderer's own
          tree: .chat-markdown's user-select in index.css does not by itself
          restore selection under the body-wide none, so dropping this class
          leaves the prose uncopyable. Each text part renders through the
          shared markdown path; boundaries between parts stay separate
          blocks. */}
      <div className="cursor-auto pb-1 select-text">
        {parts.map((part, index) => (
          <MarkdownRenderer content={part.text} key={index} />
        ))}
      </div>
      {isTurnEnd && <TurnActions align="start" text={textOfParts(parts)} />}
    </div>
  );
}
