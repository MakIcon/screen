import type { CSSProperties } from "react";
import type {
  BuildCardContentMode,
  BuildCardContentTag,
  BuildCardTextAlign,
} from "./BuildCardSettingsPopup";

type Props = {
  mode: BuildCardContentMode;
  align: BuildCardTextAlign;
  tags: BuildCardContentTag[];
};

function alphaColor(hex: string, opacity: number) {
  const normalizedOpacity = Math.max(0, Math.min(100, opacity));
  const alpha = Math.round((normalizedOpacity / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
}

function getJustifyContent(align: BuildCardTextAlign): CSSProperties["justifyContent"] {
  if (align === "center") return "center";
  if (align === "right") return "flex-end";
  return "flex-start";
}

export function BuildCardContent({ mode, align, tags }: Props) {
  const visibleTags = tags.filter((tag) => tag.text.trim().length > 0);
  if (visibleTags.length === 0) return null;

  if (mode === "text") {
    return (
      <div
        className={`build-card-content build-card-content--text build-card-content--${align}`}
      >
        {visibleTags.map((tag, index) => (
          <span className="build-card-content-inline" key={tag.id}>
            {index > 0 && <span className="build-card-content-separator">·</span>}
            <span
              className="build-card-inline-tag"
              style={{
                color: alphaColor(tag.fillColor, tag.fillOpacity),
                WebkitTextStroke: `0.55px ${tag.borderColor}`,
                textShadow: `0 0 0 ${tag.borderColor}`,
                paintOrder: "stroke fill",
                fontSize: `${tag.fontSize}px`,
              }}
            >
              {tag.text}
            </span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`build-card-content build-card-content--tags build-card-content--${align}`}
      style={{ justifyContent: getJustifyContent(align) }}
    >
      {visibleTags.map((tag) => (
        <span
          className="build-card-tag"
          key={tag.id}
          style={{
            borderColor: tag.borderColor,
            backgroundColor: alphaColor(tag.fillColor, tag.fillOpacity),
            color: tag.borderColor,
            fontSize: `${tag.fontSize}px`,
          }}
        >
          {tag.text}
        </span>
      ))}
    </div>
  );
}
