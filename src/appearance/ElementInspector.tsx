import { DISPLAY_FONT_OPTIONS, FONT_OPTIONS } from "./profile";
import { ColorField, RangeField, Section, SelectField } from "./StudioFields";
import type {
  AppearanceElementOverride,
  AppearanceElementShadow,
  AppearanceElementTarget,
  AppearanceElementTextAlign,
  AppearanceProfile,
} from "./types";

const TEXT_ALIGNMENTS: readonly { id: AppearanceElementTextAlign; label: string }[] = [
  { id: "left", label: "LEFT" },
  { id: "center", label: "CENTER" },
  { id: "right", label: "RIGHT" },
];

const SHADOWS: readonly { id: AppearanceElementShadow; label: string }[] = [
  { id: "none", label: "NONE" },
  { id: "soft", label: "SOFT" },
  { id: "strong", label: "STRONG" },
  { id: "glow", label: "ACCENT GLOW" },
];

type ElementInspectorProps = {
  target: AppearanceElementTarget | null;
  override?: AppearanceElementOverride;
  profile: AppearanceProfile;
  onPick: () => void;
  onStyleChange: (style: Partial<AppearanceElementOverride["style"]>) => void;
  onTextChange: (text: string | undefined) => void;
};

export function ElementInspector({
  target,
  override,
  profile,
  onPick,
  onStyleChange,
  onTextChange,
}: ElementInspectorProps) {
  if (!target) {
    return (
      <div className="appearance-element-empty">
        <span>07 / ELEMENT INSPECTOR</span>
        <strong>PICK ANY OBJECT IN THE LAUNCHER</strong>
        <p>
          Select a button, title, card or control. Its text and visual settings will appear here and
          update live in the main window.
        </p>
        <button type="button" onClick={onPick}>
          START ELEMENT PICKER →
        </button>
      </div>
    );
  }

  const style = override?.style;
  const originalText = target.textTarget?.original;
  const hasTextOverride = override && Object.prototype.hasOwnProperty.call(override, "text");
  const displayedText = hasTextOverride ? (override.text ?? "") : (originalText ?? "");
  const fonts = [...FONT_OPTIONS, ...DISPLAY_FONT_OPTIONS].filter(
    (font, index, options) =>
      options.findIndex((candidate) => candidate.value === font.value) === index,
  );
  const selectedFont = style?.fontFamily ?? profile.typography.uiFont;
  const fontOptions = fonts.map((font) => ({ id: font.value, label: font.label }));

  return (
    <div className="appearance-element-inspector">
      <div className="appearance-element-summary">
        <span>{target.tab ? target.tab.toUpperCase() : "ALL TABS"}</span>
        <strong>{target.label}</strong>
        <small>{target.id}</small>
      </div>

      <Section
        title="VISIBLE TEXT"
        note="Changes the primary visible label without replacing the button or breaking its click behavior."
      >
        {originalText !== undefined ? (
          <>
            <label className="studio-text-field">
              <span>ELEMENT LABEL</span>
              <textarea
                value={displayedText}
                maxLength={160}
                rows={2}
                spellCheck={false}
                onChange={(event) => onTextChange(event.target.value)}
              />
              <small>
                ORIGINAL: {originalText} · {displayedText.length}/160
              </small>
            </label>
            <button
              type="button"
              className="studio-inline-action"
              disabled={!hasTextOverride}
              onClick={() => onTextChange(undefined)}
            >
              RESTORE ORIGINAL TEXT
            </button>
          </>
        ) : (
          <div className="studio-unavailable-note">
            This object has no visible text node. Its visual properties can still be customized.
          </div>
        )}
      </Section>

      <Section title="TYPOGRAPHY" note="Fine controls apply only to this selected object.">
        <SelectField
          label="FONT FAMILY"
          value={selectedFont}
          options={fontOptions}
          onChange={(fontFamily) => onStyleChange({ fontFamily })}
        />
        <SelectField
          label="TEXT ALIGN"
          value={style?.textAlign ?? "center"}
          options={TEXT_ALIGNMENTS}
          onChange={(textAlign) => onStyleChange({ textAlign })}
        />
        <RangeField
          label="FONT SIZE"
          value={style?.fontSize ?? 14}
          min={6}
          max={96}
          suffix=" PX"
          onChange={(fontSize) => onStyleChange({ fontSize })}
        />
        <RangeField
          label="FONT WEIGHT"
          value={style?.fontWeight ?? 700}
          min={100}
          max={900}
          step={100}
          onChange={(fontWeight) => onStyleChange({ fontWeight })}
        />
        <RangeField
          label="LETTER SPACING"
          value={style?.letterSpacing ?? 0}
          min={-2}
          max={10}
          step={0.25}
          suffix=" PX"
          onChange={(letterSpacing) => onStyleChange({ letterSpacing })}
        />
        <RangeField
          label="LINE HEIGHT"
          value={style?.lineHeight ?? 1.2}
          min={0.7}
          max={2.5}
          step={0.05}
          onChange={(lineHeight) => onStyleChange({ lineHeight })}
        />
      </Section>

      <Section title="SURFACE & BORDER">
        <div className="studio-color-grid studio-color-grid--three">
          <ColorField
            label="BACKGROUND"
            value={style?.backgroundColor ?? profile.colors.surface}
            onChange={(backgroundColor) => onStyleChange({ backgroundColor })}
          />
          <ColorField
            label="TEXT"
            value={style?.textColor ?? profile.colors.text}
            onChange={(textColor) => onStyleChange({ textColor })}
          />
          <ColorField
            label="BORDER"
            value={style?.borderColor ?? profile.colors.accent}
            onChange={(borderColor) => onStyleChange({ borderColor })}
          />
        </div>
        <RangeField
          label="CORNER RADIUS"
          value={style?.radius ?? profile.shape.radius}
          min={0}
          max={40}
          suffix=" PX"
          onChange={(radius) => onStyleChange({ radius })}
        />
        <RangeField
          label="BORDER WIDTH"
          value={style?.borderWidth ?? 0}
          min={0}
          max={8}
          step={0.5}
          suffix=" PX"
          onChange={(borderWidth) => onStyleChange({ borderWidth })}
        />
        <RangeField
          label="OPACITY"
          value={style?.opacity ?? 1}
          min={0}
          max={1}
          step={0.05}
          onChange={(opacity) => onStyleChange({ opacity })}
        />
      </Section>

      <Section
        title="SPACING"
        note="Use padding to make a button or card larger without fixed sizing."
      >
        <RangeField
          label="HORIZONTAL PADDING"
          value={style?.paddingX ?? 0}
          min={0}
          max={64}
          suffix=" PX"
          onChange={(paddingX) => onStyleChange({ paddingX })}
        />
        <RangeField
          label="VERTICAL PADDING"
          value={style?.paddingY ?? 0}
          min={0}
          max={48}
          suffix=" PX"
          onChange={(paddingY) => onStyleChange({ paddingY })}
        />
      </Section>

      <Section title="EFFECTS" note="Transform and shadow are composed into one safe element rule.">
        <SelectField
          label="SHADOW"
          value={style?.shadow ?? "none"}
          options={SHADOWS}
          onChange={(shadow) => onStyleChange({ shadow })}
        />
        <RangeField
          label="SCALE"
          value={style?.scale ?? 1}
          min={0.5}
          max={1.5}
          step={0.01}
          onChange={(scale) => onStyleChange({ scale })}
        />
        <RangeField
          label="ROTATION"
          value={style?.rotate ?? 0}
          min={-15}
          max={15}
          step={0.5}
          suffix="°"
          onChange={(rotate) => onStyleChange({ rotate })}
        />
      </Section>
    </div>
  );
}
