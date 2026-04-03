import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { useState } from "react";
import "./BuildCardEditor.css";
import { InlineDropdown } from "../inputs/InlineDropdown";
import { ElementSlider } from "../inputs/ElementSlider";
import { ColorPicker } from "../color-picker/ColorPicker";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import {
  getBuildCardAppearanceStyle,
  getBuildCardBadgeStyle,
  getBuildCardBadgeText,
  type BuildCardAppearance,
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

type Props = {
  buildName: string;
  buildVersion: string;
  buildLoader: string;
  buildRamGb: number;
  lastPlayedLabel: string;
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
  const [badgeOpen, setBadgeOpen] = useState(true);
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
    onDraftChange((prev) => ({ ...prev, image: url }));
  }

  const fitLabel = draft.imageFit === "stretch" ? "FIT WHOLE IMAGE" : "FILL CARD";
  const opacityValue =
    mode === "color"
      ? Math.round(draft.backgroundOpacity * 100)
      : Math.round(draft.imageOpacity * 100);
  const layoutStyle = previewCardSize
    ? ({
        ["--bce-preview-card-width" as string]: `${previewCardSize.width}px`,
        ["--bce-preview-card-height" as string]: `${previewCardSize.height}px`,
        ["--bce-preview-shell-width" as string]: `${previewCardSize.width}px`,
      } satisfies CSSProperties)
    : undefined;

  function handleOpacityChange(v: number) {
    if (mode === "color") {
      onDraftChange((prev) => ({ ...prev, backgroundOpacity: v / 100 }));
      return;
    }

    onDraftChange((prev) => ({ ...prev, imageOpacity: v / 100 }));
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
                {draft.badgeEnabled && draft.badgeVisible && (
                  <span
                    className="instance-running-badge"
                    style={getBuildCardBadgeStyle(draft)}
                  >
                    {getBuildCardBadgeText(draft)}
                  </span>
                )}
              </div>
              <div className="instance-card-meta">
                <span>{buildVersion}</span>
                <span>{buildLoader}</span>
                <span>{buildRamGb} GB</span>
                <span>{lastPlayedLabel}</span>
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
                    className={`bce-mode-pill ${draft.badgeVisible ? "bce-mode-pill--active" : ""}`}
                    onClick={() =>
                      onDraftChange((prev) => ({ ...prev, badgeVisible: true }))
                    }
                  >
                    On
                  </button>
                  <button
                    type="button"
                    className={`bce-mode-pill ${!draft.badgeVisible ? "bce-mode-pill--active" : ""}`}
                    onClick={() =>
                      onDraftChange((prev) => ({ ...prev, badgeVisible: false }))
                    }
                  >
                    Off
                  </button>
                </div>
              </EditorRow>

              <EditorRow label="Text">
                <input
                  className="bce-text-input bce-badge-text-input"
                  type="text"
                  maxLength={22}
                  placeholder="RUNNING"
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
          </div>
        </CustomScrollArea>
      </div>
    </div>
  );
}
