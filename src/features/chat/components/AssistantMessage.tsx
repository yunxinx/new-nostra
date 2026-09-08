import { MarkdownRenderer } from "./MarkdownRenderer";
import { TurnActions } from "./TurnActions";

interface AssistantMessageProps {
  content: string;
  isTurnEnd: boolean;
}

export function AssistantMessage({
  content,
  isTurnEnd,
}: AssistantMessageProps) {
  return (
    <div className="group/turn">
      {/* The whitelist has to sit on this wrapper, above the renderer's own
          tree: .chat-markdown's user-select in index.css does not by itself
          restore selection under the body-wide none, so dropping this class
          leaves the prose uncopyable. */}
      <div className="cursor-auto pb-1 select-text">
        <MarkdownRenderer content={content} />
      </div>
      {isTurnEnd && <TurnActions align="start" text={content} />}
    </div>
  );
}
