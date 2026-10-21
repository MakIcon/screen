import { describe, expect, it, vi } from "vitest";
import { translateFor } from "../../i18n/locale";
import { createSettingsCommands } from "./settingsCommands";
import { filterPaletteCommands } from "./commandSearch";

describe("searchable settings", () => {
  it("finds individual settings by Russian and English aliases", () => {
    const reveal = vi.fn();
    const commands = createSettingsCommands(
      (key, ...args) => translateFor("ru", key, ...args),
      reveal,
    );
    expect(filterPaletteCommands(commands, "память")[0].id).toBe("settings-ram");
    expect(filterPaletteCommands(commands, "language")[0].id).toBe("settings-language");
    expect(filterPaletteCommands(commands, "g1gc")[0].id).toBe("settings-optimized");
    expect(reveal).not.toHaveBeenCalled();
    filterPaletteCommands(commands, "маскот имя")[0].run();
    expect(reveal).toHaveBeenCalledWith("settings-mascot-name");
  });
});
