import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { useState } from "react";
import "./BuildCardEditor.css";
import { ElementSlider } from "../inputs/ElementSlider";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { BuildCardContentView } from "./BuildCardContentView";
import {
  getBuildCardAppearanceStyle,
  getBuildCardBadgeStyle,
  getBuildCardBadgeText,
  hasBuildCardBackgroundImage,
  shouldShowBuildCardBadge,
  type BuildCardAppearance,
  type BuildCardPreviewSize,
} from "./BuildCardSettingsPopup";
import { EditorSection, EditorRow } from "./BuildCardEditorSection";
import { BackgroundSection } from "./BuildCardEditorBackground";
import { BadgeSection } from "./BuildCardEditorBadge";
import { ContentSection } from "./BuildCardEditorContent";
import { BuildCardDrawingCanvas } from "./BuildCardDrawingCanvas";
import {
  createPlaceholderAppearanceAttributes,
  createPlaceholderValueAttributes,
} from "../../utils/placeholders";

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
  onSave: () => void | Promise<void>;
  showHeader?: boolean;
};

export function BuildCardEditor({
  badgePreviewText,
  resolvePreviewText,
  previewCardSize,
  draft,
  onDraftChange,
  onUploadImage,
  onResetAll,
  onClose,
  onSave,
  showHeader = true,
}: Props) {
  const [layoutOpen, setLayoutOpen] = useState(true);

  const previewContentTags = draft.contentTags.map((tag) => ({
    ...tag,
    text: resolvePreviewText(tag.text),
    appearance: createPlaceholderAppearanceAttributes(tag.text, resolvePreviewText),
  }));
  const badgeTemplate = getBuildCardBadgeText(draft);
  const basePreviewHeight = previewCardSize?.height ?? 86;
  const heightValue = draft.cardHeight > 0 ? draft.cardHeight : basePreviewHeight;
  const drawingWidth = Math.max(1, Math.round(previewCardSize?.width ?? 356));
  const drawingHeight = Math.max(1, Math.round(heightValue));
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
    <div className="bce-editor" {...createPlaceholderValueAttributes(resolvePreviewText)}>
      {showHeader && (
        <div className="bce-header">
          <span className="bce-header-title">CARD APPEARANCE</span>
          <div className="bce-header-actions">
            <button className="bce-hdr-btn" type="button" onClick={onResetAll}>
              RESET
            </button>
            <button
              className="bce-hdr-btn bce-hdr-btn--save"
              type="button"
              onClick={() => void onSave()}
            >
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
      )}

      <div className="bce-layout" style={layoutStyle}>
        <div className="bce-preview-col">
          <span className="bce-preview-label">
            {draft.backgroundMode === "draw" ? "Drawing canvas" : "Preview"}
          </span>
          <div className="bce-preview-stage">
            {draft.backgroundMode === "draw" ? (
              <BuildCardDrawingCanvas
                width={drawingWidth}
                height={drawingHeight}
                image={draft.drawingImage}
                onImageChange={(drawingImage) =>
                  onDraftChange((prev) => ({ ...prev, drawingImage }))
                }
              />
            ) : (
              <div
                className={`instance-card bce-preview-card ${hasBuildCardBackgroundImage(draft) ? "instance-card-with-image" : ""}`}
                style={getBuildCardAppearanceStyle(draft)}
              >
                <div className="instance-card-top">
                  <span
                    className="instance-name"
                    {...createPlaceholderAppearanceAttributes("%build_name%", resolvePreviewText)}
                  >
                    {resolvePreviewText("%build_name%")}
                  </span>
                  {shouldShowBuildCardBadge(draft, true) && (
                    <span
                      className="instance-running-badge"
                      style={getBuildCardBadgeStyle(draft)}
                      {...createPlaceholderAppearanceAttributes(badgeTemplate, resolvePreviewText)}
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
                      <span
                        {...createPlaceholderAppearanceAttributes(
                          "%build_version%",
                          resolvePreviewText,
                        )}
                      >
                        {resolvePreviewText("%build_version%")}
                      </span>
                      <span
                        {...createPlaceholderAppearanceAttributes(
                          "%build_loader%",
                          resolvePreviewText,
                        )}
                      >
                        {resolvePreviewText("%build_loader%")}
                      </span>
                      <span
                        {...createPlaceholderAppearanceAttributes(
                          "%build_ram%",
                          resolvePreviewText,
                        )}
                      >
                        {resolvePreviewText("%build_ram%")}
                      </span>
                      <span
                        {...createPlaceholderAppearanceAttributes(
                          "%build_last_played%",
                          resolvePreviewText,
                        )}
                      >
                        {resolvePreviewText("%build_last_played%")}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
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
