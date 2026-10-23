/* global window, document, WebGL2RenderingContext, PointerEvent, WheelEvent */
import assert from "node:assert/strict";

export async function testCanvasUiPointer(page) {
  // Observe values actually sent to shaders, rather than only engine readiness.
  await page.evaluate(() => {
    window.qa.gpu = new WeakMap();
    const names = new WeakMap();
    const prototype = WebGL2RenderingContext.prototype;
    const originals = new Map(
      [
        "getUniformLocation",
        "uniform1f",
        "uniform2f",
        "uniform1i",
        "texSubImage2D",
        "drawArrays",
      ].map((method) => [method, prototype[method]]),
    );
    window.qa.restoreGpuProbe = () => {
      for (const [method, original] of originals) prototype[method] = original;
    };
    const location = prototype.getUniformLocation;
    prototype.getUniformLocation = function (...args) {
      const result = location.apply(this, args);
      if (result) names.set(result, args[1]);
      return result;
    };
    const probe = (context) => {
      let value = window.qa.gpu.get(context.canvas);
      if (!value) {
        value = { uniforms: {}, fieldPeak: 0, hashes: [] };
        window.qa.gpu.set(context.canvas, value);
      }
      return value;
    };
    for (const method of ["uniform1f", "uniform2f", "uniform1i"]) {
      const original = prototype[method];
      prototype[method] = function (location, ...values) {
        const name = names.get(location);
        if (name) probe(this).uniforms[name] = values;
        return original.call(this, location, ...values);
      };
    }
    const upload = prototype.texSubImage2D;
    prototype.texSubImage2D = function (...args) {
      const data = args.at(-1);
      if (data instanceof Float32Array) {
        const value = probe(this);
        for (const sample of data) value.fieldPeak = Math.max(value.fieldPeak, Math.abs(sample));
      }
      return upload.apply(this, args);
    };
    const draw = prototype.drawArrays;
    prototype.drawArrays = function (...args) {
      const result = draw.apply(this, args);
      const value = probe(this);
      if (
        this.canvas.parentElement?.dataset.canvasUiEffect === "displacement" &&
        value.hashes.length < 60
      ) {
        const pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4);
        this.readPixels(
          0,
          0,
          this.canvas.width,
          this.canvas.height,
          this.RGBA,
          this.UNSIGNED_BYTE,
          pixels,
        );
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 4)
          hash = Math.imul(hash ^ pixels[index], 16777619);
        value.hashes.push(hash);
      }
      return result;
    };
  });
  const ready = async (effect, target = "current") => {
    await page.mouse.move(10, 10);
    await page.getByLabel("Target", { exact: true }).selectOption(target);
    await page.getByLabel("Effect", { exact: true }).selectOption(effect);
    await page.waitForFunction((effect) => {
      const host = document.querySelector("canvas-ui-element");
      return (
        host?.dataset.canvasUiStatus === "ready" &&
        host.shadowRoot.querySelector(".canvas-ui-surface")?.dataset.canvasUiEffect === effect
      );
    }, effect);
    await page.waitForTimeout(100);
  };
  const move = async (target) => {
    const box = await page.locator(`#${target}`).boundingBox();
    const label = await page
      .locator(`#${target}`)
      .locator("h3, strong, .panel-label")
      .first()
      .boundingBox();
    const x = Math.max(box.x + 5, label.x - 8);
    const y = label.y + label.height / 2;
    await page.mouse.move(x, y);
    const endX = Math.min(box.x + box.width - 5, label.x + label.width + 8);
    await page.mouse.move(endX, y, {
      steps: 12,
    });
    return { box, x: endX, y };
  };
  for (const target of ["current", "profile", "main", "sidebar", "modcard"]) {
    await ready("displacement", target);
    await page.waitForFunction(() => {
      const canvas = document
        .querySelector("canvas-ui-element")
        .shadowRoot.querySelector("canvas.canvas-ui-output");
      return window.qa.gpu.get(canvas)?.hashes.length > 0;
    });
    const baseline = await page.evaluate(() => {
      const canvas = document
        .querySelector("canvas-ui-element")
        .shadowRoot.querySelector("canvas.canvas-ui-output");
      const probe = window.qa.gpu.get(canvas);
      const baseline = probe.hashes.at(-1);
      probe.hashes = [];
      probe.fieldPeak = 0;
      return baseline;
    });
    await move(target);
    await page.waitForFunction(() => {
      const canvas = document
        .querySelector("canvas-ui-element")
        .shadowRoot.querySelector("canvas.canvas-ui-output");
      return window.qa.gpu.get(canvas)?.fieldPeak > 0.01;
    });
    const hashes = await page.evaluate(() => {
      const canvas = document
        .querySelector("canvas-ui-element")
        .shadowRoot.querySelector("canvas.canvas-ui-output");
      return window.qa.gpu.get(canvas).hashes;
    });
    assert.ok(
      hashes.some((hash) => hash !== baseline),
      `${target}: pointer motion changes rendered pixels`,
    );
    console.log(`PASS ${target}: Displacement receives motion and changes rendered pixels`);
  }
  for (const effect of [
    "asciify",
    "decrypt-reveal",
    "particle-reveal",
    "retro-dither",
    "shatter",
  ]) {
    await ready(effect);
    const { box, x, y } = await move("current");
    const expected = [x - box.x, y - box.y];
    const normalized = !["decrypt-reveal", "particle-reveal"].includes(effect);
    if (normalized) {
      expected[0] /= box.width;
      expected[1] = 1 - expected[1] / box.height;
    }
    await page.waitForFunction(
      ({ expected, tolerance }) => {
        const canvas = document
          .querySelector("canvas-ui-element")
          .shadowRoot.querySelector("canvas.canvas-ui-output");
        const uniforms = window.qa.gpu.get(canvas)?.uniforms;
        return (
          uniforms?.uActive?.[0] > 0.5 &&
          uniforms?.uPointer?.every((value, index) => Math.abs(value - expected[index]) < tolerance)
        );
      },
      { expected, tolerance: normalized ? 0.01 : 0.5 },
    );
    await page.mouse.move(10, 10);
    await page.waitForFunction(() => {
      const canvas = document
        .querySelector("canvas-ui-element")
        .shadowRoot.querySelector("canvas.canvas-ui-output");
      return window.qa.gpu.get(canvas)?.uniforms.uActive?.[0] < 0.01;
    });
    console.log(`PASS ${effect}: shader reacts to motion and pointer leave`);
  }

  // Each engine host gets one local event. Synthetic copies must never reach
  // window listeners (Liquid uses those) or re-enter the selected DOM element.
  const events = await page.evaluate(() => {
    const target = document.getElementById("current");
    const child = target.querySelector("h3");
    const content = document
      .querySelector("canvas-ui-capture")
      .shadowRoot.querySelector(".canvas-ui-live-content");
    const surface = document
      .querySelector("canvas-ui-element")
      .shadowRoot.querySelector(".canvas-ui-surface");
    const records = { content: [], surface: [], window: [] };
    const types = [
      "pointermove",
      "pointerdown",
      "pointerup",
      "pointercancel",
      "pointerleave",
      "wheel",
    ];
    const cleanup = [];
    for (const [name, host] of [
      ["content", content],
      ["surface", surface],
      ["window", window],
    ]) {
      const record = (event) =>
        records[name].push({
          type: event.type,
          x: event.clientX,
          y: event.clientY,
          pointerId: event.pointerId,
          pressure: event.pressure,
          deltaY: event.deltaY,
        });
      for (const type of types) {
        host.addEventListener(type, record);
        cleanup.push(() => host.removeEventListener(type, record));
      }
    }
    const stop = (event) => event.stopPropagation();
    child.addEventListener("pointermove", stop);
    const box = target.getBoundingClientRect();
    const init = {
      clientX: box.x + 90,
      clientY: box.y + 100,
      pointerId: 42,
      pressure: 0.6,
      bubbles: true,
      composed: true,
    };
    child.dispatchEvent(new PointerEvent("pointermove", init));
    child.removeEventListener("pointermove", stop);
    for (const type of ["pointerdown", "pointerup", "pointercancel"])
      child.dispatchEvent(new PointerEvent(type, init));
    // Native pointerleave does not bubble. Child transitions must not reset the effect.
    child.dispatchEvent(new PointerEvent("pointerleave", { ...init, bubbles: false }));
    target.dispatchEvent(new PointerEvent("pointerleave", { ...init, bubbles: false }));
    child.dispatchEvent(new WheelEvent("wheel", { ...init, deltaY: 37 }));
    cleanup.forEach((dispose) => dispose());
    return records;
  });
  assert.deepEqual(
    events.content,
    events.surface,
    "both engine hosts receive identical coordinates and pointer data",
  );
  assert.deepEqual(
    events.surface.map((event) => event.type),
    ["pointermove", "pointerdown", "pointerup", "pointercancel", "pointerleave", "wheel"],
  );
  assert.equal(events.surface[0].pointerId, 42);
  assert.ok(Math.abs(events.surface[0].pressure - 0.6) < 0.001);
  assert.equal(events.surface.at(-1).deltaY, 37);
  assert.deepEqual(
    events.window.map((event) => event.type),
    ["pointerdown", "pointerup", "pointercancel", "wheel"],
  );
  console.log(
    "PASS input forwarding: stopped propagation, child leave, cancellation, wheel and no duplicate window events",
  );

  await page.getByLabel("Global", { exact: true }).check();
  await ready("displacement");
  await move("current");
  await page.waitForFunction(() => {
    const canvas = document
      .querySelector("canvas-ui-element")
      .shadowRoot.querySelector("canvas.canvas-ui-output");
    return (
      canvas.getContext("webgl2").getContextAttributes().preserveDrawingBuffer &&
      window.qa.gpu.get(canvas)?.fieldPeak > 0.01
    );
  });
  await page.getByLabel("Global", { exact: true }).uncheck();
  await page.mouse.move(10, 10);
  await page.waitForFunction(() => {
    const canvas = document
      .querySelector("canvas-ui-element")
      .shadowRoot.querySelector("canvas.canvas-ui-output");
    return !canvas.getContext("webgl2").getContextAttributes().preserveDrawingBuffer;
  });
  await move("current");
  await page.waitForFunction(() => {
    const canvas = document
      .querySelector("canvas-ui-element")
      .shadowRoot.querySelector("canvas.canvas-ui-output");
    return window.qa.gpu.get(canvas)?.fieldPeak > 0.01;
  });
  console.log(
    "PASS Displacement remains interactive with the global effect enabled and after disabling it",
  );
  await page.evaluate(() => window.qa.restoreGpuProbe());
  await ready("glass");
}
