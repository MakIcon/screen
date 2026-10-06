import { describe, expect, it } from "vitest";
import {
  reconcileConstellationNodes,
  constellationNodeIsFixed,
  type NodeKind,
  type SimNode,
} from "./constellationState";

function installed(filename: string, kind: NodeKind = "mod", projectId = filename): SimNode {
  return {
    id: `${kind}:${filename}`,
    kind,
    filename,
    iconKey: projectId,
    label: filename,
    author: "Author",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 20,
    pinned: false,
  };
}

function moving(filename: string): SimNode {
  return { ...installed(filename), x: 312, y: 185, vx: 2.5, vy: -1.2, pinned: true };
}

describe("constellation continuity", () => {
  it("keeps surviving objects and their motion when content is added or removed", () => {
    const kept = moving("kept.jar");
    const removed = moving("removed.jar");
    const next = reconcileConstellationNodes(
      [removed, kept],
      [installed("new.jar"), installed("kept.jar")],
      new Set(),
    );
    expect(next[0]).toBe(kept);
    expect(next.map((node) => node.filename)).toEqual(["kept.jar", "new.jar"]);
    expect(kept).toMatchObject({ x: 312, y: 185, vx: 2.5, vy: -1.2, pinned: true });
  });

  it.each<NodeKind>(["mod", "shader", "pack"])(
    "keeps a caught %s in place when its installed filename arrives",
    (kind) => {
      const caught: SimNode = {
        ...moving("unused"),
        id: `${kind}:project`,
        iconKey: "project",
        kind,
        filename: null,
        status: "installing",
      };
      const pending = new Set([caught]);
      expect(reconcileConstellationNodes([caught], [], pending)).toEqual([caught]);
      const next = reconcileConstellationNodes(
        [caught],
        [{ ...installed("downloaded.zip", kind, "project"), status: "ok" }],
        pending,
      );
      expect(next).toHaveLength(1);
      expect(next[0]).toBe(caught);
      expect(caught).toMatchObject({
        filename: "downloaded.zip",
        status: "installing",
        x: 312,
        y: 185,
        vx: 2.5,
        vy: -1.2,
        pinned: true,
      });
      // The promise finishes after the list may already contain its file.
      caught.status = "ok";
      expect(
        reconcileConstellationNodes(
          [caught],
          [installed("downloaded.zip", kind, "project")],
          pending,
        )[0],
      ).toBe(caught);
      expect(caught.status).toBe("ok");
    },
  );

  it("keeps a dropped loading star fixed until its own installation finishes", () => {
    const node = { ...moving("pending.jar"), pinned: false, status: "installing" as const };
    expect(constellationNodeIsFixed(node)).toBe(true);
    expect(constellationNodeIsFixed({ ...node, status: "ok" })).toBe(false);
    expect(constellationNodeIsFixed({ ...node, status: "ok", pinned: true })).toBe(true);
  });

  it("retains the optimistic star through an out-of-order refresh after its file was listed", () => {
    const caught: SimNode = { ...moving("pending.jar"), status: "installing" };
    const pending = new Set([caught]);
    reconcileConstellationNodes([caught], [{ ...installed("pending.jar"), status: "ok" }], pending);
    const afterStaleRefresh = reconcileConstellationNodes([caught], [], pending);
    expect(afterStaleRefresh[0]).toBe(caught);
    expect(caught.status).toBe("installing");
    expect(caught).toMatchObject({ x: 312, y: 185, vx: 2.5, vy: -1.2 });
  });

  it("updates names and authors without resetting physics", () => {
    const node = moving("one.jar");
    reconcileConstellationNodes(
      [node],
      [{ ...installed("one.jar"), label: "Resolved name", author: "Actual author", version: "2" }],
      new Set(),
    );
    expect(node).toMatchObject({
      label: "Resolved name",
      author: "Actual author",
      version: "2",
      x: 312,
      y: 185,
      vx: 2.5,
      vy: -1.2,
      pinned: true,
    });
  });

  it("distinguishes files and content kinds from the same project", () => {
    const first = installed("a.jar", "mod", "project");
    const second = installed("b.jar", "mod", "project");
    const shader = installed("shader.zip", "shader", "project");
    const next = reconcileConstellationNodes(
      [first, second, shader],
      [installed("b.jar", "mod", "project"), installed("shader.zip", "shader", "project")],
      new Set(),
    );
    expect(next).toEqual([second, shader]);
    expect(next[0]).toBe(second);
    expect(next[1]).toBe(shader);
  });
});
