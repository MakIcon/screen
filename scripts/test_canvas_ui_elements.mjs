// Start Vite first. Playwright may be installed separately; set
// PLAYWRIGHT_MODULE to its absolute entry point when it is not a local dependency.
/* global window, document */
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(entry ? pathToFileURL(path.resolve(entry)).href : "playwright");
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-blink-features=CanvasDrawElement"],
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [];
page.setDefaultTimeout(10_000);
page.on("pageerror", (error) => errors.push(error.message));
const origin = process.env.CANVAS_UI_TEST_URL || "http://127.0.0.1:1420";
try {
  await page.goto(`${origin}/scripts/fixtures/canvas-ui-elements/index.html`);
  for (const target of ["profile", "current", "main", "sidebar", "modcard"]) {
    await page.getByLabel("Target", { exact: true }).selectOption(target);
    await page.waitForFunction(
      () => document.querySelector("canvas-ui-element")?.dataset.canvasUiStatus === "ready",
    );
    await page.waitForTimeout(250);
    await page.evaluate((id) => {
      const host = document.querySelector("canvas-ui-capture");
      window.qa.mirror = host.shadowRoot.querySelector("[data-canvas-mirror]");
      window.qa.styles = 0;
      window.qa.clones = 0;
      window.qa.longTasks = [];
      window.qa.frames = [];
      window.qa.target = document.getElementById(id);
    }, target);
    const box = await page.locator(`#${target}`).boundingBox();
    for (let index = 0; index < 24; index++) {
      await page.mouse.move(
        box.x + 15 + ((index % 4) * (box.width - 30)) / 4,
        box.y + 20 + ((index % 12) * (box.height - 40)) / 12,
      );
    }
    await page.waitForTimeout(150);
    const result = await page.evaluate(() => {
      const shadow = document.querySelector("canvas-ui-capture").shadowRoot;
      const source = shadow.querySelector(".canvas-ui-source");
      const rgba = [...source.getContext("2d").getImageData(3, 3, 1, 1).data];
      return {
        clones: window.qa.clones,
        styles: window.qa.styles,
        rgba,
        retained: window.qa.mirror === shadow.querySelector("[data-canvas-mirror]"),
      };
    });
    assert.ok(result.retained, `${target}: preserve the mirror while moving the lens`);
    assert.equal(result.clones, 0, `${target}: pointer movement must not clone content`);
    assert.ok(result.styles < 1000, `${target}: style work should follow the hovered branch`);
    assert.equal(result.rgba[3], 255, `${target}: capture includes the container's backdrop`);
    assert.ok(
      result.rgba.slice(0, 3).every((value) => value > 180),
      `${target}: a light backdrop must not turn black`,
    );
    console.log(`PASS ${target}: retained content, ${result.styles} style reads, opaque backdrop`);
  }

  await page.getByLabel("Target", { exact: true }).selectOption("main");
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const source = document.querySelector("#main .csa-content");
    source.scrollTop = 220;
  });
  await page.waitForFunction(() => {
    const shadow = document.querySelector("canvas-ui-capture").shadowRoot;
    return (
      shadow.querySelector(".csa-content").scrollTop ===
      document.querySelector("#main .csa-content").scrollTop
    );
  });
  await page.locator("#main").getByPlaceholder("Search compatible mods…").fill("Updated content");
  await page.waitForFunction(
    () =>
      document.querySelector("canvas-ui-capture").shadowRoot.querySelector("input")?.value ===
      "Updated content",
  );
  await page.evaluate(() => {
    const card = document.querySelector("#modcard");
    window.qa.retainedHeading = document
      .querySelector("canvas-ui-capture")
      .shadowRoot.querySelector("h3");
    card.querySelector("h3").firstChild.data = "Changed title";
    const badge = document.createElement("span");
    badge.id = "new-badge";
    badge.textContent = "NEW BADGE";
    card.appendChild(badge);
  });
  await page.waitForFunction(() => {
    const root = document.querySelector("canvas-ui-capture").shadowRoot;
    return (
      root.querySelector("h3")?.textContent.startsWith("Changed title") &&
      root.textContent.includes("NEW BADGE")
    );
  });
  assert.ok(
    await page.evaluate(
      () =>
        window.qa.retainedHeading ===
        document.querySelector("canvas-ui-capture").shadowRoot.querySelector("h3"),
    ),
    "patch text without replacing other nodes",
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector("canvas-ui-capture").shadowRoot.querySelector(".mod-card")
          .offsetHeight,
    ),
    await page.locator("#modcard").evaluate((element) => element.offsetHeight),
    "update content-dependent panel sizes",
  );
  await page.evaluate(() => document.querySelector("#new-badge").remove());
  await page.waitForFunction(
    () => !document.querySelector("canvas-ui-capture").shadowRoot.textContent.includes("NEW BADGE"),
  );
  await page.getByLabel("Global", { exact: true }).check();
  await page.waitForTimeout(250);
  for (const effect of ["bubble", "clouds", "liquid", "ripple", "glass"]) {
    await page.getByLabel("Effect", { exact: true }).selectOption(effect);
    await page.waitForTimeout(200);
    await page.mouse.move(1000, 650);
    assert.equal(
      await page.locator("canvas-ui-element").getAttribute("data-canvas-ui-status"),
      "ready",
      effect,
    );
  }
  assert.deepEqual(errors, []);
  console.log("PASS scrolling, typing, text/list patches and global/local composition");
} finally {
  await browser.close();
}
