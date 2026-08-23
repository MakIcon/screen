import { describe, expect, it } from "vitest";
import {
  createPlaceholderAppearanceAttributes,
  resolveAppearancePlaceholderTemplate,
  resolvePlaceholders,
  type PlaceholderContext,
} from "./placeholders";

const context: PlaceholderContext = {
  systemRamGb: 64,
  playerName: "Makar",
  buildName: "Fabric Pack",
  buildVersion: "1.21.1",
  buildLoader: "fabric",
  buildRam: 12,
  buildPlaytimeSecs: 3_600,
  buildLastPlayed: "0",
  buildStatus: "ready",
  buildState: "running",
  accountType: "offline",
  totalPlaytimeSecs: 7_200,
  totalBuilds: 3,
};

describe("appearance placeholders", () => {
  it("resolves player name and the legacy nickname alias", () => {
    expect(resolvePlaceholders("%player_name% / %nickname%", context)).toBe("Makar / Makar");
  });

  it("keeps the template while resolving a newly selected live token", () => {
    const resolve = (template: string) => resolvePlaceholders(template, context);
    const appearance = createPlaceholderAppearanceAttributes("%build_name%", resolve);

    expect(appearance["data-appearance-text-template"]).toBe("%build_name%");
    expect(
      resolveAppearancePlaceholderTemplate(
        "PLAYER: ^%player_name% · %system_ram%",
        appearance["data-appearance-placeholder-values"],
      ),
    ).toBe("PLAYER: MAKAR · 64 GB");
  });
});
