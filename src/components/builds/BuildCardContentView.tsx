import type { CSSProperties } from "react";
import type {
  BuildCardAppearance,
  BuildCardContentMode,
  BuildCardContentTag,
  BuildCardTextAlign,
} from "./BuildCardSettingsPopup";
import { getBuildCardElementStyle } from "./BuildCardSettingsPopup";
import {
  createPlaceholderAppearanceAttributes,
  setPlaceholderTemplateCase,
  type PlaceholderAppearanceAttributes,
} from "../../utils/placeholders";
import { BuildCardResizeHandle } from "./BuildCardResizeHandle";

export type ResolvedBuildCardContentTag = BuildCardContentTag & {
  appearance?: PlaceholderAppearanceAttributes;
};

export function resolveBuildCardTags(
  appearance: BuildCardAppearance,
  resolve: (template: string) => string,
): ResolvedBuildCardContentTag[] {
  return appearance.contentTags.map((tag) => {
    const template = appearance.contentEnabled
      ? tag.text
      : setPlaceholderTemplateCase(tag.text, "value");
    return {
      ...tag,
      text: resolve(template),
      appearance: createPlaceholderAppearanceAttributes(template, resolve),
    };
  });
}

export function getBuildCardPlainContentStyle(tag: BuildCardContentTag): CSSProperties {
  return {
    // The original gray metadata uses 11px; default styled tags use 9px.
    fontSize: `${(tag.fontSize * 11) / 9}px`,
    color: "var(--text-alt)",
    fontWeight: "normal",
    letterSpacing: "1px",
  };
}

type Props = {
  mode: BuildCardContentMode;
  align: BuildCardTextAlign;
  tags: ResolvedBuildCardContentTag[];
  strokeEnabled?: boolean;
  appearance?: BuildCardAppearance;
  movable?: boolean;
  selectedElementId?: string | null;
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

export function BuildCardContentView({
  mode,
  align,
  tags,
  strokeEnabled = true,
  appearance,
  movable = false,
  selectedElementId,
}: Props) {
  const visibleTags = tags.filter((tag) => tag.text.trim().length > 0);
  if (visibleTags.length === 0) return null;

  if (appearance && !appearance.contentEnabled) {
    return (
      <div className="build-card-content build-card-content--plain">
        {visibleTags.map((tag) => (
          <span
            key={tag.id}
            className={`build-card-plain-text ${movable ? "build-card-movable" : ""} ${movable && selectedElementId === tag.id ? "build-card-movable--selected" : ""}`}
            data-card-layout-element
            data-card-move-id={movable ? tag.id : undefined}
            tabIndex={movable ? 0 : undefined}
            {...tag.appearance}
            style={{
              ...getBuildCardPlainContentStyle(tag),
              ...getBuildCardElementStyle(appearance, tag.id),
            }}
          >
            {tag.text}
            {movable && selectedElementId === tag.id && (
              <BuildCardResizeHandle appearance={appearance} id={tag.id} />
            )}
          </span>
        ))}
      </div>
    );
  }

  if (mode === "text") {
    return (
      <div className={`build-card-content build-card-content--text build-card-content--${align}`}>
        {visibleTags.map((tag, index) => (
          <span
            className={`build-card-content-inline ${movable ? "build-card-movable" : ""} ${movable && selectedElementId === tag.id ? "build-card-movable--selected" : ""}`}
            data-card-layout-element
            key={tag.id}
            data-card-move-id={movable ? tag.id : undefined}
            tabIndex={movable ? 0 : undefined}
            style={appearance ? getBuildCardElementStyle(appearance, tag.id) : undefined}
          >
            {index > 0 && <span className="build-card-content-separator">|</span>}
            <span
              className="build-card-inline-tag"
              {...tag.appearance}
              style={{
                color: alphaColor(tag.fillColor, tag.fillOpacity),
                WebkitTextStroke: strokeEnabled ? `0.55px ${tag.borderColor}` : undefined,
                textShadow: strokeEnabled ? `0 0 0 ${tag.borderColor}` : undefined,
                paintOrder: strokeEnabled ? "stroke fill" : undefined,
                fontSize: `${tag.fontSize}px`,
              }}
            >
              {tag.text}
            </span>
            {movable && appearance && selectedElementId === tag.id && (
              <BuildCardResizeHandle appearance={appearance} id={tag.id} />
            )}
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
          className={`build-card-tag ${movable ? "build-card-movable" : ""} ${movable && selectedElementId === tag.id ? "build-card-movable--selected" : ""}`}
          data-card-layout-element
          key={tag.id}
          data-card-move-id={movable ? tag.id : undefined}
          tabIndex={movable ? 0 : undefined}
          {...tag.appearance}
          style={{
            ...(appearance ? getBuildCardElementStyle(appearance, tag.id) : undefined),
            borderColor: tag.borderColor,
            backgroundColor: alphaColor(tag.fillColor, tag.fillOpacity),
            color: tag.textColor,
            fontSize: `${tag.fontSize}px`,
          }}
        >
          {tag.text}
          {movable && appearance && selectedElementId === tag.id && (
            <BuildCardResizeHandle appearance={appearance} id={tag.id} />
          )}
        </span>
      ))}
    </div>
  );
}
