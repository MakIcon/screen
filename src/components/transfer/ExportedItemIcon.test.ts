import { describe, expect, it } from "vitest";
import { fileBadge, fileTypeLabel } from "./ExportedItemIcon";

describe("transfer file badges", () => {
  it("distinguishes content files from scripts, images, and text", () => {
    expect(fileBadge("mods/client.json", "mrpack")).toMatchObject({ label: "J", kind: "json" });
    expect(fileBadge("mods/main.js", "mrpack")).toMatchObject({ label: "JS", kind: "js" });
    expect(fileBadge("mods/example_item.png", "mrpack")).toMatchObject({
      label: "PNG",
      kind: "image",
    });
    expect(fileBadge("README.txt", "mrpack")).toMatchObject({ label: "T", kind: "text" });
    expect(fileTypeLabel("mods/client.json", "mrpack")).toBe("JSON");
    expect(fileBadge("mods/settings.xml", "mrpack").label).toBe("XML");
    expect(fileTypeLabel("mods/settings.xml", "mrpack")).toBe("XML");
    expect(fileTypeLabel("fabric-api.jar", "local")).toBe("LOCAL");
    expect(fileTypeLabel("resourcepack.zip", "local")).toBe("LOCAL");
    expect(fileTypeLabel("client.json", "local")).toBe("LOCAL");
    expect(fileTypeLabel("client.json", "mrpack")).toBe("JSON");
  });
});
