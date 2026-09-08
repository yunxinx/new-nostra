import { TurnActions } from "./TurnActions";

interface UserBubbleProps {
  content: string;
  isTurnEnd: boolean;
}

export function UserBubble({ content, isTurnEnd }: UserBubbleProps) {
  return (
    <div className="group/turn">
      {/* select-text/cursor-text whitelist the bubble under the body-wide
          no-selection backout; copying one's own message is a legitimate need
          and the I-beam is the correct cursor over selectable text. */}
      <div className="flex justify-end pb-1">
        <div className="bg-secondary text-secondary-foreground max-w-[560px] cursor-text rounded-lg px-3 py-1.5 text-sm whitespace-pre-wrap select-text">
          {content}
        </div>
      </div>
      {isTurnEnd && <TurnActions align="end" text={content} />}
    </div>
  );
}
