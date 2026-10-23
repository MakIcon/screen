import { describe, expect, it, vi } from "vitest";
import { observeCanvasUiOutputFrames } from "./canvasUiOutputFrames";

function fixture() {
  const context = {
    clear: vi.fn(),
    drawArrays: vi.fn(),
    drawElements: vi.fn(),
    drawArraysInstanced: vi.fn(),
  };
  const getContext = vi.fn(() => context);
  const canvas = { getContext } as unknown as HTMLCanvasElement;
  const frame = vi.fn();
  const dispose = observeCanvasUiOutputFrames(canvas, frame);
  return { context, getContext, canvas, frame, dispose };
}

describe("Canvas UI composite frame notifications", () => {
  it("coalesces multiple GPU passes while preserving renderer calls and context options", async () => {
    const { context, getContext, canvas, frame, dispose } = fixture();
    const draw = context.drawArrays;
    const clear = context.clear;
    canvas.getContext("webgl2", { alpha: true, antialias: false });
    context.clear(16384);
    context.drawArrays(4, 0, 6);
    context.drawArraysInstanced(4, 0, 6, 3);
    expect(frame).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(frame).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(16384);
    expect(draw).toHaveBeenCalledWith(4, 0, 6);
    expect(getContext).toHaveBeenCalledWith("webgl2", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    context.clear(16384);
    await Promise.resolve();
    expect(frame).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("does not notify on context lookup or when no frame was rendered", async () => {
    const { canvas, context, frame, dispose } = fixture();
    canvas.getContext("webgl2");
    const wrapped = context.drawArrays;
    canvas.getContext("webgl2");
    expect(context.drawArrays).toBe(wrapped);
    await Promise.resolve();
    expect(frame).not.toHaveBeenCalled();
    dispose();
  });

  it("restores the context and cancels queued notifications on unmount", async () => {
    const { canvas, context, getContext, frame, dispose } = fixture();
    const draw = context.drawElements;
    canvas.getContext("webgl2");
    context.drawElements(4, 6, 5123, 0);
    dispose();
    dispose();
    await Promise.resolve();
    expect(frame).not.toHaveBeenCalled();
    expect(canvas.getContext).toBe(getContext);
    expect(context.drawElements).toBe(draw);
    context.drawElements(4, 6, 5123, 0);
    await Promise.resolve();
    expect(frame).not.toHaveBeenCalled();
  });
});
