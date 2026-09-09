import { ArrowDown } from "lucide-react";
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import type { MessageRole } from "@/types/ipc";

import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/ui-store";

import type { ChatMessage } from "../types";

import { type ActivePathResult, useActivePath } from "../hooks/use-active-path";
import { AssistantMessage } from "./AssistantMessage";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import { UserBubble } from "./UserBubble";

// Within 48px of the bottom the list keeps following new content; further
// away it holds position and offers the jump button instead.
const BOTTOM_FOLLOW_THRESHOLD_PX = 48;
// Fallback before the ResizeObserver reports the real composer height.
const COMPOSER_HEIGHT_FALLBACK_PX = 120;
// The read-error banner sits above the jump button so both stay visible.
const ERROR_BANNER_OFFSET_PX = 48;

// Draft panes render no query: an empty message list with a live composer.
const DRAFT_PATH: ActivePathResult = {
  error: null,
  hasNewerPages: false,
  hasOlderPages: false,
  isLoading: false,
  loadNewer: () => undefined,
  loadOlder: () => undefined,
  messages: [],
  resetToTail: () => Promise.resolve(),
  retryRead: () => undefined,
};

interface AnchorSnapshot {
  entryId: string;
  viewportOffset: number;
}

interface ChatPaneProps extends MessageListProps {
  path: ActivePathResult;
}

interface MessageListProps {
  // Draft location owning the composer text: the session id, or
  // `draft:<draftId>` while the conversation is still unsent.
  composerKey: string;
  onSend: (text: string) => void;
  sessionId: null | string;
}

interface MessageRowProps {
  message: ChatMessage;
  nextRole: MessageRole | undefined;
}

export function MessageList({
  composerKey,
  onSend,
  sessionId,
}: MessageListProps) {
  return sessionId === null ? (
    <ChatPane
      composerKey={composerKey}
      onSend={onSend}
      path={DRAFT_PATH}
      sessionId={null}
    />
  ) : (
    <SessionChatPane
      composerKey={composerKey}
      onSend={onSend}
      sessionId={sessionId}
    />
  );
}

/** Records the topmost visible entry plus its offset inside the viewport. */
function captureAnchor(
  container: HTMLElement,
  anchorRef: RefObject<AnchorSnapshot | null>,
): void {
  const containerTop = container.getBoundingClientRect().top;
  for (const element of container.querySelectorAll<HTMLElement>(
    "[data-entry-id]",
  )) {
    if (element.getBoundingClientRect().bottom > containerTop) {
      anchorRef.current = {
        entryId: element.dataset.entryId ?? "",
        viewportOffset: element.getBoundingClientRect().top - containerTop,
      };
      return;
    }
  }
}

