import { TextField } from "../inputs/TextField";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { InlineDropdown } from "../inputs/InlineDropdown";
import { ElementSlider } from "../inputs/ElementSlider";
import { ColorPicker } from "../color-picker/ColorPicker";
import type { BuildCardAppearance, BuildCardBackgroundMode } from "./BuildCardSettingsPopup";
import { EditorSection, EditorRow } from "./BuildCardEditorSection";
import { useTranslation } from "../../i18n/locale";

type Props = {
  draft: BuildCardAppearance;
  onDraftChange: Dispatch<SetStateAction<BuildCardAppearance>>;
  onUploadImage: (file: File | null) => void;
};

export function BackgroundSection({ draft, onDraftChange, onUploadImage }: Props) {
  const tr = useTranslation();
  const [open, setOpen] = useState(true);
  const [fitOpen, setFitOpen] = useState(false);
  const [urlInput, setUrlInput] = useState(() =>
    draft.image && !draft.image.startsWith("data:") ? draft.image : "",
  );

  const mode = draft.backgroundMode;

  function switchMode(next: BuildCardBackgroundMode) {
    onDraftChange((prev) => {
      let image = prev.image;
      if (next === "color") image = "";
      if (next === "image" && image && !image.startsWith("data:")) image = "";
      if (next === "url" && image.startsWith("data:")) image = "";
      return { ...prev, backgroundMode: next, image };
    });
    if (next === "url") {
      setUrlInput(draft.image && !draft.image.startsWith("data:") ? draft.image : "");
    }
  }

  function applyUrl(raw: string) {
    const url = raw.trim();
    onDraftChange((prev) => ({ ...prev, image: url }));
  }

  function handleOpacityChange(v: number) {
    if (mode === "color") {
      onDraftChange((prev) => ({ ...prev, backgroundOpacity: v / 100 }));
      return;
    }
    if (mode === "draw") {
      onDraftChange((prev) => ({ ...prev, drawingOpacity: v / 100 }));
      return;
    }
    onDraftChange((prev) => ({ ...prev, imageOpacity: v / 100 }));
  }

  const fitWhole = tr("buildCardEditorBackground.fitWholeImage");
  const fillCard = tr("buildCardEditorBackground.fillCard");
  const fitLabel = draft.imageFit === "stretch" ? fitWhole : fillCard;
  const opacityValue =
    mode === "color"
      ? Math.round(draft.backgroundOpacity * 100)
      : mode === "draw"
        ? Math.round(draft.drawingOpacity * 100)
        : Math.round(draft.imageOpacity * 100);

  const fitRow = (
    <EditorRow label={tr("buildCardEditorBackground.fit")}>
      <div className="bce-dropdown">
        <InlineDropdown
          label={tr("buildCardEditorBackground.imageFit")}
          value={fitLabel}
          options={[fillCard, fitWhole]}
          isOpen={fitOpen}
          onToggle={() => setFitOpen((prev) => !prev)}
          onSelect={(val) => {
            onDraftChange((prev) => ({
              ...prev,
              imageFit: val === fitWhole ? "stretch" : "cover",
            }));
            setFitOpen(false);
          }}
        />
      </div>
    </EditorRow>
  );

  const opacityRow = (
    <EditorRow label={tr("buildCardEditorBackground.opacity")}>
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
  );

  return (
    <EditorSection
      title={tr("buildCardEditorBackground.background")}
      open={open}
      onToggle={() => setOpen((prev) => !prev)}
    >
      <EditorRow label={tr("buildCardEditorBackground.type")}>
        <div className="bce-mode-switch">
          {(["color", "image", "url", "draw"] as BuildCardBackgroundMode[]).map((entry) => (
            <button
              key={entry}
              type="button"
              className={`bce-mode-pill ${mode === entry ? "bce-mode-pill--active" : ""}`}
              onClick={() => switchMode(entry)}
            >
              {entry === "color"
                ? tr("buildCardEditorBackground.color")
                : entry === "image"
                  ? tr("buildCardEditorBackground.image")
                  : entry === "url"
                    ? "URL"
                    : tr("buildCardEditorBackground.draw")}
            </button>
          ))}
        </div>
      </EditorRow>

      {mode === "color" && (
        <>
          <EditorRow label={tr("buildCardEditorBackground.color")} alignTop>
            <ColorPicker
              value={draft.backgroundColor}
              onChange={(hex) => onDraftChange((prev) => ({ ...prev, backgroundColor: hex }))}
            />
          </EditorRow>
          {opacityRow}
        </>
      )}

      {mode === "image" && (
        <>
          <EditorRow label={tr("buildCardEditorBackground.source")} alignTop>
            <div className="bce-upload-area">
              <label className={`bce-upload-btn ${draft.image ? "bce-upload-btn--has-image" : ""}`}>
                {draft.image ? (
                  <>
                    <img className="bce-upload-thumb" src={draft.image} alt="" />
                    {tr("buildCardEditorBackground.changeImage")}
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
                    {tr("buildCardEditorBackground.uploadImage")}
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
                  {tr("buildCardEditorBackground.clearImage")}
                </button>
              )}
            </div>
          </EditorRow>
          {fitRow}
          {opacityRow}
        </>
      )}

      {mode === "url" && (
        <>
          <EditorRow label="URL">
            <TextField
              className="bce-url-input"
              type="url"
              placeholder="https://..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onBlur={(e) => applyUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyUrl(urlInput);
              }}
            />
          </EditorRow>
          {fitRow}
          {opacityRow}
        </>
      )}

      {mode === "draw" && (
        <>
          <EditorRow label={tr("buildCardEditorBackground.canvas")} alignTop>
            <p className="bce-drawing-hint">{tr("buildCardEditorBackground.drawDirectlyOnThe")}</p>
          </EditorRow>
          {opacityRow}
        </>
      )}
    </EditorSection>
  );
}
