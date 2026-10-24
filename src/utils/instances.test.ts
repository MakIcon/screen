import { describe, expect, it } from "vitest";
import type { InstanceItem } from "../types";
import { sortInstancesNewestFirst } from "./instances";

const build = (id: string, createdAt: string, extra: Partial<InstanceItem> = {}) =>
  ({ id, name: id, createdAt, ...extra }) as InstanceItem;

describe("content installation build order", () => {
  it("orders by creation date regardless of pinning, name or last launch without changing the source", () => {
    const instances = [
      build("old", "9", { pinned: true, lastPlayed: "9999999999" }),
      build("newest", "100"),
      build("middle", "10"),
    ];
    const sorted = sortInstancesNewestFirst(instances);
    expect(sorted.map(({ id }) => id)).toEqual(["newest", "middle", "old"]);
    expect(instances.map(({ id }) => id)).toEqual(["old", "newest", "middle"]);
    expect(sorted[0]).toBe(instances[1]);
  });

  it("keeps later appended builds first for equal or unavailable timestamps", () => {
    expect(
      sortInstancesNewestFirst([
        build("legacy", "0"),
        build("same-second-1", "100"),
        build("same-second-2", "100"),
        build("invalid", "bad"),
        build("infinite", "Infinity"),
      ]).map(({ id }) => id),
    ).toEqual(["same-second-2", "same-second-1", "infinite", "invalid", "legacy"]);
    expect(sortInstancesNewestFirst([])).toEqual([]);
  });
});
