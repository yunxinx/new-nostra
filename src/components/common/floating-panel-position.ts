export interface PanelPosition {
  left: number;
  top: number;
}

export interface PanelViewport extends PanelPosition, PanelSize {}

interface PanelSize {
  height: number;
  width: number;
}

export const PANEL_EDGE_INSET = 8;
const ANCHOR_GAP = 8;

export function constrainPanelPosition(
  position: PanelPosition,
  size: PanelSize,
  viewport: PanelViewport,
): PanelPosition {
  const minLeft = viewport.left + PANEL_EDGE_INSET;
  const minTop = viewport.top + PANEL_EDGE_INSET;
  return {
    left: Math.max(
      minLeft,
      Math.min(
        position.left,
        viewport.left + viewport.width - size.width - PANEL_EDGE_INSET,
      ),
    ),
    top: Math.max(
      minTop,
      Math.min(
        position.top,
        viewport.top + viewport.height - size.height - PANEL_EDGE_INSET,
      ),
    ),
  };
}

export function positionPanelAtAnchor(
  anchor: PanelViewport,
  size: PanelSize,
  viewport: PanelViewport,
): PanelPosition {
  const leftSpace = anchor.left - viewport.left - PANEL_EDGE_INSET - ANCHOR_GAP;
  const rightSpace =
    viewport.left +
    viewport.width -
    PANEL_EDGE_INSET -
    (anchor.left + anchor.width + ANCHOR_GAP);
  const canOpenRight = rightSpace >= size.width;
  const canOpenLeft = leftSpace >= size.width;
  const shouldOpenRight =
    canOpenRight || (!canOpenLeft && rightSpace >= leftSpace);

  return constrainPanelPosition(
    {
      left: shouldOpenRight
        ? anchor.left + anchor.width + ANCHOR_GAP
        : anchor.left - size.width - ANCHOR_GAP,
      top: anchor.top,
    },
    size,
    viewport,
  );
}
