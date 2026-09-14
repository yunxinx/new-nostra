import type { ReactNode } from "react";

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

function openPanel({
  dismissOnOutsidePress = false,
  headerAccessory,
}: {
  dismissOnOutsidePress?: boolean;
  headerAccessory?: ReactNode;
} = {}) {
  const view = render(
    <StrictMode>
      <TooltipProvider delayDuration={10000}>
        <PanelHarness
          dismissOnOutsidePress={dismissOnOutsidePress}
          headerAccessory={headerAccessory}
        />
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

function PanelHarness({
  dismissOnOutsidePress,
  headerAccessory,
}: {
  dismissOnOutsidePress: boolean;
  headerAccessory?: ReactNode;
}) {
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
          dismissOnOutsidePress={dismissOnOutsidePress}
          headerAccessory={headerAccessory}
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

  it("dismisses a card on the click that ends an outside press, never on its own anchor", async () => {
    const { dialog, trigger } = openPanel({ dismissOnOutsidePress: true });

    // The anchor is the control the panel stands for: a press on it asks for
    // the panel again, and switching it off is the host's own doing.
    fireEvent.pointerDown(trigger, { button: 0, pointerId: 4 });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBe(dialog);

    const background = screen.getByRole("button", { name: "Background 0" });
    fireEvent.pointerDown(background, { button: 0, pointerId: 5 });
    // The press alone is not the dismissal: the click that ends it is, and
    // that click is over before the panel goes.
    expect(screen.getByRole("dialog")).toBe(dialog);
    fireEvent.click(background);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the panel up until the click it is dismissed by is over", async () => {
    const { dialog } = openPanel({ dismissOnOutsidePress: true });
    const background = screen.getByRole("button", { name: "Background 0" });
    fireEvent.pointerDown(background, { button: 0, pointerId: 5 });
    fireEvent.click(background);

    // The dispatch is over and the panel is still standing: what the close
    // waits for is the control the click landed on, which reads it in the
    // same dispatch and may ask the host for something first.
    expect(screen.getByRole("dialog")).toBe(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps a panel up for a click nobody pressed for", () => {
    const { dialog } = openPanel({ dismissOnOutsidePress: true });
    const background = screen.getByRole("button", { name: "Background 0" });

    // A click with no press behind it is nobody's turn away: this one a
    // keyboard activation made — a non-modal panel never took the keyboard
    // away — and only a press arms the dismissal.
    fireEvent.keyDown(background, { key: "Enter" });
    fireEvent.click(background, { detail: 0 });
    expect(screen.getByRole("dialog")).toBe(dialog);

    // A keystroke between a press and the click it would end in makes that
    // click the keyboard's rather than the press's.
    fireEvent.pointerDown(background, { button: 0, pointerId: 6 });
    fireEvent.keyDown(background, { key: "Tab" });
    fireEvent.click(background, { detail: 0 });
    expect(screen.getByRole("dialog")).toBe(dialog);
  });

  it("keeps a panel up when the press that may have ended it began inside", () => {
    const { dialog } = openPanel({ dismissOnOutsidePress: true });
    const background = screen.getByRole("button", { name: "Background 0" });

    // A press begun inside the panel and released outside it hands the browser
    // a click on the ancestor the two share — a mark of the drag, not a turn to
    // the control the drag ended on.
    fireEvent.pointerDown(screen.getByRole("textbox", { name: "Draft" }), {
      button: 0,
      pointerId: 7,
    });
    fireEvent.click(background);
    expect(screen.getByRole("dialog")).toBe(dialog);
  });

  it("forgets an outside press that no click ever ended", () => {
    const { dialog } = openPanel({ dismissOnOutsidePress: true });
    const background = screen.getByRole("button", { name: "Background 0" });

    // A press released outside the window ends in no click at all, so the
    // press that decides the next click is the one that followed it — inside
    // the panel.
    fireEvent.pointerDown(background, { button: 0, pointerId: 8 });
    fireEvent.pointerDown(screen.getByRole("textbox", { name: "Draft" }), {
      button: 0,
      pointerId: 8,
    });
    fireEvent.click(background);
    expect(screen.getByRole("dialog")).toBe(dialog);
  });

  it("drags from the header, constrains every edge, and stops on pointer release", () => {
    const { dialog } = openPanel();
    const move = screen.getByRole("group", { name: "Move Details" });
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
    const move = screen.getByRole("group", { name: "Move Details" });
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
    const move = screen.getByRole("group", { name: "Move Details" });
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

  it("leaves a control on the heading line its own press and its own keys", () => {
    const onSection = vi.fn();
    const { dialog } = openPanel({
      headerAccessory: (
        <button onClick={onSection} type="button">
          Section
        </button>
      ),
    });
    const section = screen.getByRole("button", { name: "Section" });

    // The capture a drag takes would swallow the press the control needs, so
    // the bar leaves the pointer to it.
    fireEvent.pointerDown(section, { button: 0, pointerId: 5 });
    expect(setPointerCapture).not.toHaveBeenCalled();
    fireEvent.pointerMove(screen.getByRole("group", { name: "Move Details" }), {
      clientX: 100,
      clientY: 100,
      pointerId: 5,
    });
    expect(dialog.style.left).toBe("572px");

    // The arrows are the control's too: on the bar they move the panel, but
    // this keystroke is the control's own navigation.
    fireEvent.keyDown(section, { key: "ArrowRight" });
    expect(dialog.style.left).toBe("572px");

    fireEvent.click(section);
    expect(onSection).toHaveBeenCalledTimes(1);

    // The bar itself is still the handle: a press on the title moves the panel.
    fireEvent.pointerDown(screen.getByText("Details"), {
      button: 0,
      pointerId: 6,
    });
    expect(setPointerCapture).toHaveBeenCalledWith(6);
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
    const move = screen.getByRole("group", { name: "Move Details" });
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
    const move = screen.getByRole("group", { name: "Move Details" });
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

  it("leaves focus where the pointer left it when the panel closes by click", async () => {
    const { trigger } = openPanel();
    const close = screen.getByRole("button", { name: "Close" });
    fireEvent.pointerDown(close, { button: 0, pointerId: 2 });
    fireEvent.click(close);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The pointer sits on the trigger's neighbour, so a focus return would
    // only open that control's tooltip; the keyboard path keeps it.
    expect(document.activeElement).not.toBe(trigger);
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
