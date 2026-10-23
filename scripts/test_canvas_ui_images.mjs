/* global window, document, WebGL2RenderingContext */
import assert from "node:assert/strict";

export async function testCanvasUiImages(page, origin) {
  let requests = 0;
  await page.route("https://canvas-ui-icons.test/**", async (route) => {
    requests++;
    // Finish loading after the active effect has captured its first frame.
    await new Promise((resolve) => setTimeout(resolve, 80));
    const color = route.request().url().includes("green") ? "#11dd55" : "#ed2d53";
    await route.fulfill({
      contentType: "image/svg+xml",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path fill="${color}" d="M0 0h40v40H0z"/></svg>`,
    });
  });
  await page.goto(
    `${origin}/scripts/fixtures/canvas-ui-elements/index.html?globalEffect=displacement`,
  );
  await page.waitForFunction(() => !!window.qa.setIconUrl);
  await page.mouse.move(10, 10);
  await page.getByLabel("Effect", { exact: true }).selectOption("displacement");
  await page.evaluate(() => {
    window.qa.imagePixels = new WeakMap();
    // GPU buffers are disposable. Inspect each finished frame before the browser
    // presents it, so this checks actual effect output rather than DOM readiness.
    const prototype = WebGL2RenderingContext.prototype;
    const draw = prototype.drawArrays;
    prototype.drawArrays = function (...args) {
      const result = draw.apply(this, args);
      const color = window.qa.imageColor;
      if (!color) return result;
      const selector =
        window.qa.imageGlobal && this.canvas.getRootNode() !== document
          ? "#current .eximp-list-preview-icon"
          : "#modcard img";
      const icon = document.querySelector(selector);
      if (!icon) return result;
      const rect = icon.getBoundingClientRect();
      const bounds = this.canvas.getBoundingClientRect();
      const x = Math.floor(
        ((rect.x + rect.width / 2 - bounds.x) * this.canvas.width) / bounds.width,
      );
      const y =
        this.canvas.height -
        1 -
        Math.floor(((rect.y + rect.height / 2 - bounds.y) * this.canvas.height) / bounds.height);
      const pixels = new Uint8Array(4);
      this.readPixels(x, y, 1, 1, this.RGBA, this.UNSIGNED_BYTE, pixels);
      window.qa.imagePixels.set(this.canvas, [...pixels]);
      return result;
    };
  });
  for (const global of [false, true]) {
    await page.getByLabel("Target", { exact: true }).selectOption(global ? "current" : "main");
    await page.getByLabel("Global", { exact: true }).setChecked(global);
    await page.waitForFunction(
      () => document.querySelector("canvas-ui-element")?.dataset.canvasUiStatus === "ready",
    );
    for (const color of ["red", "green"]) {
      await page.evaluate(
        ({ color, global }) => {
          window.qa.imageColor = color === "green" ? [17, 221, 85] : [237, 45, 83];
          window.qa.imageGlobal = global;
          window.qa.imagePixels = new WeakMap();
          window.qa.setIconUrl(`https://canvas-ui-icons.test/${color}.svg?global=${global}`);
        },
        { color, global },
      );
      await page.waitForFunction((global) => {
        const local = document
          .querySelector("canvas-ui-element")
          .shadowRoot.querySelector(".canvas-ui-output");
        const output = document.querySelector(".canvas-ui-surface > .canvas-ui-output");
        const matches = (canvas) => {
          const pixels = window.qa.imagePixels.get(canvas);
          return (
            pixels &&
            window.qa.imageColor.every((value, channel) => Math.abs(pixels[channel] - value) < 4)
          );
        };
        return matches(local) && (!global || matches(output));
      }, global);
    }
    console.log(
      `PASS ${global ? "global + local" : "local"} Displacement: late remote icons and changed URLs reach GPU output`,
    );
  }
  assert.ok(requests >= 4, "exercise both initial and updated remote images");
  await page.unroute("https://canvas-ui-icons.test/**");
}
