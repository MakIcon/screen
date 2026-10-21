type Rect = { left: number; top: number; width: number; height: number };

export type PaletteContextLayout = {
  viewport: { width: number; height: number };
  panel: Rect;
  spotlight: Rect | null;
  connector: string | null;
  clipPath: string | undefined;
  connection: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    edge: "left" | "top";
  } | null;
};

export function getPaletteContextLayout(
  anchor: Rect | null,
  width: number,
  height: number,
): PaletteContextLayout {
  const margin = 20;
  const fallbackWidth = Math.min(640, Math.max(0, width - margin * 2));
  const fallbackHeight = Math.min(560, Math.max(0, height - margin * 2));
  const fallback: PaletteContextLayout = {
    viewport: { width, height },
    panel: {
      left: (width - fallbackWidth) / 2,
      top: (height - fallbackHeight) / 2,
      width: fallbackWidth,
      height: fallbackHeight,
    },
    spotlight: null,
    connector: null,
    clipPath: undefined,
    connection: null,
  };
  if (
    !anchor ||
    anchor.width <= 0 ||
    anchor.height <= 0 ||
    anchor.left < 0 ||
    anchor.top < 0 ||
    anchor.left + anchor.width > width ||
    anchor.top + anchor.height > height
  )
    return fallback;

  const left = Math.max(4, anchor.left - 8);
  const top = Math.max(4, anchor.top - 8);
  const right = Math.min(width - 4, anchor.left + anchor.width + 8);
  const bottom = Math.min(height - 4, anchor.top + anchor.height + 8);
  const spotlight = { left, top, width: right - left, height: bottom - top };
  const availableWidth = width - right - 32 - margin;
  let panel: Rect;
  let connector: string;
  let connection: NonNullable<PaletteContextLayout["connection"]>;
  if (availableWidth >= 300 && height - top - margin >= 180) {
    const panelWidth = Math.min(640, availableWidth);
    const panelLeft = Math.max(right + 32, (width - panelWidth) / 2);
    panel = {
      left: panelLeft,
      top,
      width: panelWidth,
      height: Math.min(560, height - top - margin),
    };
    const sourceY = top + spotlight.height / 2;
    const targetY = Math.min(top + panel.height - 16, Math.max(top + 16, sourceY));
    connector =
      sourceY === targetY
        ? `M ${right} ${sourceY} H ${panelLeft}`
        : `M ${right} ${sourceY} H ${panelLeft - 16} V ${targetY} H ${panelLeft}`;
    connection = {
      start: { x: right, y: sourceY },
      end: { x: panelLeft, y: targetY },
      edge: "left",
    };
  } else if (height - bottom - 24 - margin >= 180) {
    panel = {
      left: margin,
      top: bottom + 24,
      width: fallbackWidth,
      height: Math.min(560, height - bottom - 24 - margin),
    };
    connector = `M ${left + spotlight.width / 2} ${bottom} V ${bottom + 12} H ${panel.left + 40} V ${panel.top}`;
    connection = {
      start: { x: left + spotlight.width / 2, y: bottom },
      end: { x: panel.left + 40, y: panel.top },
      edge: "top",
    };
  } else return fallback;

  // The scrim's background AND backdrop blur are clipped away from the real sidebar div.
  const clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px, 0 0)`;
  return { viewport: { width, height }, panel, spotlight, connector, clipPath, connection };
}
