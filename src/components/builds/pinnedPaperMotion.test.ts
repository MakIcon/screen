import { describe, expect, it, vi } from "vitest";
import {
  advancePinnedPaperMotion,
  createPaperPositionWriter,
  createPinnedPaperMotion,
  getPinnedPaperTilt,
  isPinnedPaperSettled,
} from "./pinnedPaperMotion";

describe("pinned paper physics", () => {
  it("makes the bottom of the sheet lag opposite to the horizontal drag", () => {
    for (const direction of [-1, 1]) {
      let motion = createPinnedPaperMotion();
      for (let frame = 0; frame < 30; frame += 1)
        motion = advancePinnedPaperMotion(
          motion,
          getPinnedPaperTilt(direction * 250),
          true,
          1 / 60,
        );
      const bottomOffset = -Math.sin((motion.angle * Math.PI) / 180);
      expect(bottomOffset * direction).toBeLessThan(0);
      expect(motion.lift).toBeGreaterThan(0.95);
    }
  });

  it("keeps the pin raised when the mouse is held still", () => {
    let motion = createPinnedPaperMotion();
    for (let frame = 0; frame < 180; frame += 1)
      motion = advancePinnedPaperMotion(motion, 0, true, 1 / 60);
    expect(motion.lift).toBeCloseTo(1, 4);
    expect(isPinnedPaperSettled(motion, true)).toBe(true);
    expect(isPinnedPaperSettled(motion, false)).toBe(false);
  });

  it("swings back and settles with the pin reattached after release", () => {
    let motion = createPinnedPaperMotion();
    for (let frame = 0; frame < 30; frame += 1)
      motion = advancePinnedPaperMotion(motion, getPinnedPaperTilt(500), true, 1 / 60);
    let crossedRest = false;
    for (let frame = 0; frame < 180; frame += 1) {
      motion = advancePinnedPaperMotion(motion, 0, false, 1 / 60);
      if (motion.angle < 0) crossedRest = true;
    }
    expect(crossedRest).toBe(true);
    expect(isPinnedPaperSettled(motion, false)).toBe(true);
  });

  it("limits sudden reversals and large frame gaps to a small visible swing", () => {
    let motion = createPinnedPaperMotion();
    for (let frame = 0; frame < 300; frame += 1) {
      const velocity = (frame % 50 < 25 ? 1 : -1) * 100_000;
      motion = advancePinnedPaperMotion(motion, getPinnedPaperTilt(velocity), true, 1);
      expect(Math.abs(motion.angle)).toBeLessThanOrEqual(2.2);
      expect(Number.isFinite(motion.angularVelocity)).toBe(true);
    }
  });

  it("behaves consistently at different display refresh rates", () => {
    const simulate = (fps: number) => {
      let motion = createPinnedPaperMotion();
      for (let frame = 0; frame < fps; frame += 1)
        motion = advancePinnedPaperMotion(motion, 1.5, true, 1 / fps);
      return motion;
    };
    const normal = simulate(60);
    const fast = simulate(144);
    expect(Math.abs(normal.angle - fast.angle)).toBeLessThan(0.01);
    expect(Math.abs(normal.lift - fast.lift)).toBeLessThan(0.01);
  });
});

describe("paper window movement", () => {
  it("sends the newest position without building a queue and flushes the release position", async () => {
    let completeFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      completeFirst = resolve;
    });
    const write = vi.fn().mockReturnValueOnce(firstWrite).mockResolvedValue(undefined);
    const writer = createPaperPositionWriter(write, vi.fn());
    writer.push({ x: 100, y: 100 });
    writer.push({ x: 200, y: 120 });
    writer.push({ x: -300, y: 150 });
    expect(write).toHaveBeenCalledTimes(1);
    completeFirst();
    await writer.flush();
    expect(write.mock.calls.map(([position]) => position)).toEqual([
      { x: 100, y: 100 },
      { x: -300, y: 150 },
    ]);
  });

  it("stops queued writes when the sheet is closed", async () => {
    let complete!: () => void;
    const write = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const writer = createPaperPositionWriter(write, vi.fn());
    writer.push({ x: 1, y: 1 });
    writer.push({ x: 2, y: 2 });
    writer.dispose();
    complete();
    await writer.flush();
    writer.push({ x: 3, y: 3 });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("reports a failed move and allows a later drag to try again", async () => {
    const error = new Error("window unavailable");
    const write = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const onError = vi.fn();
    const writer = createPaperPositionWriter(write, onError);
    writer.push({ x: 1, y: 1 });
    await writer.flush();
    expect(onError).toHaveBeenCalledWith(error);
    writer.push({ x: 2, y: 2 });
    await writer.flush();
    expect(write).toHaveBeenLastCalledWith({ x: 2, y: 2 });
  });
});
