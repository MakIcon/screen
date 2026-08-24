import type { TabKey } from "../types";
import type {
  CloseAnimationId,
  OpenAnimationId,
  TabAnimationId,
  UiMotionStyle,
} from "./animations";

export type Theme = "light" | "dark" | "void";
export type AppearanceBackgroundKind = "solid" | "image" | "drawing";
export type AppearanceElementBackgroundKind = "solid" | "gradient";
export type AppearanceElementGradientType = "linear" | "radial" | "conic";
export type AppearanceElementGradientRadialShape = "circle" | "ellipse";

export type AppearanceElementGradientStop = {
  color: string;
  position: number;
};

export type AppearanceElementPathSegment = {
  tag: string;
  index: number;
  marker?: string;
};

export type AppearanceElementTextTarget = {
  /** Child-node indexes from the picked element to its primary visible text node. */
  path: number[];
  original: string;
  /** Original unresolved template when the rendered text uses launcher placeholders. */
  template?: string;
  /** Live values captured from the nearest placeholder context for the Studio preview. */
  placeholderValues?: Record<string, string>;
};

export type AppearanceElementDefaults = {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundBefore?: boolean;
  backgroundAfter?: boolean;
  beforeOpacity?: number;
  afterOpacity?: number;
  textColor?: string;
  widthAuto?: boolean;
  heightAuto?: boolean;
  minWidthAuto?: boolean;
  minHeightAuto?: boolean;
};

export type AppearanceElementKind =
  | "slider"
  | "toggle"
  | "checkbox"
  | "dropdown"
  | "button"
  | "input"
  | "select"
  | "list"
  | "container"
  | "text";

export type AppearanceSliderSettings = {
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  constraint: "none" | "system-ram";
  maxMode: "custom" | "system";
  systemMax: number;
  tickMode: "none" | "every" | "every-2" | "every-3" | "every-4" | "even" | "odd" | "custom";
  customTicks: number[];
  showHeader: boolean;
  showValue: boolean;
  valueEditable: boolean;
  keyboardEnabled: boolean;
  showDefaultMarker: boolean;
  defaultMarkerMagnetic: boolean;
};

export type AppearanceToggleSettings = {
  title: string;
  note: string;
  showNote: boolean;
  compact: boolean;
  switchScale: number;
};

export type AppearanceCheckboxSettings = {
  label: string;
  indicatorSize: number;
  labelGap: number;
};

export type AppearanceDropdownSettings = {
  label: string;
  showLabel: boolean;
  visibleItems: number;
  itemHeight: number;
};

export type AppearanceComponentSettingsMap = {
  slider: AppearanceSliderSettings;
  toggle: AppearanceToggleSettings;
  checkbox: AppearanceCheckboxSettings;
  dropdown: AppearanceDropdownSettings;
};

export type AppearanceComponentKind = keyof AppearanceComponentSettingsMap;

export type AppearanceElementComponentTarget = {
  [Kind in AppearanceComponentKind]: {
    kind: Kind;
    props: AppearanceComponentSettingsMap[Kind];
  };
}[AppearanceComponentKind];

export type AppearanceElementComponentOverride = {
  [Kind in AppearanceComponentKind]: {
    kind: Kind;
    settings: Partial<AppearanceComponentSettingsMap[Kind]>;
  };
}[AppearanceComponentKind];

export type AppearanceElementTarget = {
  id: string;
  label: string;
  path: AppearanceElementPathSegment[];
  tab?: TabKey;
  textTarget?: AppearanceElementTextTarget;
  defaults?: AppearanceElementDefaults;
  kind?: AppearanceElementKind;
  component?: AppearanceElementComponentTarget;
};

export type AppearanceElementShadow = "none" | "soft" | "strong" | "glow";
export type AppearanceElementTextAlign = "left" | "center" | "right";
export type AppearanceElementLayout = "default" | "row" | "column" | "grid";

export type AppearanceElementOverride = AppearanceElementTarget & {
  /** An empty string is a valid override and intentionally hides the original text. */
  text?: string;
  componentSettings?: AppearanceElementComponentOverride;
  style: {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    /** Legacy whole-element opacity. New profiles use the two independent values below. */
    opacity?: number;
    backgroundOpacity?: number;
    contentOpacity?: number;
    radius?: number;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    letterSpacing?: number;
    lineHeight?: number;
    textAlign?: AppearanceElementTextAlign;
    backgroundKind?: AppearanceElementBackgroundKind;
    backgroundColor?: string;
    backgroundGradientStart?: string;
    backgroundGradientEnd?: string;
    backgroundGradientAngle?: number;
    backgroundGradientType?: AppearanceElementGradientType;
    backgroundGradientStops?: AppearanceElementGradientStop[];
    backgroundGradientCenterX?: number;
    backgroundGradientCenterY?: number;
    backgroundGradientScale?: number;
    backgroundGradientRadialShape?: AppearanceElementGradientRadialShape;
    backgroundGradientRadialAspect?: number;
    backgroundGradientStrength?: number;
    backgroundGradientMidpoint?: number;
    backgroundGradientSoftness?: number;
    textColor?: string;
    paddingX?: number;
    paddingY?: number;
    borderWidth?: number;
    borderColor?: string;
    shadow?: AppearanceElementShadow;
    scale?: number;
    rotate?: number;
    layout?: AppearanceElementLayout;
    columns?: number;
    gap?: number;
  };
};

export type AppearanceProfile = {
  version: 2;
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
