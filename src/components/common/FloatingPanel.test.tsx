import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode, useState } from "react";
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

import { FloatingPanel } from "./FloatingPanel";

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
  }
}

class TestResizeObserver implements ResizeObserver {
  static instances: TestResizeObserver[] = [];
  readonly callback: ResizeObserverCallback;
  readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    TestResizeObserver.instances.push(this);
  }

  disconnect(): void {
    this.targets.clear();
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  resize(): void {
    this.callback([], this);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }
}

let panelHeight = 200;
let panelWidth = 320;
const setPointerCapture = vi.fn();
const releasePointerCapture = vi.fn();

beforeAll(() => {
  initI18n();
  Element.prototype.setPointerCapture = setPointerCapture;
  Element.prototype.releasePointerCapture = releasePointerCapture;
  Element.prototype.hasPointerCapture = () => true;
});

beforeEach(() => {
  panelHeight = 200;
  panelWidth = 320;
  TestResizeObserver.instances = [];
  setPointerCapture.mockClear();
  releasePointerCapture.mockClear();
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("innerHeight", 900);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute("data-panel-anchor")) {
        return new DOMRect(900, 100, 24, 24);
      }
      if (this.getAttribute("role") !== "dialog") return new DOMRect();
      return new DOMRect(
        Number.parseFloat(this.style.left),
        Number.parseFloat(this.style.top),
        Math.min(panelWidth, Number.parseFloat(this.style.maxWidth)),
        Math.min(panelHeight, Number.parseFloat(this.style.maxHeight)),
      );
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function openPanel() {
  const view = render(
    <StrictMode>
      <TooltipProvider delayDuration={10000}>
        <PanelHarness />
      </TooltipProvider>
    </StrictMode>,
  );
  const trigger = screen.getByRole("button", { name: "Open" });
  fireEvent.click(trigger);
  return {
    ...view,
    dialog: screen.getByRole("dialog", { name: "Details" }),
    trigger,
  };
}

function PanelHarness() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState(0);
  return (
    <>
      <button
        data-panel-anchor=""
        onClick={(event) => setAnchor(event.currentTarget)}
        type="button"
      >
        Open
      </button>
      <button onClick={() => setCount(count + 1)} type="button">
        Background {count}
      </button>
      {anchor !== null && (
        <FloatingPanel
          anchor={anchor}
          onClose={() => setAnchor(null)}
          title="Details"
        >
          <input aria-label="Draft" defaultValue="Text" />
        </FloatingPanel>
      )}
    </>
  );
}

function resizePanel(dialog: HTMLElement): void {
  const observer = TestResizeObserver.instances.find((entry) =>
    entry.targets.has(dialog),
  );
  if (observer === undefined) throw new Error("Panel observer is missing");
  act(() => observer.resize());
}

