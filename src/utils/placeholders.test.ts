import { describe, expect, it } from "vitest";
import {
  createPlaceholderAppearanceAttributes,
  createPlaceholderTokenVariant,
  createPlaceholderValueAttributes,
  getPlaceholderTemplateCase,
  resolveAppearancePlaceholderTemplate,
  resolvePlaceholders,
  setPlaceholderTemplateCase,
  tokenizePlaceholderTemplate,
  type PlaceholderContext,
} from "./placeholders";

const context: PlaceholderContext = {
  launcherName: "ScreenLauncher",
  launcherRamGb: 12,
  systemRamGb: 64,
  playerName: "Makar",
  buildName: "Fabric Pack",
  buildVersion: "1.21.1",
  buildLoader: "fabric",
  buildLoaderVersion: "0.16.14",
  buildRam: 12,
  buildPlaytimeSecs: 3_600,
  buildLastPlayed: "0",
  buildCreatedAt: "0",
  buildStatus: "ready",
  buildState: "running",
  buildSource: "official",
  accountType: "offline",
  totalPlaytimeSecs: 7_200,
  totalBuilds: 3,
  totalModdedBuilds: 2,
  totalVanillaBuilds: 1,
  totalAllocatedRamGb: 28,
};

describe("appearance placeholders", () => {
  it("resolves player name and the legacy nickname alias", () => {
    expect(resolvePlaceholders("%player_name% / %nickname%", context)).toBe("Makar / Makar");
  });

  it("resolves the expanded build and library catalogue with friendly values", () => {
    expect(
      resolvePlaceholders(
        "%build_full_loader% · %build_ram% · %build_source% · %total_modded_builds%",
        context,
      ),
    ).toBe("Fabric 0.16.14 · 12 GB · Official · 2");
    expect(resolvePlaceholders("%minecraft_version% / ^%loader_version%", context)).toBe(
      "1.21.1 / 0.16.14",
    );
    expect(
      resolvePlaceholders("%launcher_ram% / %launcher_ram_value% / %build_ram_value%", context),
    ).toBe("12 GB / 12 / 12");
  });

  it("keeps the template while resolving a newly selected live token", () => {
    const resolve = (template: string) => resolvePlaceholders(template, context);
    const appearance = createPlaceholderAppearanceAttributes("%build_name%", resolve);
    const values = createPlaceholderValueAttributes(resolve);

    expect(appearance["data-appearance-text-template"]).toBe("%build_name%");
    expect(
      resolveAppearancePlaceholderTemplate(
        "PLAYER: ^%player_name% · %system_ram%",
        values["data-appearance-placeholder-values"],
      ),
    ).toBe("PLAYER: MAKAR · 64 GB");
  });

  it("publishes canonical and alias values for arbitrary Studio text targets", () => {
    const resolve = (template: string) => resolvePlaceholders(template, context);
    const values = JSON.parse(
      createPlaceholderValueAttributes(resolve)["data-appearance-placeholder-values"],
    ) as Record<string, string>;

    expect(values.player_name).toBe("Makar");
    expect(values.nickname).toBe("Makar");
    expect(values.build_loader_version).toBe("0.16.14");
    expect(values.total_allocated_ram).toBe("28 GB");
  });

  it("serializes one scoped value map instead of resolving every text span separately", () => {
    let resolveCalls = 0;
    const resolve = (template: string) => {
      resolveCalls += 1;
      return resolvePlaceholders(template, context);
    };

    const first = createPlaceholderValueAttributes(resolve);
    const second = createPlaceholderValueAttributes(resolve);
    const textOnly = createPlaceholderAppearanceAttributes("%build_loader%", resolve);

    expect(resolveCalls).toBe(1);
    expect(second).toBe(first);
    expect(textOnly).toEqual({ "data-appearance-text-template": "%build_loader%" });
  });

  it("tokenizes known, aliased and unknown placeholders for Studio highlighting", () => {
    const segments = tokenizePlaceholderTemplate(
      "Hello ^%nickname% on %build_loader% / %not_a_real_token%",
    );
    const placeholders = segments.filter((segment) => segment.type === "placeholder");

    expect(placeholders).toHaveLength(3);
    expect(placeholders[0]).toMatchObject({ key: "nickname", uppercase: true });
    expect(placeholders[0]?.definition?.key).toBe("player_name");
    expect(placeholders[2]?.definition).toBeUndefined();
  });

  it("shares explicit natural-case and uppercase variants across editors", () => {
    expect(createPlaceholderTokenVariant("%build_state%", true)).toBe("^%build_state%");
    expect(createPlaceholderTokenVariant("^%build_state%", false)).toBe("%build_state%");
    expect(setPlaceholderTemplateCase("State: %build_state% / ^%build_loader%", "uppercase")).toBe(
      "State: ^%build_state% / ^%build_loader%",
    );
    expect(setPlaceholderTemplateCase("State: ^%build_state%", "value")).toBe(
      "State: %build_state%",
    );
    expect(getPlaceholderTemplateCase("%build_state% / ^%build_loader%")).toBe("mixed");
    expect(getPlaceholderTemplateCase("plain text")).toBe("none");
  });
});
