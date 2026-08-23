import type { TabKey } from "../types";
import type {
  CloseAnimationId,
  OpenAnimationId,
  TabAnimationId,
  UiMotionStyle,
} from "./animations";

export type Theme = "light" | "dark" | "void";
export type AppearanceBackgroundKind = "solid" | "image" | "drawing";

export type AppearanceElementPathSegment = {
  tag: string;
  index: number;
  marker?: string;
};

export type AppearanceElementTextTarget = {
  /** Child-node indexes from the picked element to its primary visible text node. */
  path: number[];
  original: string;
};

export type AppearanceElementTarget = {
  id: string;
  label: string;
  path: AppearanceElementPathSegment[];
  tab?: TabKey;
  textTarget?: AppearanceElementTextTarget;
};

export type AppearanceElementShadow = "none" | "soft" | "strong" | "glow";
export type AppearanceElementTextAlign = "left" | "center" | "right";

export type AppearanceElementOverride = AppearanceElementTarget & {
  /** An empty string is a valid override and intentionally hides the original text. */
  text?: string;
  style: {
    opacity?: number;
    radius?: number;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    letterSpacing?: number;
    lineHeight?: number;
    textAlign?: AppearanceElementTextAlign;
    backgroundColor?: string;
    textColor?: string;
    paddingX?: number;
    paddingY?: number;
    borderWidth?: number;
    borderColor?: string;
    shadow?: AppearanceElementShadow;
    scale?: number;
    rotate?: number;
  };
};

export type AppearanceProfile = {
  version: 1;
  customized: boolean;
  baseTheme: Theme;
  colors: {
    background: string;
    surface: string;
    text: string;
    accent: string;
  };
  background: {
    kind: AppearanceBackgroundKind;
    imageDataUrl: string;
    imageName: string;
    drawingDataUrl: string;
    dim: number;
    blur: number;
  };
  shape: {
    radius: number;
  };
  typography: {
    uiFont: string;
    displayFont: string;
  };
  opacity: {
    window: number;
    panels: number;
    controls: number;
  };
  elementOverrides: AppearanceElementOverride[];
  motion: {
    enabled: boolean;
    uiStyle: UiMotionStyle;
    opening: OpenAnimationId;
    tabMode: "global" | "per-tab";
    tabDefault: TabAnimationId;
    tabByTarget: Record<TabKey, TabAnimationId>;
    closeButton: CloseAnimationId;
    closeSystem: CloseAnimationId;
  };
};
