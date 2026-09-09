import { Fragment } from "react";

import type { ContentBlock } from "@/types/ipc";

import { textOfParts } from "../types";
import { TurnActions } from "./TurnActions";

interface UserBubbleProps {
  isTurnEnd: boolean;
  parts: ContentBlock[];
}

export function UserBubble({ isTurnEnd, parts }: UserBubbleProps) {
  return (
    <div className="group/turn">
      {/* select-text/cursor-text whitelist the bubble under the body-wide
          no-selection backout; copying one's own message is a legitimate need
          and the I-beam is the correct cursor over selectable text. Part
          boundaries stay visible as paragraph gaps instead of merging the
          parts into one string. Direct field access keeps rendering
          exhaustive: a new ContentBlock variant fails compilation until the
          bubble handles it. */}
      <div className="bg-secondary text-secondary-foreground max-w-[560px] cursor-text rounded-lg px-3 py-1.5 text-sm whitespace-pre-wrap select-text">
        {parts.map((part, index) => (
          <Fragment key={index}>
            {index > 0 ? "\n\n" : null}
            {part.text}
          </Fragment>
        ))}
      </div>
      {isTurnEnd && <TurnActions align="end" text={textOfParts(parts)} />}
    </div>
  );
}
