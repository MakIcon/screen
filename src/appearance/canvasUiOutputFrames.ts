export const CANVAS_UI_FRAME_EVENT = "canvas-ui-output-frame";

const DRAW_METHODS = [
  "clear",
  "clearBufferfv",
  "clearBufferiv",
  "clearBufferuiv",
  "clearBufferfi",
  "drawArrays",
  "drawElements",
  "drawArraysInstanced",
  "drawElementsInstanced",
  "drawRangeElements",
  "blitFramebuffer",
] as const;

/** A composite needs the completed GPU frame, including frames that only clear
 * a disappearing effect. Coalesce all passes in a render into one notification. */
export function observeCanvasUiOutputFrames(canvas: HTMLCanvasElement, onFrame: () => void) {
  const getContext = canvas.getContext;
  const contexts = new WeakSet<object>();
  const restore: (() => void)[] = [];
  let pending = false;
  let disposed = false;
  const notify = () => {
    if (pending || disposed) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (!disposed) onFrame();
    });
  };
  const trackedGetContext = ((id: string, attributes?: WebGLContextAttributes) => {
    const context = (
      getContext as (id: string, attributes?: unknown) => RenderingContext | null
    ).call(
      canvas,
      id,
      id.includes("webgl") ? { ...attributes, preserveDrawingBuffer: true } : attributes,
    );
    if (!context || !id.includes("webgl") || contexts.has(context)) return context;
    contexts.add(context);
    const methods = context as unknown as Record<string, unknown>;
    for (const key of DRAW_METHODS) {
      const original = methods[key];
      if (typeof original !== "function") continue;
      const tracked = function (this: RenderingContext, ...args: unknown[]) {
        const result = original.apply(this, args);
        notify();
        return result;
      };
      methods[key] = tracked;
      restore.push(() => {
        if (methods[key] === tracked) methods[key] = original;
      });
    }
    return context;
  }) as typeof canvas.getContext;
  canvas.getContext = trackedGetContext;
  return () => {
    if (disposed) return;
    disposed = true;
    if (canvas.getContext === trackedGetContext) canvas.getContext = getContext;
    restore.forEach((dispose) => dispose());
  };
}
