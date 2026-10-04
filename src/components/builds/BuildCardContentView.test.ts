import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuildCardContentView, resolveBuildCardTags } from "./BuildCardContentView";
import { normalizeBuildCardAppearance, type BuildCardAppearance } from "./BuildCardSettingsPopup";

const values: Record<string, string> = {
  build_version: "1.20.1",
  build_loader: "Fabric",
  build_ram: "12 GB",
  build_last_played: "Aug 25, 2026",
};
const resolve = (template: string) =>
  template.replace(/(\^)?%([a-z_]+)%/g, (_token, uppercase, key: string) =>
    uppercase ? values[key].toUpperCase() : values[key],
  );

function renderContent(appearance: BuildCardAppearance) {
  return renderToStaticMarkup(
    createElement(BuildCardContentView, {
      mode: appearance.contentMode,
      align: appearance.contentTextAlign,
      tags: resolveBuildCardTags(appearance, resolve),
      appearance,
      strokeEnabled: appearance.contentTextStrokeEnabled,
    }),
  );
}

describe("shared build card content", () => {
  it("uses edited text, size and position in both gray text and styled tags", () => {
    const appearance = normalizeBuildCardAppearance({
      contentTags: [{ id: "build-card-tag-version", text: "My build", fontSize: 18 }],
      layoutOffsets: { "build-card-tag-version": { x: 24, y: 12 } },
      elementScales: { "build-card-tag-version": 1.5 },
    });

    const plain = renderContent(appearance);
    const styled = renderContent({ ...appearance, contentEnabled: true });
    for (const markup of [plain, styled]) {
      expect(markup).toContain("My build");
      expect(markup).toContain("left:24px");
      expect(markup).toContain("top:12px");
      expect(markup).toContain("transform:scale(1.5)");
      expect(markup).not.toContain("1.20.1");
    }
    expect(plain).toContain("build-card-plain-text");
    expect(plain).toContain("color:var(--text-alt)");
    expect(plain).not.toContain("background-color");
    expect(styled).toContain('class="build-card-tag');
    expect(styled).toContain("background-color");
  });

  it("keeps the existing natural casing for gray metadata and uppercase tag formatting", () => {
    const appearance = normalizeBuildCardAppearance({});
    const plain = resolveBuildCardTags(appearance, resolve);
    const styled = resolveBuildCardTags({ ...appearance, contentEnabled: true }, resolve);

    expect(plain.map((tag) => tag.text)).toEqual(["1.20.1", "Fabric", "12 GB", "Aug 25, 2026"]);
    expect(styled.map((tag) => tag.text)).toEqual(["1.20.1", "FABRIC", "12 GB", "AUG 25, 2026"]);
    expect(plain.map((tag) => tag.id)).toEqual(styled.map((tag) => tag.id));
  });

  it("uses the edited list and does not resurrect removed elements when content is off", () => {
    const appearance = normalizeBuildCardAppearance({
      contentTags: [{ id: "custom", text: "Extra info" }],
    });
    expect(renderContent(appearance)).toContain("Extra info");
    expect(renderContent({ ...appearance, contentEnabled: true })).toContain("Extra info");
    expect(renderContent({ ...appearance, contentTags: [] })).toBe("");
  });

  it("returns to the shared gray text when the styled plain-text mode is disabled", () => {
    const appearance = normalizeBuildCardAppearance({ contentMode: "text" });
    const plain = renderContent(appearance);
    const styled = renderContent({ ...appearance, contentEnabled: true });

    expect(plain).toContain("build-card-content--plain");
    expect(plain).not.toContain("build-card-content-separator");
    expect(styled).toContain("build-card-content--text");
    expect(styled).toContain("build-card-content-separator");
  });
});
