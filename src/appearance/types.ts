import type { TabKey } from "../types";
import type { CanvasUiSettings } from "./canvasUi";
import type {
  CloseAnimationId,
  OpenAnimationId,
  TabAnimationId,
  UiMotionStyle,
} from "./animations";

export type Theme = "light" | "dark" | "void";
export type AppearanceBackgroundKind = "solid" | "gradient" | "image" | "drawing";
export type AppearanceElementBackgroundKind = "solid" | "gradient";
export type AppearanceElementGradientType = "linear" | "radial" | "conic";
export type AppearanceElementGradientRadialShape = "circle" | "ellipse";
export type AppearanceElementGradientAnimation =
  | "none"
  | "flow"
  | "pulse"
  | "drift"
  | "orbit"
  | "shimmer"
  | "spectrum"
  | "custom";
export type AppearanceElementGradientAnimationDirection = "normal" | "reverse" | "alternate";
export type AppearanceElementEntranceAnimation =
  | "none"
  | "fade"
  | "rise"
  | "slide-left"
  | "slide-right"
  | "zoom"
  | "blur"
  | "custom";
export type AppearanceElementTextDecoration = "none" | "underline" | "overline" | "line-through";
export type AppearanceElementTextDecorationStyle =
  | "solid"
  | "double"
  | "dotted"
  | "dashed"
  | "wavy";
export type AppearanceElementTextTransform = "none" | "uppercase" | "lowercase" | "capitalize";
export type AppearanceElementMaterialPreset = "ice" | "gold" | "glass" | "liquid-glass";

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
  /** Computed opacity with the element outside of :hover. */
  elementOpacity?: number;
  /** Computed opacity captured while the picker pointer is over the element. */
  hoverElementOpacity?: number;
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
  | "textfield"
  | "progressbar"
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
  searchEnabled: boolean;
  searchPlaceholder: string;
  emptyText: string;
  showArrow: boolean;
  showSelectedMark: boolean;
  highlightMatches: boolean;
  showResultCount: boolean;
  showDescriptions: boolean;
  closeOnSelect: boolean;
  wrapNavigation: boolean;
  caseSensitive: boolean;
  searchMatch: "contains" | "starts-with";
  sortMode: "source" | "ascending" | "descending";
  placement: "auto" | "down" | "up";
  menuGap: number;
  menuMinWidth: number;
  defaultValue: string;
  showDefaultMarker: boolean;
  showClear: boolean;
};

export type AppearanceTextFieldSettings = {
  label: string;
  placeholder: string;
  hint: string;
  defaultValue: string;
  showLabel: boolean;
  showPlaceholder: boolean;
  showHint: boolean;
  showCounter: boolean;
  showClear: boolean;
  showCopy: boolean;
  showReset: boolean;
  showPasswordToggle: boolean;
  selectOnFocus: boolean;
  trimOnBlur: boolean;
  maxLength: number;
  height: number;
  paddingX: number;
  fontSize: number;
  borderRadius: number;
  textAlign: "inherit" | "left" | "center" | "right";
  rows: number;
  resize: "inherit" | "none" | "vertical" | "both";
};

export type AppearanceProgressBarSettings = {
  label: string;
  showLabel: boolean;
  showValue: boolean;
  showDetail: boolean;
  valueFormat: "percent" | "fraction" | "value";
  precision: number;
  variant: "line" | "rounded" | "segmented";
  height: number;
  borderRadius: number;
  animated: boolean;
  animationDuration: number;
  striped: boolean;
  stripeWidth: number;
  segmentCount: number;
  segmentGap: number;
  tickMode: "none" | "quarters" | "tenths" | "custom";
  customTicks: number[];
  showTickLabels: boolean;
  highlightPassedTicks: boolean;
  defaultValue: number;
  showDefaultMarker: boolean;
  fillColor: string;
  trackColor: string;
  markerColor: string;
};

