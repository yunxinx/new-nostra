import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import type { ChatMessage } from "../types";

import { AssistantMessage } from "./AssistantMessage";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import { UserBubble } from "./UserBubble";

// Within 48px of the bottom the list keeps following new content; further
// away it holds position and offers the jump button instead.
const BOTTOM_FOLLOW_THRESHOLD_PX = 48;
// Fallback before the ResizeObserver reports the real composer height.
const COMPOSER_HEIGHT_FALLBACK_PX = 120;

interface MessageListProps {
  // With no messages to render, the empty state distinguishes an empty
  // sidebar (no sessions) from a new-chat draft.
  hasSessions: boolean;
  messages: ChatMessage[];
}

interface MessageRowProps {
  message: ChatMessage;
  nextRole: "assistant" | "user" | undefined;
}

export function MessageList({ hasSessions, messages }: MessageListProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  // Sent messages are display-only: they never enter the store or any
  // persistence; remounting the list (session switch) discards them.
  const [sentMessages, setSentMessages] = useState<ChatMessage[]>([]);
  const [composerHeight, setComposerHeight] = useState(
    COMPOSER_HEIGHT_FALLBACK_PX,
  );
  const [isNearBottom, setIsNearBottom] = useState(true);

  const allMessages = [...messages, ...sentMessages];

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setComposerHeight(composer.offsetHeight);
    });
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (isNearBottom && scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [allMessages.length, isNearBottom]);

  function handleScroll(): void {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) {
      return;
    }
    const distanceFromBottom =
      scrollContainer.scrollHeight -
      scrollContainer.scrollTop -
      scrollContainer.clientHeight;
    setIsNearBottom(distanceFromBottom < BOTTOM_FOLLOW_THRESHOLD_PX);
  }

  function handleSend(text: string): void {
    setSentMessages((prev) => [
      ...prev,
      { content: text, id: crypto.randomUUID(), role: "user" },
    ]);
  }

  function handleJumpToLatest(): void {
    const scrollContainer = scrollRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  const isJumpVisible = allMessages.length > 0 && !isNearBottom;

  return (
    <div className="relative h-full min-h-0">
      <div
        className="h-full overflow-y-auto"
        onScroll={handleScroll}
        ref={scrollRef}
      >
        {allMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState variant={hasSessions ? "newChat" : "noSessions"} />
          </div>
        ) : (
          <div
            className="mx-auto w-full max-w-[760px] px-6 pt-1"
            style={{ paddingBottom: composerHeight + 12 }}
          >
            {allMessages.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                nextRole={allMessages[index + 1]?.role}
              />
            ))}
          </div>
        )}
      </div>
      {isJumpVisible && (
        <Button
          className="absolute left-1/2 -translate-x-1/2"
          onClick={handleJumpToLatest}
          size="sm"
          style={{ bottom: composerHeight + 12 }}
          variant="outline"
        >
          <ArrowDown />
          {t("chat.jumpToLatest")}
        </Button>
      )}
      <div
        className="absolute inset-x-0 bottom-0 px-6 pt-2 pb-3"
        ref={composerRef}
      >
        <div className="mx-auto w-full max-w-[760px]">
          <Composer onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}

// Turn rhythm: every message body carries pb-1; the last message of a turn
// additionally renders the action row (mt-1 + pb-5, see TurnActions).
// Adjacent messages share a turn only when their roles match; a role change
// opens a new turn. The list's own pt-1 supplies the top gap above the
// first message.
function MessageRow({ message, nextRole }: MessageRowProps) {
  const isTurnEnd = nextRole === undefined || nextRole !== message.role;

  return message.role === "user" ? (
    <UserBubble content={message.content} isTurnEnd={isTurnEnd} />
  ) : (
    <AssistantMessage content={message.content} isTurnEnd={isTurnEnd} />
  );
}
