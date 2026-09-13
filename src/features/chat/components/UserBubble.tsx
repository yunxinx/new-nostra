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
      {/* Text selection overrides the body-wide opt-out. wrap-anywhere includes
          break opportunities in min-content sizing so the flex bubble can shrink. */}
      <div className="flex justify-end pb-1">
        <div className="bg-secondary text-secondary-foreground max-w-[560px] cursor-text rounded-lg px-3 py-1.5 text-sm wrap-anywhere whitespace-pre-wrap select-text">
          {parts.map((part, index) => (
            <Fragment key={index}>
              {index > 0 ? "\n\n" : null}
              {part.text}
            </Fragment>
          ))}
        </div>
      </div>
      {isTurnEnd && <TurnActions align="end" text={textOfParts(parts)} />}
    </div>
  );
}
