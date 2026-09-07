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
      <div className="pb-1">
        <MarkdownRenderer content={content} />
      </div>
      {isTurnEnd && <TurnActions align="start" text={content} />}
    </div>
  );
}
