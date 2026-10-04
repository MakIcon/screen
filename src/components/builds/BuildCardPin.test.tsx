import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuildCardPin } from "./BuildCardPin";
import { normalizeBuildCardAppearance } from "./BuildCardSettingsPopup";

describe("build card pin", () => {
  it("shows the pin for editing and only on pinned cards in the library", () => {
    const appearance = normalizeBuildCardAppearance({});

    expect(renderToStaticMarkup(<BuildCardPin appearance={appearance} />)).toContain("pin-icon");
    expect(renderToStaticMarkup(<BuildCardPin appearance={appearance} pinned />)).toContain(
      "pin-icon",
    );
    expect(renderToStaticMarkup(<BuildCardPin appearance={appearance} pinned={false} />)).toBe("");
  });

  it("uses the saved position and size in the editor and the library after reload", () => {
    const saved = JSON.stringify({
      layoutOffsets: { pin: { x: -36, y: 24 } },
      elementScales: { pin: 2 },
    });
    const appearance = normalizeBuildCardAppearance(JSON.parse(saved));
    const preview = renderToStaticMarkup(<BuildCardPin appearance={appearance} movable selected />);
    const card = renderToStaticMarkup(<BuildCardPin appearance={appearance} pinned />);

    for (const markup of [preview, card]) {
      expect(markup).toContain("left:-36px");
      expect(markup).toContain("top:24px");
      expect(markup).toContain("transform:scale(2)");
      expect(markup).toContain("data-card-layout-element");
    }
    expect(preview).toContain('data-card-move-id="pin"');
    expect(preview).toContain('data-card-resize-id="pin"');
    expect(preview).toContain('tabindex="0"');
    expect(card).not.toContain("data-card-move-id");
    expect(card).not.toContain("<button");
  });

  it("keeps the saved card anchor when the running badge is hidden", () => {
    const saved = JSON.stringify({
      pinAnchor: { right: 150, top: 24 },
      layoutOffsets: { pin: { x: -36, y: 24 } },
      elementScales: { pin: 2 },
    });
    const appearance = normalizeBuildCardAppearance(JSON.parse(saved));
    const withBadge = renderToStaticMarkup(<BuildCardPin appearance={appearance} />);
    const withoutBadge = renderToStaticMarkup(
      <BuildCardPin appearance={{ ...appearance, badgeEnabled: false }} />,
    );

    expect(appearance.pinAnchor).toEqual({ right: 150, top: 24 });
    expect(withoutBadge).toBe(withBadge);
    expect(withoutBadge).toContain("position:absolute");
    expect(withoutBadge).toContain("left:calc(100% - 150px + -36px)");
    expect(withoutBadge).toContain("top:48px");
    expect(withoutBadge).toContain("transform:scale(2)");
  });

  it("leaves legacy and invalid anchors available for position migration", () => {
    for (const pinAnchor of [
      undefined,
      null,
      {},
      { right: Infinity, top: 0 },
      { right: 24, top: "0" },
    ]) {
      const appearance = normalizeBuildCardAppearance({
        pinAnchor,
        layoutOffsets: { pin: { x: -24, y: 12 } },
      });
      expect(appearance.pinAnchor).toBeNull();
      expect(appearance.layoutOffsets.pin).toEqual({ x: -24, y: 12 });
    }
  });
});
