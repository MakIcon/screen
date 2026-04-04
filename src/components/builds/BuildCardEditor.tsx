import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { useState } from "react";
import "./BuildCardEditor.css";
import { ElementSlider } from "../inputs/ElementSlider";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { BuildCardContentView } from "./BuildCardContentView";
import {
  getBuildCardAppearanceStyle,
  getBuildCardBadgeStyle,
  shouldShowBuildCardBadge,
  type BuildCardAppearance,
  type BuildCardPreviewSize,
} from "./BuildCardSettingsPopup";
import { EditorSection, EditorRow } from "./BuildCardEditorSection";
import { BackgroundSection } from "./BuildCardEditorBackground";
import { BadgeSection } from "./BuildCardEditorBadge";
import { ContentSection } from "./BuildCardEditorContent";

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
  const [layoutOpen, setLayoutOpen] = useState(true);

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
            <BackgroundSection
              draft={draft}
              onDraftChange={onDraftChange}
              onUploadImage={onUploadImage}
            />

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

            <BadgeSection draft={draft} onDraftChange={onDraftChange} />

            <ContentSection
              draft={draft}
              onDraftChange={onDraftChange}
              resolvePreviewText={resolvePreviewText}
            />
          </div>
        </CustomScrollArea>
      </div>
    </div>
  );
}
