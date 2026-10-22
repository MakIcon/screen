import { describe, expect, it } from "vitest";
import { appearanceText } from "./localization";
import { APPEARANCE_TEXT_KEYS } from "./localizationKeys";
import { CLOSE_ANIMATIONS, OPEN_ANIMATIONS, TAB_ANIMATIONS, UI_MOTION_STYLES } from "./animations";
import { GRADIENT_ANIMATIONS, GRADIENT_DIRECTIONS, GRADIENT_EASINGS } from "./gradientAnimation";
import { ELEMENT_INTERACTION_STATES } from "./elementState";
import { GRADIENT_PRESETS } from "./gradientPresets";

describe("appearance editor localization", () => {
  it("resolves labels for each language at render time", () => {
    expect(appearanceText("BACKGROUND", undefined, "ru")).toBe("ФОН");
    expect(appearanceText("BACKGROUND", undefined, "en")).toBe("BACKGROUND");
    expect(appearanceText("Origin {x}%, {y}%", { x: 50, y: 25 }, "ru")).toBe("Центр: 50%, 25%");
  });

  it("covers every animation, preset, and interaction caption", () => {
    const labels = [
      ...[
        ...CLOSE_ANIMATIONS,
        ...OPEN_ANIMATIONS,
        ...TAB_ANIMATIONS,
        ...UI_MOTION_STYLES,
        ...GRADIENT_ANIMATIONS,
        ...GRADIENT_DIRECTIONS,
        ...GRADIENT_EASINGS,
      ].map((option) => option.label),
      ...ELEMENT_INTERACTION_STATES.flatMap((state) => [state.label, state.note]),
      ...GRADIENT_PRESETS.flatMap((preset) => [preset.name, preset.detail]),
    ];
    for (const label of labels)
      expect(Object.prototype.hasOwnProperty.call(APPEARANCE_TEXT_KEYS, label), label).toBe(true);
  });

  it("preserves values supplied by the user when interpolating UI copy", () => {
    const name = "My Font <Custom>";
    expect(appearanceText("Remove {name}", { name }, "ru")).toBe(`Удалить «${name}»`);
    expect(appearanceText("Selected: {target}", { target: "BACKGROUND" }, "ru")).toBe(
      "Выбрано: BACKGROUND",
    );
  });
});
