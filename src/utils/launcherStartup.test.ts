import { describe, expect, it, vi } from "vitest";
import { loadStartupValue } from "./launcherStartup";

describe("independent launcher startup", () => {
  it("applies local builds while the manifest is pending and keeps them on network failure", async () => {
    let rejectManifest!: (error: Error) => void;
    const manifest = new Promise<string>((_, reject) => {
      rejectManifest = reject;
    });
    const applyManifest = vi.fn();
    const applyBuilds = vi.fn();
    const onError = vi.fn();
    const networkTask = loadStartupValue(
      () => manifest,
      applyManifest,
      onError,
      () => true,
    );
    await loadStartupValue(
      async () => ["installed-build"],
      applyBuilds,
      onError,
      () => true,
    );
    expect(applyBuilds).toHaveBeenCalledWith(["installed-build"]);
    expect(applyManifest).not.toHaveBeenCalled();
    rejectManifest(new Error("offline"));
    await networkTask;
    expect(onError).toHaveBeenCalledOnce();
    expect(applyBuilds).toHaveBeenCalledOnce();
  });

  it("does not apply late startup data after unmount", async () => {
    let active = true;
    let resolve!: (value: number) => void;
    const apply = vi.fn();
    const task = loadStartupValue(
      () =>
        new Promise<number>((done) => {
          resolve = done;
        }),
      apply,
      vi.fn(),
      () => active,
    );
    active = false;
    resolve(4);
    await task;
    expect(apply).not.toHaveBeenCalled();
  });
});