function ChatPane({ composerKey, onSend, path, sessionId }: ChatPaneProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  // Follow/anchor state lives in refs so scroll handlers and observers read
  // the current value without re-subscribing; the state only feeds the jump
  // button's visibility.
  const isNearBottomRef = useRef(true);
  const anchorRef = useRef<AnchorSnapshot | null>(null);
  const [composerHeight, setComposerHeight] = useState(
    COMPOSER_HEIGHT_FALLBACK_PX,
  );
  const [isNearBottom, setIsNearBottom] = useState(true);

  const messages = path.messages;
  const hasContent = messages.length > 0;
  // Content-change token: the count alone misses a full-page swap at the
  // newest end (eviction plus addition keeps the count), so the newest entry
  // id joins it.
  const contentToken = `${String(messages.length)}:${String(
    messages.at(-1)?.id ?? null,
  )}`;

  const draftText = useUiStore((s) => s.drafts.get(composerKey)) ?? "";
  const submitError = useUiStore((s) => s.draftErrors.get(composerKey) ?? null);
  const isSubmitPending = useUiStore((s) => s.pendingSubmits.has(composerKey));
  const isDeletePending = useUiStore(
    (s) => sessionId !== null && s.pendingDeletes.has(sessionId),
  );
  const setDraft = useUiStore((s) => s.setDraft);

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

  // One observer on the whole message column: delayed markdown sizing and
  // reflow land here without per-entry observers. Re-attached when content
  // appears or disappears because the column itself is conditional.
  useEffect(() => {
    const content = contentRef.current;
    const container = scrollRef.current;
    if (!content || !container) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (isNearBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      } else {
        compensateAroundAnchor(container, anchorRef);
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [hasContent]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    if (isNearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    compensateAroundAnchor(container, anchorRef);
    // The token, not the message count, drives re-runs: a full-page swap at
    // the newest end leaves the length unchanged while content moves.
  }, [contentToken, composerHeight]);

  function handleScroll(): void {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < BOTTOM_FOLLOW_THRESHOLD_PX;
    if (nearBottom !== isNearBottomRef.current) {
      isNearBottomRef.current = nearBottom;
      setIsNearBottom(nearBottom);
    }
    if (nearBottom) {
      // Follow mode needs no anchor.
      anchorRef.current = null;
    } else {
      captureAnchor(container, anchorRef);
    }
    // Prefetch at least one viewport ahead of the approaching edge; a full
    // viewport of headroom doubles as hysteresis against threshold jitter.
    if (container.scrollTop < container.clientHeight) {
      path.loadOlder();
    }
    if (distanceFromBottom < container.clientHeight) {
      path.loadNewer();
    }
  }

  function handleComposerSend(text: string): void {
    // A send pins the view to the bottom so the persisted message lands in
    // view once the window updates.
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    onSend(text);
  }

  function handleJumpToLatest(): void {
    const container = scrollRef.current;
    if (path.hasNewerPages) {
      // The DOM bottom is not the latest message while the tail page is
      // evicted; the window must be reset to a fresh tail read.
      void path.resetToTail();
    }
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  const isJumpVisible = path.hasNewerPages || (hasContent && !isNearBottom);

  return (
    <div className="relative h-full min-h-0">
      <div
        className="h-full overflow-y-auto"
        onScroll={handleScroll}
        ref={scrollRef}
      >
        {path.isLoading ? null : hasContent ? (
          <div
            className="mx-auto w-full max-w-[760px] px-6 pt-1"
            ref={contentRef}
            style={{ paddingBottom: composerHeight + 12 }}
          >
            {messages.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                nextRole={messages[index + 1]?.role}
              />
            ))}
          </div>
        ) : path.error !== null ? null : (
          // A failed read must not read as an empty conversation; the error
          // banner below carries the retry.
          <div className="flex h-full items-center justify-center">
            <EmptyState />
          </div>
        )}
      </div>
      {path.error !== null && (
        <div
          className="bg-background border-border text-muted-foreground absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border px-3 py-1.5 shadow-md"
          style={{ bottom: composerHeight + ERROR_BANNER_OFFSET_PX }}
        >
          <p className="text-destructive text-xs">
            {t(`errors.${path.error.code}`)}
          </p>
          <Button onClick={() => path.retryRead()} size="xs" variant="ghost">
            {t("common.retry")}
          </Button>
        </div>
      )}
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
          <Composer
            disabled={isSubmitPending || isDeletePending}
            error={submitError}
            onSend={handleComposerSend}
            onTextChange={(text) => setDraft(composerKey, text)}
            value={draftText}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Compensates the anchor entry's remaining viewport displacement after a
 * content mutation. Measuring the anchor's actual offset stays correct when
 * one end prepends while the other end evicts: a whole-content scrollHeight
 * delta would misattribute both shifts to one end. Where the browser's own
 * scroll anchoring already compensated, the delta is zero and this is a
 * no-op, so the two mechanisms never double-adjust.
 */
function compensateAroundAnchor(
  container: HTMLElement,
  anchorRef: RefObject<AnchorSnapshot | null>,
): void {
  const anchor = anchorRef.current;
  if (!anchor) {
    return;
  }
  const element = findEntryElement(container, anchor.entryId);
  if (!element) {
    // The anchor itself left the window; hold the current position.
    return;
  }
  const containerTop = container.getBoundingClientRect().top;
  const offsetAfter = element.getBoundingClientRect().top - containerTop;
  const delta = offsetAfter - anchor.viewportOffset;
  if (delta === 0) {
    return;
  }
  container.scrollTop += delta;
  anchor.viewportOffset = offsetAfter;
}

function findEntryElement(
  container: HTMLElement,
  entryId: string,
): HTMLElement | null {
  for (const element of container.querySelectorAll<HTMLElement>(
    "[data-entry-id]",
  )) {
    if (element.dataset.entryId === entryId) {
      return element;
    }
  }
  return null;
}

// Turn rhythm: every message body carries pb-1; the last message of a turn
// additionally renders the action row (mt-1 + pb-5, see TurnActions).
// Adjacent messages share a turn only when their roles match; a role change
// opens a new turn. The list's own pt-1 supplies the top gap above the
// first message. The row wrapper carries the entry id for scroll anchoring.
function MessageRow({ message, nextRole }: MessageRowProps) {
  const isTurnEnd = nextRole === undefined || nextRole !== message.role;

  return (
    <div data-entry-id={message.id}>
      {message.role === "user" ? (
        <UserBubble isTurnEnd={isTurnEnd} parts={message.parts} />
      ) : (
        <AssistantMessage isTurnEnd={isTurnEnd} parts={message.parts} />
      )}
    </div>
  );
}

function SessionChatPane(props: MessageListProps & { sessionId: string }) {
  const path = useActivePath(props.sessionId);
  return <ChatPane {...props} path={path} />;
}
