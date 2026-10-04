import {
  BUILD_CARD_MAX_ELEMENT_SCALE,
  BUILD_CARD_MIN_ELEMENT_SCALE,
} from "./BuildCardSettingsPopup";

type ResizeGeometry = {
  width: number;
  height: number;
  scale: number;
  availableWidth: number;
  availableHeight: number;
};

export function getBuildCardResizeLimit(geometry: ResizeGeometry): number {
  return Math.max(
    BUILD_CARD_MIN_ELEMENT_SCALE,
    Math.min(
      BUILD_CARD_MAX_ELEMENT_SCALE,
      (geometry.availableWidth * geometry.scale) / Math.max(1, geometry.width),
      (geometry.availableHeight * geometry.scale) / Math.max(1, geometry.height),
    ),
  );
}

export function getBuildCardResizedScale(
  startScale: number,
  width: number,
  height: number,
  dx: number,
  dy: number,
  maxScale: number,
): number {
  const baseWidth = width / startScale;
  const baseHeight = height / startScale;
  const scale =
    startScale + (dx * baseWidth + dy * baseHeight) / (baseWidth ** 2 + baseHeight ** 2);
  return Math.max(
    BUILD_CARD_MIN_ELEMENT_SCALE,
    Math.min(Math.floor(maxScale * 100) / 100, Math.round(scale * 100) / 100),
  );
}
