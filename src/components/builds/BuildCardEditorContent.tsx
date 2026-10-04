import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { ElementSlider } from "../inputs/ElementSlider";
import { ElementToggle } from "../inputs/ElementToggle";
import { ColorPicker } from "../color-picker/ColorPicker";
import {
  createBuildCardContentTag,
  getDefaultBuildCardTagPosition,
  type BuildCardAppearance,
  type BuildCardContentMode,
  type BuildCardContentTag,
} from "./BuildCardSettingsPopup";
import { EditorSection, EditorRow } from "./BuildCardEditorSection";
import {
  createPlaceholderAppearanceAttributes,
  type PlaceholderAppearanceAttributes,
} from "../../utils/placeholders";
import { BuildPlaceholderCaseControl } from "./BuildPlaceholderCaseControl";
import { getBuildCardPlainContentStyle, resolveBuildCardTags } from "./BuildCardContentView";
import { PlaceholderGuideButton } from "../placeholders/PlaceholderGuideButton";

function alphaColor(hex: string, opacity: number) {
  const normalizedOpacity = Math.max(0, Math.min(100, opacity));
  const alpha = Math.round((normalizedOpacity / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
}

type ContentTagRowProps = {
  tag: BuildCardContentTag;
  mode: BuildCardContentMode;
  previewText: string;
  previewAppearance: PlaceholderAppearanceAttributes;
  strokeEnabled: boolean;
  enabled: boolean;
  onUpdate: (tag: BuildCardContentTag) => void;
  onDelete: () => void;
};

function ContentTagRow({
  tag,
  mode,
  previewText,
  previewAppearance,
  strokeEnabled,
  enabled,
  onUpdate,
  onDelete,
}: ContentTagRowProps) {
  const [open, setOpen] = useState(false);
  const labelPrefix = mode === "tags" ? "Tag" : "Text";

  return (
    <div className="bce-tag-row">
      <div className="bce-tag-row-head">
        <button type="button" className="bce-tag-toggle" onClick={() => setOpen((prev) => !prev)}>
          <span
            className={`bce-tag-preview ${!enabled || mode === "text" ? "bce-tag-preview--text" : ""}`}
            {...previewAppearance}
            style={
              !enabled
                ? getBuildCardPlainContentStyle(tag)
                : mode === "tags"
                  ? {
                      borderColor: tag.borderColor,
                      backgroundColor: alphaColor(tag.fillColor, tag.fillOpacity),
                      color: tag.textColor,
                      fontSize: `${tag.fontSize}px`,
                    }
                  : {
                      color: alphaColor(tag.fillColor, tag.fillOpacity),
                      WebkitTextStroke: strokeEnabled ? `0.55px ${tag.borderColor}` : undefined,
                      textShadow: strokeEnabled ? `0 0 0 ${tag.borderColor}` : undefined,
                      paintOrder: strokeEnabled ? "stroke fill" : undefined,
                      fontSize: `${tag.fontSize}px`,
                    }
            }
          >
            {previewText || tag.text || `${labelPrefix} tag`}
          </span>

          <span className="bce-tag-caption">{tag.text || `${labelPrefix} placeholder`}</span>

          <svg
            className={`bce-section-chevron ${open ? "bce-section-chevron--open" : ""}`}
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="2 3 5 6 8 3" />
          </svg>
        </button>

        <button type="button" className="bce-tag-delete" onClick={onDelete} aria-label="Delete tag">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="2" y1="2" x2="8" y2="8" />
            <line x1="8" y1="2" x2="2" y2="8" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="bce-tag-row-body">
          <EditorRow label="Text">
            <div className="bce-placeholder-field">
              <input
                className="bce-text-input"
                type="text"
                maxLength={160}
                placeholder="^%build_version%"
                value={tag.text}
                onChange={(e) => onUpdate({ ...tag, text: e.target.value })}
              />
              <BuildPlaceholderCaseControl
                value={tag.text}
                maxLength={160}
                onChange={(text) => onUpdate({ ...tag, text })}
              />
            </div>
          </EditorRow>

          <EditorRow label="Size">
            <div className="bce-slider-field">
              <span className="bce-slider-value">{tag.fontSize}px</span>
              <div className="bce-slider">
                <ElementSlider
                  showHeader={false}
                  min={8}
                  max={28}
                  step={1}
                  value={tag.fontSize}
                  tickMode="none"
                  onChange={(value) => onUpdate({ ...tag, fontSize: value })}
                />
              </div>
            </div>
          </EditorRow>

          <EditorRow label={mode === "tags" ? "Border" : "Stroke"} alignTop>
            <ColorPicker
              value={tag.borderColor}
              onChange={(hex) => onUpdate({ ...tag, borderColor: hex })}
            />
          </EditorRow>

          <EditorRow label={mode === "tags" ? "Fill" : "Text"} alignTop>
            <ColorPicker
              value={tag.fillColor}
              onChange={(hex) => onUpdate({ ...tag, fillColor: hex })}
            />
          </EditorRow>

          {mode === "tags" && (
            <EditorRow label="Text" alignTop>
              <ColorPicker
                value={tag.textColor}
                onChange={(hex) => onUpdate({ ...tag, textColor: hex })}
              />
            </EditorRow>
          )}

          <EditorRow label={mode === "tags" ? "Fill %" : "Text %"}>
            <div className="bce-slider-field">
              <span className="bce-slider-value">{tag.fillOpacity}%</span>
              <div className="bce-slider">
                <ElementSlider
                  showHeader={false}
                  min={0}
                  max={100}
                  step={1}
                  value={tag.fillOpacity}
                  tickMode="none"
                  onChange={(value) => onUpdate({ ...tag, fillOpacity: value })}
                />
              </div>
            </div>
          </EditorRow>
        </div>
      )}
    </div>
  );
}