describe("floating panel interactions", () => {
  it("anchors the mounted panel and preserves the top while content grows", () => {
    const { dialog } = openPanel();
    expect(dialog.style.visibility).toBe("visible");
    expect(dialog.style.left).toBe("572px");
    expect(dialog.style.top).toBe("100px");
    expect(document.activeElement).toBe(dialog);

    panelHeight = 300;
    resizePanel(dialog);
    expect(dialog.style.top).toBe("100px");
    expect(dialog.style.left).toBe("572px");
  });

  it("allows background focus and actions without dismissing the panel", () => {
    const { dialog } = openPanel();
    const background = screen.getByRole("button", { name: "Background 0" });
    fireEvent.pointerDown(background);
    act(() => background.focus());
    fireEvent.click(background);
    expect(document.activeElement).toBe(background);
    expect(screen.getByRole("button", { name: "Background 1" })).toBe(
      background,
    );
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog.getAttribute("aria-modal")).not.toBe("true");
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("drags from the header, constrains every edge, and stops on pointer release", () => {
    const { dialog } = openPanel();
    const move = screen.getByRole("button", { name: "Move Details" });
    fireEvent.pointerDown(move, {
      button: 0,
      clientX: 600,
      clientY: 120,
      pointerId: 3,
    });
    expect(setPointerCapture).toHaveBeenCalledWith(3);
    fireEvent.pointerMove(move, { clientX: 100, clientY: 300, pointerId: 3 });
    expect(dialog.style.left).toBe("72px");
    expect(dialog.style.top).toBe("280px");
    fireEvent.pointerMove(move, { clientX: -100, clientY: -100, pointerId: 3 });
    expect(dialog.style.left).toBe("8px");
    expect(dialog.style.top).toBe("42px");
    fireEvent.pointerMove(move, { clientX: 1500, clientY: 1200, pointerId: 3 });
    expect(dialog.style.left).toBe("872px");
    expect(dialog.style.top).toBe("692px");
    fireEvent.pointerUp(move, { pointerId: 3 });
    expect(releasePointerCapture).toHaveBeenCalledWith(3);
    fireEvent.pointerMove(move, { clientX: 300, clientY: 300, pointerId: 3 });
    expect(dialog.style.left).toBe("872px");
  });

  it("stops a canceled drag and ignores a second pointer", () => {
    const { dialog } = openPanel();
    const move = screen.getByRole("button", { name: "Move Details" });
    fireEvent.pointerDown(move, {
      button: 0,
      clientX: 600,
      clientY: 120,
      pointerId: 3,
    });
    fireEvent.pointerMove(move, { clientX: 100, clientY: 100, pointerId: 4 });
    expect(dialog.style.left).toBe("572px");
    fireEvent.pointerCancel(move, { pointerId: 3 });
    fireEvent.pointerMove(move, { clientX: 100, clientY: 100, pointerId: 3 });
    expect(dialog.style.left).toBe("572px");
  });

  it("moves by keyboard while keeping close-button presses out of drag handling", () => {
    const { dialog } = openPanel();
    const move = screen.getByRole("button", { name: "Move Details" });
    fireEvent.keyDown(move, { key: "ArrowRight" });
    fireEvent.keyDown(move, { key: "ArrowDown", shiftKey: true });
    expect(dialog.style.left).toBe("580px");
    expect(dialog.style.top).toBe("132px");
    fireEvent.keyDown(move, { isComposing: true, key: "ArrowRight" });
    expect(dialog.style.left).toBe("580px");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Close" }), {
      button: 0,
      pointerId: 2,
    });
    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it("fits a smaller window after resize without returning to its trigger", () => {
    const { dialog } = openPanel();
    panelHeight = 300;
    vi.stubGlobal("innerWidth", 500);
    vi.stubGlobal("innerHeight", 260);
    fireEvent(window, new Event("resize"));
    expect(dialog.style.left).toBe("172px");
    expect(dialog.style.top).toBe("42px");
    expect(dialog.style.maxWidth).toBe("484px");
    expect(dialog.style.maxHeight).toBe("210px");
  });

  it("reserves the title bar for a tall card opened and dragged in the minimum settings window", () => {
    panelHeight = 800;
    panelWidth = 672;
    vi.stubGlobal("innerWidth", 860);
    vi.stubGlobal("innerHeight", 480);
    const { dialog } = openPanel();
    expect(dialog.style.top).toBe("42px");
    expect(dialog.style.maxHeight).toBe("430px");
    const move = screen.getByRole("button", { name: "Move Details" });
    fireEvent.pointerDown(move, {
      button: 0,
      clientX: 220,
      clientY: 60,
      pointerId: 3,
    });
    fireEvent.pointerMove(move, { clientX: -100, clientY: -100, pointerId: 3 });
    expect(dialog.style.left).toBe("8px");
    expect(dialog.style.top).toBe("42px");
    expect(dialog.getBoundingClientRect().bottom).toBe(472);
  });

  it("preserves title-bar clearance when a dragged card's window shrinks", () => {
    panelHeight = 800;
    panelWidth = 672;
    const { dialog } = openPanel();
    const move = screen.getByRole("button", { name: "Move Details" });
    fireEvent.pointerDown(move, {
      button: 0,
      clientX: 300,
      clientY: 100,
      pointerId: 3,
    });
    fireEvent.pointerMove(move, { clientX: -100, clientY: -100, pointerId: 3 });
    fireEvent.pointerUp(move, { pointerId: 3 });
    vi.stubGlobal("innerWidth", 860);
    vi.stubGlobal("innerHeight", 480);
    fireEvent(window, new Event("resize"));
    resizePanel(dialog);
    expect(dialog.style.left).toBe("8px");
    expect(dialog.style.top).toBe("42px");
    expect(dialog.style.maxHeight).toBe("430px");
    expect(dialog.getBoundingClientRect().bottom).toBe(472);
  });

  it("ignores IME Escape and restores its trigger after a real close", async () => {
    const { trigger } = openPanel();
    const input = screen.getByRole("textbox", { name: "Draft" });
    act(() => input.focus());
    fireEvent.keyDown(input, { isComposing: true, key: "Escape" });
    fireEvent.keyDown(input, { key: "Escape", keyCode: 229 });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("keeps background focus on close and releases all observers under StrictMode", async () => {
    const { unmount } = openPanel();
    const background = screen.getByRole("button", { name: "Background 0" });
    act(() => background.focus());
    fireEvent.keyDown(background, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(background);
    unmount();
    expect(TestResizeObserver.instances.length).toBeGreaterThan(0);
    expect(
      TestResizeObserver.instances.every(
        (observer) => observer.targets.size === 0,
      ),
    ).toBe(true);
  });
});
