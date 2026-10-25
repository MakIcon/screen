// Start Vite first. PLAYWRIGHT_MODULE can point at a bundled Playwright entry point.
/* global window, document, getComputedStyle, PointerEvent */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { testAppearanceStudio } from "./test_appearance_studio.mjs";
import { testButtonsAndBadges } from "./test_button_badge_controls.mjs";

const entry = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(entry ? pathToFileURL(path.resolve(entry)).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(10000);
try {
  await page.goto(
    `${process.env.CONTROL_TEST_URL || "http://127.0.0.1:1420"}/scripts/fixtures/launcher-controls/index.html`,
  );
  await page.getByRole("heading", { name: "Launcher controls" }).waitFor();
  const input = page.getByRole("textbox", { name: "Build name", exact: true });
  await input.fill("Changed build");
  assert.equal(await page.locator("#text-value").textContent(), "Changed build");
  await page.locator("#text-example .text-field-actions button").first().click();
  assert.equal(await page.locator("#text-value").textContent(), "");
  await page.locator("#text-example .text-field-actions button").nth(1).click();
  assert.equal(await page.locator("#text-value").textContent(), "New build");

  const measurements = await page.evaluate(() => {
    const measure = (selector) => {
      const node = document.querySelector(selector);
      const css = getComputedStyle(node);
      return {
        height: node.getBoundingClientRect().height,
        fontSize: css.fontSize,
        fontWeight: css.fontWeight,
        letterSpacing: css.letterSpacing,
        color: css.color,
        padding: css.padding,
        border: css.border,
        background: css.backgroundColor,
      };
    };
    return [
      [measure("#legacy-input input"), measure("#new-input input")],
      [measure("#legacy-bot-input input"), measure("#new-bot-input input")],
    ];
  });
  for (const [legacy, shared] of measurements)
    assert.deepEqual(shared, legacy, "shared text fields preserve the screen's default design");

  const selectMeasurements = await page.evaluate(() =>
    [
      ["#legacy-input input", "#proxy-select"],
      ["#legacy-bot-input input", "#bot-select"],
    ].map(([legacySelector, sharedSelector]) => {
      const legacy = document.querySelector(legacySelector);
      const trigger = document.querySelector(`${sharedSelector} .inline-dropdown-trigger`);
      const text = document.querySelector(`${sharedSelector} .inline-dropdown-value`);
      return {
        originalHeight: legacy.getBoundingClientRect().height,
        height: trigger.getBoundingClientRect().height,
        originalFontSize: getComputedStyle(legacy).fontSize,
        fontSize: getComputedStyle(text).fontSize,
      };
    }),
  );
  for (const measurement of selectMeasurements) {
    assert.equal(measurement.height, measurement.originalHeight);
    assert.equal(measurement.fontSize, measurement.originalFontSize);
  }
  const defaultDropdown = page.getByRole("button", { name: "Minecraft version", exact: true });
  await defaultDropdown.click();
  assert.equal(await page.getByRole("combobox").count(), 0, "search is opt-in by default");
  assert.equal(await page.getByRole("option").count(), 40);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await defaultDropdown.getAttribute("aria-expanded"), "false");
  assert.equal(
    await page.evaluate(() => {
      const root = document.querySelector("#fixture");
      const input = document.querySelector("#new-input input");
      const target = window.controlsQA.createElementTarget(root, input);
      target.path = target.path.filter(
        (segment) => !["class:text-field", "class:text-field-body"].includes(segment.marker),
      );
      delete target.path[target.path.length - 1].marker;
      return window.controlsQA.resolveElementTarget(root, target) === input;
    }),
    true,
    "profiles created before text-field wrappers still resolve",
  );

  const trigger = page.getByRole("button", { name: "Loader", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("combobox").waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(
    await page.locator("#selected-value").textContent(),
    "quilt",
    "keyboard selection skips disabled options",
  );
  assert.equal(await trigger.evaluate((node) => document.activeElement === node), true);
  await trigger.click();
  await page.getByRole("combobox").fill("van");
  assert.equal(await page.getByRole("option").count(), 1);
  assert.equal(await page.locator(".inline-dropdown-item mark").textContent(), "Van");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#selected-value").textContent(), "vanilla");
  await trigger.click();
  await page.getByRole("combobox").fill("missing-option");
  assert.equal(await page.getByRole("option").count(), 0);
  await page.keyboard.press("Escape");
  assert.equal(await trigger.getAttribute("aria-expanded"), "false");

  const picked = await page.evaluate(async () => {
    const root = document.querySelector("#fixture");
    return await new Promise((resolve) => {
      window.controlsQA.beginElementPicker(root, (target) => resolve(target.component?.kind));
      document
        .querySelector("#text-example input")
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
  });
  assert.equal(picked, "textfield", "picking the real input opens its component settings");
  // Let the picker's click suppression expire before interacting with the inspector.
  await page.waitForTimeout(550);
  await page.getByRole("button", { name: "Inspect text", exact: true }).click();
  await page.getByLabel("ПОДСКАЗКА", { exact: true }).fill("A live helper");
  await page
    .locator("#text-example .text-field-hint")
    .filter({ hasText: "A live helper" })
    .waitFor();
  assert.equal(await input.inputValue(), "New build");
  await page.getByRole("button", { name: "КНОПКА ОЧИСТКИ", exact: true }).click();
  await page.getByRole("option", { name: "ВЫКЛ", exact: true }).click();
  assert.equal(await page.locator("#text-example .text-field-actions button").count(), 1);
  await page.getByRole("button", { name: "Inspect progress", exact: true }).click();
  await page.getByRole("button", { name: "ДИЗАЙН ПОЛОСЫ", exact: true }).click();
  await page.getByRole("option", { name: "СЕГМЕНТЫ", exact: true }).click();
  assert.notEqual(
    await page
      .locator("#progress-example .element-progress-meter")
      .evaluate((node) => node.style.maskImage),
    "",
  );
  const persisted = await page.evaluate(() => {
    const root = document.querySelector("#fixture");
    const node = document.querySelector("#progress-example [data-appearance-component]");
    const target = window.controlsQA.createElementTarget(root, node);
    const profile = window.controlsQA.normalizeAppearanceProfile({
      customized: true,
      elementOverrides: [
        {
          ...target,
          style: {},
          componentSettings: {
            kind: "progressbar",
            settings: {
              variant: "segmented",
              height: 14,
              tickMode: "custom",
              customTicks: [0, 20, 50, 80, 100],
              showDefaultMarker: true,
              defaultValue: 80,
              striped: true,
              animated: false,
            },
          },
        },
      ],
    });
    window.controlsQA.applyElementAppearanceOverrides(root, profile.elementOverrides);
    return JSON.stringify(profile);
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#progress-example .element-progress-track").getBoundingClientRect()
        .height === 14,
  );
  assert.equal(await page.locator("#progress-example .element-progress-tick").count(), 5);
  assert.equal(
    await page.locator("#progress-example [role=progressbar]").getAttribute("aria-valuenow"),
    "38",
  );
  assert.equal(
    await page
      .locator("#progress-example .element-progress-marker")
      .evaluate((node) => node.style.left),
    "80%",
  );
  assert.equal(
    await page
      .locator("#progress-example .element-progress-fill")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );

  if (process.env.CONTROL_SCREENSHOT_PATH) {
    await fs.mkdir(path.dirname(path.resolve(process.env.CONTROL_SCREENSHOT_PATH)), {
      recursive: true,
    });
    await page.screenshot({ path: process.env.CONTROL_SCREENSHOT_PATH, fullPage: true });
  }
  await page.reload();
  await page.getByRole("heading", { name: "Launcher controls" }).waitFor();
  await page.evaluate((serialized) => {
    const profile = window.controlsQA.normalizeAppearanceProfile(JSON.parse(serialized));
    window.controlsQA.applyElementAppearanceOverrides(
      document.querySelector("#fixture"),
      profile.elementOverrides,
    );
  }, persisted);
  await page.waitForFunction(
    () =>
      document.querySelector("#progress-example .element-progress-track").getBoundingClientRect()
        .height === 14,
  );
  await page.evaluate(() =>
    window.controlsQA.applyElementAppearanceOverrides(document.querySelector("#fixture"), []),
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#progress-example .element-progress-track").getBoundingClientRect()
        .height === 6,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator('[data-indeterminate="true"] .element-progress-fill')
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );
  await testButtonsAndBadges(page);
  assert.deepEqual(errors, []);
  await testAppearanceStudio(browser, process.env.CONTROL_TEST_URL || "http://127.0.0.1:1420");
  console.log(
    "PASS: fields, selects, progress, buttons and badges; keyboard, loading, component picking, live settings, saved profiles, reset and reduced motion.",
  );
} finally {
  await browser.close();
}
