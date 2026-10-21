import { describe, expect, it, vi } from "vitest";
import type { InstanceItem, ModrinthSearchResponse } from "../../types";
import { searchPaletteCatalog } from "./paletteCatalog";

const build = { id: "fabric", version: "1.21.1", loader: "Fabric" } as InstanceItem;
const page = (id: string) =>
  ({ hits: [{ projectId: id, title: id }], totalHits: 1 }) as ModrinthSearchResponse;

describe("palette catalog", () => {
  it("searches all available content kinds using the selected build compatibility", async () => {
    const request = vi.fn(async (command: string) => page(command));
    const result = await searchPaletteCatalog(
      "Sodium",
      { mods: build, resourcepacks: build, shaders: build },
      undefined,
      request,
    );
    expect(request).toHaveBeenCalledWith("search_modrinth_mods", {
      instanceId: "fabric",
      query: "Sodium",
      offset: 0,
      limit: 4,
    });
    expect(request).toHaveBeenCalledWith("search_modrinth_resourcepacks", {
      instanceId: "fabric",
      query: "Sodium",
      gameVersion: "1.21.1",
      offset: 0,
      limit: 4,
    });
    expect(result.projects.map(({ kind }) => kind)).toEqual(["mods", "resourcepacks", "shaders"]);
  });
  it("does not send invalid searches without a compatible target", async () => {
    const request = vi.fn(async (_command: string, _args: Record<string, unknown>) => page("pack"));
    await searchPaletteCatalog(
      "Faithful",
      { mods: null, resourcepacks: build, shaders: null },
      undefined,
      request,
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("search_modrinth_resourcepacks");
    request.mockClear();
    expect(
      await searchPaletteCatalog(
        "test",
        { mods: null, resourcepacks: null, shaders: null },
        undefined,
        request,
      ),
    ).toEqual({ projects: [], failed: [] });
    expect(request).not.toHaveBeenCalled();
  });
  it("scopes a resource pack query and keeps working when another catalog fails", async () => {
    const request = vi.fn(async (command: string) => {
      if (command === "search_modrinth_mods") throw new Error("offline");
      return page("pack");
    });
    const targets = { mods: build, resourcepacks: build, shaders: null };
    expect((await searchPaletteCatalog("test", targets, undefined, request)).failed).toEqual([
      "mods",
    ]);
    request.mockClear();
    const result = await searchPaletteCatalog("Faithful", targets, "resourcepacks", request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.projects[0].kind).toBe("resourcepacks");
    expect(result.failed).toEqual([]);
  });
});
