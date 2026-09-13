import { useEffect, useState } from "react";

/**
 * How long the wheel has to keep pressing against an edge the scroller has
 * already reached before the wheel is handed to the pane around it. A trackpad
 * gesture runs for several hundred milliseconds, so anything shorter is spent
 * before the user notices the scroller has stopped — this is long enough to
 * read as a deliberate stop at the end of the table, short enough not to feel
 * stuck.
 */
const CHAIN_DELAY_MS = 500;

/** A scroll position this close to the far end counts as reached. */
const EDGE_SLACK_PX = 1;

/**
 * Hands a wheel that keeps pressing against the scroller's end on to the pane
 * around it. The scroller's `overscroll-behavior` stays `contain` until the
 * wheel has pressed for `CHAIN_DELAY_MS` and is `auto` from then on, so the
 * hand-off is the browser's own — momentum and all — rather than a scroll
 * position copied by hand here. Leaving the edge takes the hold off again.
 *
 * @returns A callback ref for the scrolling element. It is a ref rather than
 * an argument so a scroller that mounts later (the tab pane that is opened)
 * is still wired up.
 */
export function useScrollChaining(): (node: HTMLElement | null) => void {
  const [element, setElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (element === null) {
      return;
    }
    const scroller = element;
    let timer: null | ReturnType<typeof setTimeout> = null;

    function chain(): void {
      scroller.style.setProperty("overscroll-behavior", "auto");
    }

    function hold(): void {
      if (timer === null) {
        timer = setTimeout(chain, CHAIN_DELAY_MS);
      }
    }

    function release(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      scroller.style.removeProperty("overscroll-behavior");
    }

    function handleWheel(event: WheelEvent): void {
      // Nothing to scroll means no edge to press against: the wheel belonged
      // to the pane around this one from the start. The test is exact — a
      // scroller with any travel at all still gets its edge.
      if (scroller.scrollHeight <= scroller.clientHeight) {
        chain();
        return;
      }
      const pressing =
        (isAtStart(scroller) && event.deltaY < 0) ||
        (isAtEnd(scroller) && event.deltaY > 0);
      if (pressing) {
        hold();
        return;
      }
      release();
    }

    function handleScroll(): void {
      if (!isAtStart(scroller) && !isAtEnd(scroller)) {
        release();
      }
    }

    // A scroller with nothing to scroll has no edge to press against, so it
    // never holds the wheel — not even the first one, which would otherwise be
    // spent before the hand-over took effect.
    if (scroller.scrollHeight <= scroller.clientHeight) {
      chain();
    }

    scroller.addEventListener("wheel", handleWheel, { passive: true });
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      scroller.removeEventListener("wheel", handleWheel);
      scroller.removeEventListener("scroll", handleScroll);
      scroller.style.removeProperty("overscroll-behavior");
    };
  }, [element]);

  return setElement;
}

function isAtEnd(element: HTMLElement): boolean {
  return (
    element.scrollTop + element.clientHeight >=
    element.scrollHeight - EDGE_SLACK_PX
  );
}

function isAtStart(element: HTMLElement): boolean {
  return element.scrollTop <= 0;
}
