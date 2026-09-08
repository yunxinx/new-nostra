import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";

import { MessageList } from "./MessageList";

class TestResizeObserver implements ResizeObserver {
  static instances: TestResizeObserver[] = [];

  readonly callback: ResizeObserverCallback;
  target: Element | null = null;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    TestResizeObserver.instances.push(this);
  }

  disconnect(): void {
    this.target = null;
  }

  observe(target: Element): void {
    this.target = target;
  }

  resize(height: number): void {
    if (!this.target) {
      throw new Error("ResizeObserver has no target");
    }
    Object.defineProperty(this.target, "offsetHeight", {
      configurable: true,
      value: height,
    });
    this.callback([], this);
  }

  unobserve(): void {
    this.target = null;
  }
}

beforeAll(initI18n);
beforeEach(() => {
  TestResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MessageList composer resize", () => {
  it.each([false, true])(
    "preserves scroll intent with readingHistory=%s",
    (isReadingHistory) => {
      const { unmount } = render(
        <TooltipProvider>
          <MessageList
            hasSessions
            messages={[
              { content: "Previous message", id: "message-1", role: "user" },
            ]}
          />
        </TooltipProvider>,
        { reactStrictMode: true },
      );
      const scroll = screen
        .getByText("Previous message")
        .closest(".overflow-y-auto");
      const input = screen.getByRole("textbox");
      const observer = TestResizeObserver.instances.find((instance) =>
        instance.target?.contains(input),
      );
      if (!(scroll instanceof HTMLElement) || !observer) {
        throw new Error(
          "Message list scroll region or composer observer missing",
        );
      }

      let contentHeight = 1200;
      let offset = 600;
      Object.defineProperties(scroll, {
        clientHeight: { configurable: true, value: 600 },
        scrollHeight: { configurable: true, get: () => contentHeight },
        scrollTop: {
          configurable: true,
          get: () => offset,
          set: (value: number) => {
            offset = Math.max(0, Math.min(value, contentHeight - 600));
          },
        },
      });
      act(() => observer.resize(92));
      scroll.scrollTop = isReadingHistory ? 120 : 600;
      fireEvent.scroll(scroll);

      contentHeight += 128;
      act(() => observer.resize(220));

      if (isReadingHistory) {
        expect(scroll.scrollTop).toBe(120);
      } else {
        expect(
          scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight,
        ).toBe(0);
      }
      unmount();
      expect(
        TestResizeObserver.instances.every(
          (instance) => instance.target === null,
        ),
      ).toBe(true);
    },
  );
});