type Props = {
  draft: BuildCardAppearance;
  onDraftChange: Dispatch<SetStateAction<BuildCardAppearance>>;
  resolvePreviewText: (template: string) => string;
};

export function ContentSection({ draft, onDraftChange, resolvePreviewText }: Props) {
  const [open, setOpen] = useState(true);

  const previewContentTags = resolveBuildCardTags(draft, resolvePreviewText);

  function updateContentTag(tagId: string, nextTag: BuildCardContentTag) {
    onDraftChange((prev) => ({
      ...prev,
      contentTags: prev.contentTags.map((tag) => (tag.id === tagId ? nextTag : tag)),
    }));
  }

  function deleteContentTag(tagId: string) {
    onDraftChange((prev) => ({
      ...prev,
      contentTags: prev.contentTags.filter((tag) => tag.id !== tagId),
      contentTagPositions: Object.fromEntries(
        Object.entries(prev.contentTagPositions).filter(([id]) => id !== tagId),
      ),
      layoutOffsets: Object.fromEntries(
        Object.entries(prev.layoutOffsets).filter(([id]) => id !== tagId),
      ),
      elementScales: Object.fromEntries(
        Object.entries(prev.elementScales).filter(([id]) => id !== tagId),
      ),
    }));
  }

  function addContentTag() {
    onDraftChange((prev) => {
      const nextTag = createBuildCardContentTag(prev.contentMode);
      return {
        ...prev,
        contentTags: [...prev.contentTags, nextTag],
        contentTagPositions: {
          ...prev.contentTagPositions,
          [nextTag.id]: getDefaultBuildCardTagPosition(prev.contentTags.length),
        },
      };
    });
  }

  return (
    <EditorSection title="Content" open={open} onToggle={() => setOpen((prev) => !prev)}>
      <EditorRow label="Enable">
        <div className="bce-mode-switch">
          <button
            type="button"
            className={`bce-mode-pill ${draft.contentEnabled ? "bce-mode-pill--active" : ""}`}
            onClick={() => onDraftChange((prev) => ({ ...prev, contentEnabled: true }))}
          >
            On
          </button>
          <button
            type="button"
            className={`bce-mode-pill ${!draft.contentEnabled ? "bce-mode-pill--active" : ""}`}
            onClick={() => onDraftChange((prev) => ({ ...prev, contentEnabled: false }))}
          >
            Off
          </button>
        </div>
      </EditorRow>

      <EditorRow label="Mode">
        <div className="bce-mode-switch">
          <button
            type="button"
            className={`bce-mode-pill ${draft.contentMode === "text" ? "bce-mode-pill--active" : ""}`}
            onClick={() => onDraftChange((prev) => ({ ...prev, contentMode: "text" }))}
          >
            Plain text
          </button>
          <button
            type="button"
            className={`bce-mode-pill ${draft.contentMode === "tags" ? "bce-mode-pill--active" : ""}`}
            onClick={() => onDraftChange((prev) => ({ ...prev, contentMode: "tags" }))}
          >
            Tags
          </button>
        </div>
      </EditorRow>

      {draft.contentMode === "text" && (
        <>
          <EditorRow label="Align">
            <div className="bce-mode-switch">
              {(["left", "center", "right"] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  className={`bce-mode-pill ${draft.contentTextAlign === align ? "bce-mode-pill--active" : ""}`}
                  onClick={() => onDraftChange((prev) => ({ ...prev, contentTextAlign: align }))}
                >
                  {align === "left" ? "Left" : align === "center" ? "Center" : "Right"}
                </button>
              ))}
            </div>
          </EditorRow>

          <div className="bce-content-toggle-wrap">
            <ElementToggle
              title="TEXT OUTLINE"
              note="Draw a stroke around plain text placeholders."
              enabled={draft.contentTextStrokeEnabled}
              onToggle={() =>
                onDraftChange((prev) => ({
                  ...prev,
                  contentTextStrokeEnabled: !prev.contentTextStrokeEnabled,
                }))
              }
            />
          </div>
        </>
      )}

      <div className="bce-tag-list">
        {draft.contentTags.length === 0 ? (
          <div className="bce-tag-empty">
            Add a tag to show build placeholders inside the card content area.
          </div>
        ) : (
          draft.contentTags.map((tag, index) => (
            <ContentTagRow
              key={tag.id}
              tag={tag}
              mode={draft.contentMode}
              previewText={previewContentTags[index]?.text ?? ""}
              previewAppearance={
                previewContentTags[index]?.appearance ??
                createPlaceholderAppearanceAttributes(tag.text, resolvePreviewText)
              }
              strokeEnabled={draft.contentTextStrokeEnabled}
              enabled={draft.contentEnabled}
              onUpdate={(nextTag) => updateContentTag(tag.id, nextTag)}
              onDelete={() => deleteContentTag(tag.id)}
            />
          ))
        )}
      </div>

      <button type="button" className="bce-add-tag" onClick={addContentTag}>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="5" y1="1.5" x2="5" y2="8.5" />
          <line x1="1.5" y1="5" x2="8.5" y2="5" />
        </svg>
        Add tag
      </button>

      <PlaceholderGuideButton />
    </EditorSection>
  );
}
