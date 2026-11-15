// Start Vite first. PLAYWRIGHT_MODULE may point at an installed Playwright entry point.
/* global window, document */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const entry = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(entry ? pathToFileURL(path.resolve(entry)).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const output = path.resolve("artifacts/bot-overview.local");
await fs.mkdir(output, { recursive: true });
try {
  await page.goto(
    `${process.env.CONTROL_TEST_URL || "http://127.0.0.1:1420"}/scripts/fixtures/bot-fleet/index.html`,
  );
  await page.getByRole("button", { name: "Боты", exact: true }).click();
  await page.evaluate(() => {
    const texture =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="#777" d="M1 1h14v14H1z"/><path fill="#aaa" d="M2 2h6v4H2zm7 5h5v5H9zM2 9h5v5H2z"/></svg>',
      );
    const item = (count) => ({
      name: "cobblestone",
      displayName: "Булыжник",
      texture,
      count,
      slot: 36,
      durability: null,
      maxDurability: null,
      enchants: [],
    });
    window.fleetQA.inventory("default", [item(128)]);
    window.fleetQA.inventory("miner-2", [item(546)]);
    window.fleetQA.inventory("offline", [item(999)]);
    window.fleetQA.workflow("default", "complete");
    window.fleetQA.workflow("miner-2", "running");
    window.fleetQA.workflow("farmer", "error");
  });
  const overview = page.locator(".mf-bots-overview");
  await overview.getByText("674", { exact: true }).first().waitFor();
  assert.equal(await overview.locator(".mf-bots-row").count(), 4);
  assert.equal(await overview.locator(".mf-bots-item b").textContent(), "674");
  assert.equal(
    await page.locator(".mf-workspace-sidebar").getByText("Не толпиться", { exact: true }).count(),
    0,
  );
  assert.ok(await overview.getByText("Не толпиться", { exact: true }).count());
  assert.match(await overview.locator(".is-complete.mf-bots-metric").textContent(), /1\s*\/\s*4/);
  await overview.getByRole("button", { name: "Готово", exact: true }).click();
  assert.equal(await overview.locator(".mf-bots-row").count(), 1);
  await overview.getByRole("button", { name: "Все", exact: true }).click();
  await overview.getByRole("textbox", { name: "Найти ресурс…" }).fill("diamond");
  await overview.getByText("Таких ресурсов нет").waitFor();
  await overview.getByRole("textbox", { name: "Найти ресурс…" }).fill("булыж");
  assert.equal(await overview.locator(".mf-bots-item").count(), 1);
  await page.screenshot({ path: path.join(output, "overview-wide.png"), fullPage: true });
  await overview.getByRole("button", { name: "Выбранные", exact: true }).click();
  assert.equal(await overview.locator(".mf-bots-item b").textContent(), "128");
  await page.getByRole("button", { name: "Выбрать всех", exact: true }).click();
  assert.equal(await overview.locator(".mf-bots-item b").textContent(), "674");
  await page.evaluate(() => window.fleetQA.setLocale("en"));
  await overview.getByRole("heading", { name: "Combined inventory" }).waitFor();
  await page.evaluate(() => window.fleetQA.setLocale("ru"));
  await page.setViewportSize({ width: 620, height: 1000 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
  await page.screenshot({ path: path.join(output, "overview-narrow.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(
    `${process.env.CONTROL_TEST_URL || "http://127.0.0.1:1420"}/scripts/fixtures/bot-fleet/index.html?extraBots=96`,
  );
  await page.getByRole("button", { name: "Боты", exact: true }).click();
  assert.equal(await page.locator(".mf-bots-row").count(), 100);
  const scroll = page.locator(".mf-bots-panel").first().locator(".csa-content");
  const dimensions = await scroll.evaluate((element) => ({
    client: element.clientHeight,
    content: element.scrollHeight,
  }));
  assert.ok(
    dimensions.client <= 430 && dimensions.content > dimensions.client,
    "100 bots stay in a bounded scrollable list",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Bot overview passed: completion counts, 674 items, filters, scope, localisation, responsive layout and 100 bots.",
  );
} finally {
  await browser.close();
}
