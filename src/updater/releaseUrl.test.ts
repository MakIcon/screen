import { describe, expect, it } from "vitest";
import { launcherReleaseUrl } from "./releaseUrl";

describe("launcher release links", () => {
  it("opens the exact tag used by the update, including custom tags", () => {
    expect(
      launcherReleaseUrl("0.3.0", {
        platforms: {
          "windows-x86_64": {
            url: "https://github.com/MakIcon/screen/releases/download/launcher%2F0.3.0/ScreenLauncher.exe",
          },
        },
      }),
    ).toBe("https://github.com/MakIcon/screen/releases/tag/launcher%2F0.3.0");
  });

  it("supports a dynamic updater manifest", () => {
    expect(
      launcherReleaseUrl("0.3.0", {
        url: "https://github.com/MakIcon/screen/releases/download/v0.3.0/ScreenLauncher.exe",
      }),
    ).toBe("https://github.com/MakIcon/screen/releases/tag/v0.3.0");
  });

  it.each([
    {},
    { platforms: null },
    { platforms: { windows: null } },
    { url: "invalid URL" },
    { url: "https://example.com/MakIcon/screen/releases/download/v9.9.9/setup.exe" },
    { url: "https://github.com/MakIcon/screen/releases/latest" },
  ])("falls back to the checked version when metadata is missing or invalid: %j", (manifest) => {
    expect(launcherReleaseUrl("0.3.0-beta.1", manifest)).toBe(
      "https://github.com/MakIcon/screen/releases/tag/v0.3.0-beta.1",
    );
  });
});
