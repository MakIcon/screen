import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { installWhenIdle } from "./updateSafety";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

describe("update installation safety", () => {
  beforeEach(() => vi.resetAllMocks());

  it("defers if a task started after the countdown or download", async () => {
    const install = vi.fn();
    expect(await installWhenIdle(() => true, install)).toBe(false);
    expect(install).not.toHaveBeenCalled();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("defers when another window starts an operation before reservation", async () => {
    mockedInvoke.mockResolvedValueOnce(null);
    const install = vi.fn();
    expect(await installWhenIdle(() => false, install)).toBe(false);
    expect(install).not.toHaveBeenCalled();
    expect(mockedInvoke).toHaveBeenCalledExactlyOnceWith("prepare_launcher_update");
  });

  it("holds the reservation through installation and relaunch", async () => {
    mockedInvoke.mockResolvedValueOnce("reservation").mockResolvedValueOnce(undefined);
    const install = vi.fn(async () => {
      expect(mockedInvoke).toHaveBeenCalledTimes(1);
    });
    expect(await installWhenIdle(() => false, install)).toBe(true);
    expect(install).toHaveBeenCalledOnce();
    expect(mockedInvoke).toHaveBeenLastCalledWith("finish_launcher_update", {
      token: "reservation",
    });
  });

  it("releases the reservation if installation fails", async () => {
    mockedInvoke.mockResolvedValueOnce("reservation").mockResolvedValueOnce(undefined);
    await expect(
      installWhenIdle(
        () => false,
        async () => {
          throw new Error("installer failed");
        },
      ),
    ).rejects.toThrow("installer failed");
    expect(mockedInvoke).toHaveBeenLastCalledWith("finish_launcher_update", {
      token: "reservation",
    });
  });

  it("does not install when the operation registry cannot be reached", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("IPC unavailable"));
    const install = vi.fn();
    await expect(installWhenIdle(() => false, install)).rejects.toThrow("IPC unavailable");
    expect(install).not.toHaveBeenCalled();
  });
});
