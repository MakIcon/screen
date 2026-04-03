import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { useState } from "react";
import "./BuildCardEditor.css";
import { InlineDropdown } from "../inputs/InlineDropdown";
import { ElementSlider } from "../inputs/ElementSlider";
import { ElementToggle } from "../inputs/ElementToggle";
import { ColorPicker } from "../color-picker/ColorPicker";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { BuildCardContentView } from "./BuildCardContentView";
import {
  createBuildCardContentTag,
  getBuildCardAppearanceStyle,
  getBuildCardBadgeStyle,
  getBuildCardBadgeVisibility,
  shouldShowBuildCardBadge,
  type BuildCardAppearance,
  type BuildCardContentMode,
  type BuildCardContentTag,
  type BuildCardPreviewSize,
} from "./BuildCardSettingsPopup";

type BgMode = "color" | "image" | "url";

type EditorSectionProps = {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

type EditorRowProps = {
  label: string;
  children: ReactNode;
  alignTop?: boolean;
};

function EditorSection({ title, open, onToggle, children }: EditorSectionProps) {
  return (
    <section className="bce-section">
      <button
        type="button"
        className="bce-section-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>{title}</span>
        <svg
          className={`bce-section-chevron ${open ? "bce-section-chevron--open" : ""}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="2 4 6 8 10 4" />
        </svg>
      </button>
      {open && <div className="bce-section-body">{children}</div>}
    </section>
  );
}

function EditorRow({ label, children, alignTop = false }: EditorRowProps) {
  return (
    <div className={`bce-row ${alignTop ? "bce-row--top" : ""}`}>
      <span className="bce-row-label">{label}</span>
      <div className="bce-row-control">{children}</div>
    </div>
  );
}

function detectMode(draft: BuildCardAppearance): BgMode {
  if (!draft.image) return "color";
  if (draft.image.startsWith("data:")) return "image";
  return "url";
}

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
  onUpdate: (tag: BuildCardContentTag) => void;
  onDelete: () => void;
};

function ContentTagRow({
  tag,
  mode,
  previewText,
  onUpdate,
  onDelete,
}: ContentTagRowProps) {
  const [open, setOpen] = useState(false);
  const labelPrefix = mode === "tags" ? "Tag" : "Text";

  return (
    <div className="bce-tag-row">
      <div className="bce-tag-row-head">
        <button
          type="button"
          className="bce-tag-toggle"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span
            className={`bce-tag-preview ${mode === "text" ? "bce-tag-preview--text" : ""}`}
            style={
              mode === "tags"
                ? {
                    borderColor: tag.borderColor,
                    backgroundColor: alphaColor(tag.fillColor, tag.fillOpacity),
                    color: tag.textColor,
                    fontSize: `${tag.fontSize}px`,
                  }
                : {
                    color: alphaColor(tag.fillColor, tag.fillOpacity),
                    WebkitTextStroke: `0.55px ${tag.borderColor}`,
                    textShadow: `0 0 0 ${tag.borderColor}`,
                    paintOrder: "stroke fill",
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

        <button
          type="button"
          className="bce-tag-delete"
          onClick={onDelete}
          aria-label="Delete tag"
        >
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
            <input
              className="bce-text-input"
              type="text"
              placeholder="^%build_version%"
              value={tag.text}
              onChange={(e) => onUpdate({ ...tag, text: e.target.value })}
            />
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
  buildName: string;
  buildVersion: string;
  buildLoader: string;
  buildRamGb: number;
  lastPlayedLabel: string;
  badgePreviewText: string;
  resolvePreviewText: (template: string) => string;
  previewCardSize: BuildCardPreviewSize | null;
  draft: BuildCardAppearance;
  onDraftChange: Dispatch<SetStateAction<BuildCardAppearance>>;
  onUploadImage: (file: File | null) => void;
  onResetAll: () => void;
  onClose: () => void;
  onSave: () => void;
};

export function BuildCardEditor({
  buildName,
  buildVersion,
  buildLoader,
  buildRamGb,
  lastPlayedLabel,
  badgePreviewText,
  resolvePreviewText,
  previewCardSize,
  draft,
  onDraftChange,
  onUploadImage,
  onResetAll,
  onClose,
  onSave,
}: Props) {
  const [mode, setMode] = useState<BgMode>(() => detectMode(draft));
  const [fitOpen, setFitOpen] = useState(false);
  const [backgroundOpen, setBackgroundOpen] = useState(true);
  const [layoutOpen, setLayoutOpen] = useState(true);
  const [badgeOpen, setBadgeOpen] = useState(true);
  const [contentOpen, setContentOpen] = useState(true);
  const [urlInput, setUrlInput] = useState(() =>
    draft.image && !draft.image.startsWith("data:") ? draft.image : "",
  );

  function switchMode(next: BgMode) {
    setMode(next);
    if (next === "color") {
      onDraftChange((prev) => ({ ...prev, image: "" }));
      return;
    }

    if (next === "image") {
      if (draft.image && !draft.image.startsWith("data:")) {
        onDraftChange((prev) => ({ ...prev, image: "" }));
      }
      return;
    }

    if (draft.image.startsWith("data:")) {
      onDraftChange((prev) => ({ ...prev, image: "" }));
    }
    setUrlInput(draft.image && !draft.image.startsWith("data:") ? draft.image : "");
  }

  function applyUrl(raw: string) {
    const url = raw.trim();
    onDraftChange((prev) => ({
      ...prev,
      image: url,
    }));
  }

  const fitLabel = draft.imageFit === "stretch" ? "FIT WHOLE IMAGE" : "FILL CARD";
  const opacityValue =
    mode === "color"
      ? Math.round(draft.backgroundOpacity * 100)
      : Math.round(draft.imageOpacity * 100);
  const previewContentTags = draft.contentTags.map((tag) => ({
    ...tag,
    text: resolvePreviewText(tag.text),
  }));
  const basePreviewHeight = previewCardSize?.height ?? 86;
  const heightValue = draft.cardHeight > 0 ? draft.cardHeight : basePreviewHeight;
  const layoutStyle = previewCardSize
    ? ({
        ["--bce-preview-card-width" as string]: `${previewCardSize.width}px`,
        ["--bce-preview-card-height" as string]: `${heightValue}px`,
        ["--bce-preview-shell-width" as string]: `${previewCardSize.width}px`,
      } satisfies CSSProperties)
    : ({
        ["--bce-preview-card-height" as string]: `${heightValue}px`,
      } satisfies CSSProperties);

  function handleOpacityChange(v: number) {
    if (mode === "color") {
      onDraftChange((prev) => ({ ...prev, backgroundOpacity: v / 100 }));
      return;
    }

    onDraftChange((prev) => ({ ...prev, imageOpacity: v / 100 }));
  }

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
    }));
  }

  function addContentTag() {
    onDraftChange((prev) => ({
      ...prev,
      contentEnabled: true,
      contentTags: [...prev.contentTags, createBuildCardContentTag(prev.contentMode)],
    }));
  }

  return (
    <div className="bce-editor">
      <div className="bce-header">
        <span className="bce-header-title">CARD APPEARANCE</span>
        <div className="bce-header-actions">
          <button className="bce-hdr-btn" type="button" onClick={onResetAll}>
            RESET
          </button>
          <button className="bce-hdr-btn bce-hdr-btn--save" type="button" onClick={onSave}>
            SAVE
          </button>
          <button className="bce-hdr-close" type="button" onClick={onClose} aria-label="Close">
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="1" y1="1" x2="10" y2="10" />
              <line x1="10" y1="1" x2="1" y2="10" />
            </svg>
          </button>
        </div>
      </div>

      <div className="bce-layout" style={layoutStyle}>
        <div className="bce-preview-col">
          <span className="bce-preview-label">Preview</span>
          <div className="bce-preview-stage">
            <div
              className={`instance-card bce-preview-card ${draft.image ? "instance-card-with-image" : ""}`}
              style={getBuildCardAppearanceStyle(draft)}
            >
              <div className="instance-card-top">
                <span className="instance-name">{buildName}</span>
                {shouldShowBuildCardBadge(draft, true) && (
                  <span
                    className="instance-running-badge"
                    style={getBuildCardBadgeStyle(draft)}
                  >
                    {badgePreviewText}
                  </span>
                )}
              </div>
              <div
                className={`instance-card-meta ${draft.contentEnabled ? "instance-card-meta--content" : ""}`}
              >
                {draft.contentEnabled ? (
                  <BuildCardContentView
                    mode={draft.contentMode}
                    align={draft.contentTextAlign}
                    tags={previewContentTags}
                    strokeEnabled={draft.contentTextStrokeEnabled}
                  />
                ) : (
                  <>
                    <span>{buildVersion}</span>
                    <span>{buildLoader}</span>
                    <span>{buildRamGb} GB</span>
                    <span>{lastPlayedLabel}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <CustomScrollArea className="bce-controls-scroll" style={{ minHeight: 0 }}>
          <div className="bce-controls-col">
            <EditorSection
              title="Background"
              open={backgroundOpen}
              onToggle={() => setBackgroundOpen((prev) => !prev)}
            >
              <EditorRow label="Type">
                <div className="bce-mode-switch">
                  {(["color", "image", "url"] as BgMode[]).map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      className={`bce-mode-pill ${mode === entry ? "bce-mode-pill--active" : ""}`}
                      onClick={() => switchMode(entry)}
                    >
                      {entry === "color" ? "Color" : entry === "image" ? "Image" : "URL"}
                    </button>
                  ))}
                </div>
              </EditorRow>

              {mode === "color" && (
                <>
                  <EditorRow label="Color" alignTop>
                    <ColorPicker
                      value={draft.backgroundColor}
                      onChange={(hex) =>
                        onDraftChange((prev) => ({ ...prev, backgroundColor: hex }))
                      }
                    />
                  </EditorRow>
                  <EditorRow label="Opacity">
                    <div className="bce-slider-field">
                      <span className="bce-slider-value">{opacityValue}%</span>
                      <div className="bce-slider">
                        <ElementSlider
                          showHeader={false}
                          min={0}
                          max={100}
                          step={10}
                          value={opacityValue}
                          tickMode="every"
                          onChange={(v) => handleOpacityChange(Number(v))}
                        />
                      </div>
                    </div>
                  </EditorRow>
                </>
              )}

              {mode === "image" && (
                <>
                  <EditorRow label="Source" alignTop>
                    <div className="bce-upload-area">
                      <label className={`bce-upload-btn ${draft.image ? "bce-upload-btn--has-image" : ""}`}>
                        {draft.image ? (
                          <>
                            <img className="bce-upload-thumb" src={draft.image} alt="" />
                            CHANGE IMAGE
                          </>
                        ) : (
                          <>
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 14 14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <line x1="7" y1="1" x2="7" y2="13" />
                              <line x1="1" y1="7" x2="13" y2="7" />
                            </svg>
                            UPLOAD IMAGE
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            onUploadImage(e.target.files?.[0] ?? null);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                      {draft.image && (
                        <button
                          className="ghost-action bce-clear-btn"
                          type="button"
                          onClick={() => onDraftChange((prev) => ({ ...prev, image: "" }))}
                        >
                          CLEAR IMAGE
                        </button>
                      )}
                    </div>
                  </EditorRow>

                  <EditorRow label="Fit">
                    <div className="bce-dropdown">
                      <InlineDropdown
                        label="IMAGE FIT"
                        value={fitLabel}
                        options={["FILL CARD", "FIT WHOLE IMAGE"]}
                        isOpen={fitOpen}
                        onToggle={() => setFitOpen((prev) => !prev)}
                        onSelect={(val) => {
                          onDraftChange((prev) => ({
                            ...prev,
                            imageFit: val === "FIT WHOLE IMAGE" ? "stretch" : "cover",
                          }));
                          setFitOpen(false);
                        }}
                      />
                    </div>
                  </EditorRow>

                  <EditorRow label="Opacity">
                    <div className="bce-slider-field">
                      <span className="bce-slider-value">{opacityValue}%</span>
                      <div className="bce-slider">
                        <ElementSlider
                          showHeader={false}
                          min={0}
                          max={100}
                          step={10}
                          value={opacityValue}
                          tickMode="every"
                          onChange={(v) => handleOpacityChange(Number(v))}
                        />
                      </div>
                    </div>
                  </EditorRow>
                </>
              )}

              {mode === "url" && (
                <>
                  <EditorRow label="URL">
                    <input
                      className="bce-url-input"
                      type="url"
                      placeholder="https://..."
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onBlur={(e) => applyUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          applyUrl(urlInput);
                        }
                      }}
                    />
                  </EditorRow>

                  <EditorRow label="Fit">
                    <div className="bce-dropdown">
                      <InlineDropdown
                        label="IMAGE FIT"
                        value={fitLabel}
                        options={["FILL CARD", "FIT WHOLE IMAGE"]}
                        isOpen={fitOpen}
                        onToggle={() => setFitOpen((prev) => !prev)}
                        onSelect={(val) => {
                          onDraftChange((prev) => ({
                            ...prev,
                            imageFit: val === "FIT WHOLE IMAGE" ? "stretch" : "cover",
                          }));
                          setFitOpen(false);
                        }}
                      />
                    </div>
                  </EditorRow>

                  <EditorRow label="Opacity">
                    <div className="bce-slider-field">
                      <span className="bce-slider-value">{opacityValue}%</span>
                      <div className="bce-slider">
                        <ElementSlider
                          showHeader={false}
                          min={0}
                          max={100}
                          step={10}
                          value={opacityValue}
                          tickMode="every"
                          onChange={(v) => handleOpacityChange(Number(v))}
                        />
                      </div>
                    </div>
                  </EditorRow>
                </>
              )}
            </EditorSection>

            <EditorSection
              title="Layout"
              open={layoutOpen}
              onToggle={() => setLayoutOpen((prev) => !prev)}
            >
              <EditorRow label="Height">
                <div className="bce-slider-field">
                  <span className="bce-slider-value">{heightValue}px</span>
                  <div className="bce-slider">
                    <ElementSlider
                      showHeader={false}
                      min={72}
                      max={260}
                      step={4}
                      value={heightValue}
                      tickMode="custom"
                      customTicks={[72, 96, 120, 144, 168, 192, 224, 260]}
                      onChange={(value) =>
                        onDraftChange((prev) => ({ ...prev, cardHeight: Number(value) }))
                      }
                    />
                  </div>
                </div>
              </EditorRow>
            </EditorSection>

            <EditorSection
              title="Badge"
              open={badgeOpen}
              onToggle={() => setBadgeOpen((prev) => !prev)}
            >
              <EditorRow label="Enable">
                <div className="bce-mode-switch">
                  <button
                    type="button"
                    className={`bce-mode-pill ${draft.badgeEnabled ? "bce-mode-pill--active" : ""}`}
                    onClick={() =>
                      onDraftChange((prev) => ({ ...prev, badgeEnabled: true }))
                    }
                  >
                    On
                  </button>
                  <button
                    type="button"
                    className={`bce-mode-pill ${!draft.badgeEnabled ? "bce-mode-pill--active" : ""}`}
                    onClick={() =>
                      onDraftChange((prev) => ({ ...prev, badgeEnabled: false }))
                    }
                  >
                    Off
                  </button>
                </div>
              </EditorRow>

              <EditorRow label="Visible">
                <div className="bce-mode-switch">
                  <button
                    type="button"
                    className={`bce-mode-pill ${getBuildCardBadgeVisibility(draft) === "on" ? "bce-mode-pill--active" : ""}`}
                    onClick={() =>
                      onDraftChange((prev) => ({ ...prev, badgeVisibility: "on" }))
                    }
                  >
                    On
                  </button>
                  <button
                    type="button"
                    className={`bce-mode-pill ${getBuildCardBadgeVisibility(draft) === "off" ? "bce-mode-pill--active" : ""}`}
                    onClick={() =>
                      onDraftChange((prev) => ({ ...prev, badgeVisibility: "off" }))
                    }
                  >
                    Off
                  </button>
                  <button
                    type="button"
                    className={`bce-mode-pill ${getBuildCardBadgeVisibility(draft) === "always" ? "bce-mode-pill--active" : ""}`}
                    onClick={() =>
                      onDraftChange((prev) => ({ ...prev, badgeVisibility: "always" }))
                    }
                  >
                    Always
                  </button>
                </div>
              </EditorRow>

              <EditorRow label="Text">
                <input
                  className="bce-text-input bce-badge-text-input"
                  type="text"
                  maxLength={22}
                  placeholder="^%build_state%"
                  value={draft.badgeText}
                  onChange={(e) =>
                    onDraftChange((prev) => ({ ...prev, badgeText: e.target.value }))
                  }
                />
              </EditorRow>

              <EditorRow label="Bg Color" alignTop>
                <ColorPicker
                  value={draft.badgeColor}
                  onChange={(hex) =>
                    onDraftChange((prev) => ({ ...prev, badgeColor: hex }))
                  }
                />
              </EditorRow>

              <EditorRow label="Text Color" alignTop>
                <ColorPicker
                  value={draft.badgeTextColor}
                  onChange={(hex) =>
                    onDraftChange((prev) => ({ ...prev, badgeTextColor: hex }))
                  }
                />
              </EditorRow>
            </EditorSection>

            <EditorSection
              title="Content"
              open={contentOpen}
              onToggle={() => setContentOpen((prev) => !prev)}
            >
              <EditorRow label="Enable">
                <div className="bce-mode-switch">
                  <button
                    type="button"
                    className={`bce-mode-pill ${draft.contentEnabled ? "bce-mode-pill--active" : ""}`}
                    onClick={() =>
                      onDraftChange((prev) => ({ ...prev, contentEnabled: true }))
                    }
                  >
                    On
                  </button>
                  <button
                    type="button"
                    className={`bce-mode-pill ${!draft.contentEnabled ? "bce-mode-pill--active" : ""}`}
                    onClick={() =>
                      onDraftChange((prev) => ({ ...prev, contentEnabled: false }))
                    }
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
                    onClick={() =>
                      onDraftChange((prev) => ({ ...prev, contentMode: "text" }))
                    }
                  >
                    Plain text
                  </button>
                  <button
                    type="button"
                    className={`bce-mode-pill ${draft.contentMode === "tags" ? "bce-mode-pill--active" : ""}`}
                    onClick={() =>
                      onDraftChange((prev) => ({ ...prev, contentMode: "tags" }))
                    }
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
                          onClick={() =>
                            onDraftChange((prev) => ({
                              ...prev,
                              contentTextAlign: align,
                            }))
                          }
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

              <p className="bce-content-hint">
                Use placeholders like `%build_name%`, `%build_version%`, `%build_loader%`,
                `%build_ram%`, `%build_last_played%` or `%build_state%`. Prefix with `^`
                to force uppercase.
              </p>
            </EditorSection>
          </div>
        </CustomScrollArea>
      </div>
    </div>
  );
}