export type AppearanceComponentSettingsMap = {
  slider: AppearanceSliderSettings;
  toggle: AppearanceToggleSettings;
  checkbox: AppearanceCheckboxSettings;
  dropdown: AppearanceDropdownSettings;
  textfield: AppearanceTextFieldSettings;
  progressbar: AppearanceProgressBarSettings;
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
export type AppearanceElementAlignment = "auto" | "start" | "center" | "end" | "stretch";
export type AppearanceElementInteractionState =
  | "normal"
  | "hover"
  | "pressed"
  | "focus"
  | "disabled"
  | "selected";
export type AppearanceElementHoverEasing =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out";

export type AppearanceElementStyle = {
  materialPreset?: AppearanceElementMaterialPreset;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  /** Legacy whole-element opacity. New profiles use the two independent values below. */
  opacity?: number;
  /** Opacity of the complete element, independent from its surface and content controls. */
  elementOpacity?: number;
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
  backgroundGradientAnimation?: AppearanceElementGradientAnimation;
  backgroundGradientAnimationDuration?: number;
  backgroundGradientAnimationDirection?: AppearanceElementGradientAnimationDirection;
  backgroundGradientAnimationEasing?: AppearanceElementHoverEasing;
  backgroundGradientAnimationStartX?: number;
  backgroundGradientAnimationStartY?: number;
  backgroundGradientAnimationEndX?: number;
  backgroundGradientAnimationEndY?: number;
  backgroundGradientAnimationScale?: number;
  backgroundGradientAnimationHue?: number;
  backgroundGradientAnimationSaturation?: number;
  backgroundGradientAnimationBrightness?: number;
  textKind?: AppearanceElementBackgroundKind;
  textColor?: string;
  textGradientStart?: string;
  textGradientEnd?: string;
  textGradientAngle?: number;
  textGradientType?: AppearanceElementGradientType;
  textGradientStops?: AppearanceElementGradientStop[];
  textGradientCenterX?: number;
  textGradientCenterY?: number;
  textGradientScale?: number;
  textGradientRadialShape?: AppearanceElementGradientRadialShape;
  textGradientRadialAspect?: number;
  textGradientStrength?: number;
  textGradientMidpoint?: number;
  textGradientSoftness?: number;
  textGradientAnimation?: AppearanceElementGradientAnimation;
  textGradientAnimationDuration?: number;
  textGradientAnimationDirection?: AppearanceElementGradientAnimationDirection;
  textGradientAnimationEasing?: AppearanceElementHoverEasing;
  textGradientAnimationStartX?: number;
  textGradientAnimationStartY?: number;
  textGradientAnimationEndX?: number;
  textGradientAnimationEndY?: number;
  textGradientAnimationScale?: number;
  textGradientAnimationHue?: number;
  textGradientAnimationSaturation?: number;
  textGradientAnimationBrightness?: number;
  textDecoration?: AppearanceElementTextDecoration;
  textDecorationStyle?: AppearanceElementTextDecorationStyle;
  textDecorationColor?: string;
  textDecorationThickness?: number;
  textUnderlineOffset?: number;
  textTransform?: AppearanceElementTextTransform;
  textShadowColor?: string;
  textShadowX?: number;
  textShadowY?: number;
  textShadowBlur?: number;
  textStrokeColor?: string;
  textStrokeWidth?: number;
  paddingX?: number;
  paddingY?: number;
  offsetX?: number;
  offsetY?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  order?: number;
  alignSelf?: AppearanceElementAlignment;
  justifySelf?: AppearanceElementAlignment;
  zIndex?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: AppearanceElementShadow;
  shadowColor?: string;
  shadowX?: number;
  shadowY?: number;
  shadowBlur?: number;
  shadowSpread?: number;
  glowColor?: string;
  glowBlur?: number;
  glowIntensity?: number;
  backdropBlur?: number;
  outlineWidth?: number;
  outlineColor?: string;
  outlineOffset?: number;
  grainOpacity?: number;
  glassEffect?: boolean;
  glassTint?: string;
  glassOpacity?: number;
  glassSaturation?: number;
  /** Enables the shader-backed @ybouane/liquidglass treatment for this picked element. */
  liquidGlass?: boolean;
  liquidGlassBlur?: number;
  liquidGlassRefraction?: number;
  liquidGlassChromaticAberration?: number;
  liquidGlassEdgeHighlight?: number;
  liquidGlassSpecular?: number;
  entranceAnimation?: AppearanceElementEntranceAnimation;
  entranceDuration?: number;
  entranceDelay?: number;
  entranceEasing?: AppearanceElementHoverEasing;
  entranceFromOpacity?: number;
  entranceFromX?: number;
  entranceFromY?: number;
  entranceFromScale?: number;
  entranceFromRotate?: number;
  entranceFromBlur?: number;
  scale?: number;
  rotate?: number;
  layout?: AppearanceElementLayout;
  columns?: number;
  gap?: number;
};

export type AppearanceElementOverride = AppearanceElementTarget & {
  /** Canvas effect confined to this element, independent of the launcher effect. */
  canvasUi?: CanvasUiSettings;
  /** An empty string is a valid override and intentionally hides the original text. */
  text?: string;
  componentSettings?: AppearanceElementComponentOverride;
  /** Appearance before the pointer enters the element. */
  style: AppearanceElementStyle;
  /** Properties that replace the normal style while the pointer is over the element. */
  hoverStyle?: AppearanceElementStyle;
  pressedStyle?: AppearanceElementStyle;
  focusStyle?: AppearanceElementStyle;
  disabledStyle?: AppearanceElementStyle;
  selectedStyle?: AppearanceElementStyle;
  /** Shared transition used when entering or leaving any non-normal visual state. */
  stateTransitionMs?: number;
  stateEasing?: AppearanceElementHoverEasing;
  /** Legacy hover-only transition fields retained for stored v2 profiles. */
  hoverTransitionMs?: number;
  hoverEasing?: AppearanceElementHoverEasing;
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
    scope: "launcher" | "content";
    gradient: AppearanceElementStyle;
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
    customFonts: AppearanceCustomFont[];
  };
  opacity: {
    window: number;
    panels: number;
    controls: number;
  };
  navigation: {
    /** Sidebar entries that use the original text-only launcher design. */
    legacyTabs: TabKey[];
  };
  elementOverrides: AppearanceElementOverride[];
  canvasUi: CanvasUiSettings;
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

export type AppearanceCustomFont = {
  id: string;
  name: string;
  family: string;
  dataUrl: string;
  format: "woff2" | "woff" | "truetype" | "opentype";
};
