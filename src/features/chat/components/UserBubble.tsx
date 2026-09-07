import { TurnActions } from "./TurnActions";

interface UserBubbleProps {
  content: string;
  isTurnEnd: boolean;
}

export function UserBubble({ content, isTurnEnd }: UserBubbleProps) {
  return (
    <div className="group/turn">
      <div className="flex justify-end pb-1">
        <div className="bg-secondary text-secondary-foreground max-w-[560px] rounded-lg px-3 py-1.5 text-sm whitespace-pre-wrap">
          {content}
        </div>
      </div>
      {isTurnEnd && <TurnActions align="end" text={content} />}
    </div>
  );
}
