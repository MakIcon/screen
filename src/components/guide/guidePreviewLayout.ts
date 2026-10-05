export function guidePreviewLayout({
  contentWidth,
  availableHeight,
  previewWidth,
  previewHeight,
  zoom,
}: {
  contentWidth: number;
  availableHeight: number;
  previewWidth: number;
  previewHeight: number;
  zoom: number;
}) {
  const cell = 16;
  const gridWidth = Math.max(cell * 3, Math.floor((contentWidth - 2) / cell) * cell);
  const maxGridHeight = Math.max(cell * 3, Math.floor((availableHeight - 2) / cell) * cell);
  const scale = Math.min(
    zoom,
    (gridWidth - 18) / Math.max(1, previewWidth),
    (maxGridHeight - 18) / Math.max(1, previewHeight),
  );
  const gridHeight = Math.ceil((previewHeight * scale + 18 - 0.000001) / cell) * cell;
  return { scale, gridWidth, gridHeight, cell };
}

export interface GuideSceneMeasurement {
  stepId: string;
  viewportHeight: number;
}

export function guideMaximumSceneHeight(heights: number[]) {
  return Math.ceil(Math.max(1, ...heights));
}

/** Reserve the largest state before playback; visible state changes never resize the viewport. */
export function measureGuideScene(
  previous: GuideSceneMeasurement | null,
  stepId: string,
  maximumHeight: number,
): GuideSceneMeasurement {
  return previous?.stepId === stepId && previous.viewportHeight === maximumHeight
    ? previous
    : { stepId, viewportHeight: maximumHeight };
}
