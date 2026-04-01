import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import "./BuildCardSettingsPopup.css";
import { InlineDropdown } from "../inputs/InlineDropdown";
import { ElementSlider } from "../inputs/ElementSlider";

export type BuildCardImageFit = "cover" | "stretch";

export type BuildCardAppearance = {
  image: string;
  imageFit: BuildCardImageFit;
  imageOpacity: number;
  backgroundColor: string;
  backgroundOpacity: number;
};

export const DEFAULT_BUILD_CARD_APPEARANCE: BuildCardAppearance = {
  image: "",
  imageFit: "cover",
  imageOpacity: 0.78,
  backgroundColor: "#1a1a1a",
  backgroundOpacity: 0,
};

function clampUnit(value: number, fallback: number) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function normalizeHexColor(value: string | undefined) {
  const raw = (value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return DEFAULT_BUILD_CARD_APPEARANCE.backgroundColor;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = normalizeHexColor(hex);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${clampUnit(alpha, 1)})`;
}

export function normalizeBuildCardAppearance(value: unknown): BuildCardAppearance {
  if (typeof value === "string") {
    return {
      ...DEFAULT_BUILD_CARD_APPEARANCE,
      image: value,
    };
  }

  if (!value || typeof value !== "object") {
    return { ...DEFAULT_BUILD_CARD_APPEARANCE };
  }

  const draft = value as Partial<BuildCardAppearance>;
  return {
    image: typeof draft.image === "string" ? draft.image : "",
    imageFit: draft.imageFit === "stretch" ? "stretch" : "cover",
    imageOpacity: clampUnit(
      typeof draft.imageOpacity === "number"
        ? draft.imageOpacity
        : DEFAULT_BUILD_CARD_APPEARANCE.imageOpacity,
      DEFAULT_BUILD_CARD_APPEARANCE.imageOpacity,
    ),
    backgroundColor: normalizeHexColor(draft.backgroundColor),
    backgroundOpacity: clampUnit(
      typeof draft.backgroundOpacity === "number"
        ? draft.backgroundOpacity
        : DEFAULT_BUILD_CARD_APPEARANCE.backgroundOpacity,
      DEFAULT_BUILD_CARD_APPEARANCE.backgroundOpacity,
    ),
  };
}

export function getBuildCardAppearanceStyle(
  appearance?: BuildCardAppearance | null,
): CSSProperties | undefined {
  if (!appearance) return undefined;

  const hasImage = Boolean(appearance.image);
  const safeImageOpacity = clampUnit(
    appearance.imageOpacity,
    DEFAULT_BUILD_CARD_APPEARANCE.imageOpacity,
  );
  const imageFade = hexToRgba("#f8f7f2", 1 - safeImageOpacity);
  const safeBgOpacity = clampUnit(
    appearance.backgroundOpacity,
    DEFAULT_BUILD_CARD_APPEARANCE.backgroundOpacity,
  );

  return {
    backgroundColor:
      safeBgOpacity > 0
        ? hexToRgba(appearance.backgroundColor, safeBgOpacity)
        : undefined,
    backgroundImage: hasImage
      ? `linear-gradient(${imageFade}, ${imageFade}), url(${appearance.image})`
      : undefined,
    backgroundSize: hasImage
      ? appearance.imageFit === "stretch"
        ? "100% 100%, 100% 100%"
        : "cover, cover"
      : undefined,
    backgroundPosition: hasImage ? "center, center" : undefined,
    backgroundRepeat: hasImage ? "no-repeat, no-repeat" : undefined,
  };
}

export function SettingsGearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 3.75L13.089 5.915C13.265 6.265 13.596 6.51 13.982 6.576L16.375 6.983L14.664 8.72C14.389 8.999 14.263 9.391 14.327 9.777L14.727 12.188L12.589 11.086C12.244 10.908 11.834 10.908 11.489 11.086L9.351 12.188L9.751 9.777C9.815 9.391 9.689 8.999 9.414 8.72L7.703 6.983L10.096 6.576C10.482 6.51 10.813 6.265 10.989 5.915L12 3.75Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.248 9.37L6.807 10.022C7.129 10.157 7.361 10.44 7.429 10.78L7.759 12.441L6.52 13.627C6.269 13.867 6.159 14.223 6.227 14.564L6.569 16.259L5.066 15.426C4.758 15.255 4.385 15.236 4.061 15.374L2.5 16.039L2.79 14.37C2.849 14.032 2.751 13.686 2.527 13.426L1.5 12.236L3.24 11.98C3.592 11.928 3.898 11.715 4.046 11.391L5.248 9.37Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d="M18.752 9.37L17.193 10.022C16.871 10.157 16.639 10.44 16.571 10.78L16.241 12.441L17.48 13.627C17.731 13.867 17.841 14.223 17.773 14.564L17.431 16.259L18.934 15.426C19.242 15.255 19.615 15.236 19.939 15.374L21.5 16.039L21.21 14.37C21.151 14.032 21.249 13.686 21.473 13.426L22.5 12.236L20.76 11.98C20.408 11.928 20.102 11.715 19.954 11.391L18.752 9.37Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <circle cx="12" cy="14.25" r="2.75" stroke="currentColor" strokeWidth="1.55" />
    </svg>
  );
}

type Props = {
  isCreateMode: boolean;
  buildName: string;
  buildVersion: string;
  buildLoader: string;
  buildRamGb: number;
  lastPlayedLabel: string;
  draft: BuildCardAppearance;
  onDraftChange: Dispatch<SetStateAction<BuildCardAppearance>>;
  onUploadImage: (file: File | null) => void;
  onResetAll: () => void;
  onClose: () => void;
  onSave: () => void;
};

export function BuildCardSettingsPopup({
  isCreateMode,
  buildName,
  buildVersion,
  buildLoader,
  buildRamGb,
  lastPlayedLabel,
  draft,
  onDraftChange,
  onUploadImage,
  onResetAll,
  onClose,
  onSave,
}: Props) {
  const [openDropdown, setOpenDropdown] = useState(false);

  const fitValue = useMemo(
    () => (draft.imageFit === "stretch" ? "FIT WHOLE IMAGE" : "FILL CARD"),
    [draft.imageFit],
  );

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div
        className="confirm-dialog build-card-settings-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="confirm-label">
          {isCreateMode ? "CREATE BUILD SETTINGS" : "BUILD SETTINGS"}
        </span>
        <p className="confirm-title">{buildName}</p>
        <p className="confirm-body">
          Настрой фон карточки версии: картинку, режим заполнения, прозрачность фото, цвет фона и его прозрачность.
        </p>

        <div className="build-card-preview-wrap">
          <div
            className={`instance-card build-card-preview ${draft.image ? "instance-card-with-image" : ""}`}
            style={getBuildCardAppearanceStyle(draft)}
          >
            <div className="instance-card-top">
              <span className="instance-name">{buildName}</span>
              <span className="instance-running-badge build-card-preview-badge">
                PREVIEW
              </span>
            </div>
            <div className="instance-card-meta">
              <span>{buildVersion}</span>
              <span>{buildLoader}</span>
              <span>{buildRamGb} GB</span>
              <span>{lastPlayedLabel}</span>
            </div>
          </div>
        </div>

        <div className="build-card-upload-row">
          <label className="ghost-action build-card-upload-button">
            UPLOAD IMAGE
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                onUploadImage(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
              hidden
            />
          </label>
          <button
            className="ghost-action"
            type="button"
            onClick={() =>
              onDraftChange((prev) => ({
                ...prev,
                image: "",
              }))
            }
          >
            CLEAR IMAGE
          </button>
          <button className="ghost-action" type="button" onClick={onResetAll}>
            RESET ALL
          </button>
        </div>

        <div className="build-card-controls-grid">
          <div className="build-card-dropdown-field">
            <InlineDropdown
              label="IMAGE FIT"
              value={fitValue}
              options={["FILL CARD", "FIT WHOLE IMAGE"]}
              isOpen={openDropdown}
              onToggle={() => setOpenDropdown((prev) => !prev)}
              onSelect={(value) => {
                onDraftChange((prev) => ({
                  ...prev,
                  imageFit: value === "FIT WHOLE IMAGE" ? "stretch" : "cover",
                }));
                setOpenDropdown(false);
              }}
            />
          </div>

          <label className="field compact-field build-card-color-field">
            <span>BACKGROUND COLOR</span>
            <input
              type="color"
              value={draft.backgroundColor}
              onChange={(e) =>
                onDraftChange((prev) => ({
                  ...prev,
                  backgroundColor: e.target.value,
                }))
              }
            />
          </label>

          <div className="field compact-field build-card-slider-field">
            <span>IMAGE OPACITY — {Math.round(draft.imageOpacity * 100)}%</span>
            <ElementSlider
              showHeader={false}
              min={0}
              max={100}
              step={10}
              value={Math.round(draft.imageOpacity * 100)}
              tickMode="every"
              onChange={(value) =>
                onDraftChange((prev) => ({
                  ...prev,
                  imageOpacity: Number(value) / 100,
                }))
              }
            />
          </div>

          <div className="field compact-field build-card-slider-field">
            <span>BACKGROUND OPACITY — {Math.round(draft.backgroundOpacity * 100)}%</span>
            <ElementSlider
              showHeader={false}
              min={0}
              max={100}
              step={10}
              value={Math.round(draft.backgroundOpacity * 100)}
              tickMode="every"
              onChange={(value) =>
                onDraftChange((prev) => ({
                  ...prev,
                  backgroundOpacity: Number(value) / 100,
                }))
              }
            />
          </div>
        </div>

        <div className="confirm-actions">
          <button className="primary-action" type="button" onClick={onSave}>
            SAVE
          </button>
          <button className="ghost-action" type="button" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
