import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { ColorPicker } from "../color-picker/ColorPicker";
import { getBuildCardBadgeVisibility, type BuildCardAppearance } from "./BuildCardSettingsPopup";
import { EditorSection, EditorRow } from "./BuildCardEditorSection";
import { BuildPlaceholderCaseControl } from "./BuildPlaceholderCaseControl";
import { PlaceholderGuideButton } from "../placeholders/PlaceholderGuideButton";

type Props = {
  draft: BuildCardAppearance;
  onDraftChange: Dispatch<SetStateAction<BuildCardAppearance>>;
};

export function BadgeSection({ draft, onDraftChange }: Props) {
  const [open, setOpen] = useState(true);
  const visibility = getBuildCardBadgeVisibility(draft);

  return (
    <EditorSection title="Badge" open={open} onToggle={() => setOpen((prev) => !prev)}>
      <EditorRow label="Enable">
        <div className="bce-mode-switch">
          <button
            type="button"
            className={`bce-mode-pill ${draft.badgeEnabled ? "bce-mode-pill--active" : ""}`}
            onClick={() => onDraftChange((prev) => ({ ...prev, badgeEnabled: true }))}
          >
            On
          </button>
          <button
            type="button"
            className={`bce-mode-pill ${!draft.badgeEnabled ? "bce-mode-pill--active" : ""}`}
            onClick={() => onDraftChange((prev) => ({ ...prev, badgeEnabled: false }))}
          >
            Off
          </button>
        </div>
      </EditorRow>

      <EditorRow label="Visible">
        <div className="bce-mode-switch">
          {(["on", "off", "always"] as const).map((vis) => (
            <button
              key={vis}
              type="button"
              className={`bce-mode-pill ${visibility === vis ? "bce-mode-pill--active" : ""}`}
              onClick={() => onDraftChange((prev) => ({ ...prev, badgeVisibility: vis }))}
            >
              {vis === "on" ? "On" : vis === "off" ? "Off" : "Always"}
            </button>
          ))}
        </div>
      </EditorRow>

      <EditorRow label="Text">
        <div className="bce-placeholder-field">
          <input
            className="bce-text-input bce-badge-text-input"
            type="text"
            maxLength={22}
            placeholder="^%build_state%"
            value={draft.badgeText}
            onChange={(e) => onDraftChange((prev) => ({ ...prev, badgeText: e.target.value }))}
          />
          <BuildPlaceholderCaseControl
            value={draft.badgeText}
            maxLength={22}
            onChange={(badgeText) => onDraftChange((prev) => ({ ...prev, badgeText }))}
          />
          <PlaceholderGuideButton compact />
        </div>
      </EditorRow>

      <EditorRow label="Bg Color" alignTop>
        <ColorPicker
          value={draft.badgeColor}
          onChange={(hex) => onDraftChange((prev) => ({ ...prev, badgeColor: hex }))}
        />
      </EditorRow>

      <EditorRow label="Text Color" alignTop>
        <ColorPicker
          value={draft.badgeTextColor}
          onChange={(hex) => onDraftChange((prev) => ({ ...prev, badgeTextColor: hex }))}
        />
      </EditorRow>
    </EditorSection>
  );
}
