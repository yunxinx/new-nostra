import { describe, expect, it } from "vitest";

import {
  constrainPanelPosition,
  positionPanelAtAnchor,
} from "./floating-panel-position";

const VIEWPORT = { height: 720, left: 0, top: 0, width: 1000 };
const PANEL = { height: 320, width: 400 };

describe("floating panel placement", () => {
  it("opens beside a left trigger without covering it", () => {
    expect(
      positionPanelAtAnchor(
        { height: 24, left: 24, top: 80, width: 24 },
        PANEL,
        VIEWPORT,
      ),
    ).toEqual({ left: 56, top: 80 });
  });

  it("flips to the left of a trigger at the right edge", () => {
    expect(
      positionPanelAtAnchor(
        { height: 24, left: 960, top: 80, width: 24 },
        PANEL,
        VIEWPORT,
      ),
    ).toEqual({ left: 552, top: 80 });
  });

  it("keeps the whole panel inside the viewport near the bottom corner", () => {
    expect(
      positionPanelAtAnchor(
        { height: 24, left: 960, top: 680, width: 24 },
        PANEL,
        VIEWPORT,
      ),
    ).toEqual({ left: 552, top: 392 });
  });

  it("uses the visible viewport origin when zooming reduces the available area", () => {
    const viewport = { height: 500, left: 100, top: 60, width: 700 };
    expect(
      constrainPanelPosition({ left: -50, top: 900 }, PANEL, viewport),
    ).toEqual({ left: 108, top: 232 });
  });

  it("preserves an existing position while content grows within the viewport", () => {
    const position = { left: 80, top: 70 };
    expect(
      constrainPanelPosition(position, { height: 550, width: 400 }, VIEWPORT),
    ).toEqual(position);
  });

  it("clamps dragging and size changes to the nearest available edge", () => {
    expect(
      constrainPanelPosition({ left: 950, top: -30 }, PANEL, VIEWPORT),
    ).toEqual({ left: 592, top: 8 });
    expect(
      constrainPanelPosition(
        { left: 500, top: 350 },
        { height: 620, width: 600 },
        VIEWPORT,
      ),
    ).toEqual({ left: 392, top: 92 });
  });
});
