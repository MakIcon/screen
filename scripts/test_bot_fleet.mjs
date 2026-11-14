// Start Vite first. PLAYWRIGHT_MODULE can point at an existing Playwright entry point.
/* global window, document */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(entry ? pathToFileURL(path.resolve(entry)).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1320, height: 1050 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const calls = () => page.evaluate(() => window.fleetQA.calls);
const reset = () =>
  page.evaluate(() => {
    window.fleetQA.calls = [];
  });
const wait = () =>
  page.waitForFunction(() => !document.querySelector(".mf-roster-bot input").disabled);
const starts = (sent) =>
  sent.filter(
    (call) => call.command === "control_mineflayer_bot_workflow" && call.args.action === "start",
  );
const url = `${process.env.CONTROL_TEST_URL || "http://127.0.0.1:1420"}/scripts/fixtures/bot-fleet/index.html`;
try {
  await page.goto(url);
  await page.getByRole("button", { name: "Добавить: Добыть блоки", exact: true }).click();
  assert.equal(await page.locator(".mf-workflow").count(), 1, "one scenario editor for all scopes");
  assert.equal(await page.locator(".mf-fleet-task-form").count(), 0, "no duplicated task form");
  const block = page.getByRole("textbox", { name: "Что добывать", exact: true });
  if (await block.count()) await block.fill("stone");
  await page.getByRole("checkbox", { name: "Выбрать Miner_2 для команд", exact: true }).check();
  await page.getByRole("checkbox", { name: "Выбрать Sleeper для команд", exact: true }).check();
  await page.getByRole("button", { name: "Запустить у 3 ботов", exact: true }).click();
  await wait();
  let sent = await calls();
  assert.deepEqual(
    starts(sent)
      .map((call) => call.args.botId)
      .sort(),
    ["default", "miner-2"],
  );
  assert.deepEqual(
    starts(sent)[0].args.steps,
    starts(sent)[1].args.steps,
    "same scenario is dispatched to each selected bot",
  );
  assert.ok(starts(sent)[0].args.steps.length > 0);
  assert.equal(
    sent.some((call) => call.args.botId === "offline" || call.args.botId === "farmer"),
    false,
  );
  assert.ok(
    await page
      .getByText("Бот не подключён. Подключите его и повторите отправку", { exact: true })
      .count(),
  );
  const defense = sent.filter((call) => call.args.message?.startsWith("work defense"));
  assert.notEqual(
    defense.find((call) => call.args.botId === "default").args.message,
    defense.find((call) => call.args.botId === "miner-2").args.message,
    "each bot keeps its own settings",
  );

  await page.getByRole("button", { name: "Управлять только Farmer", exact: true }).click();
  assert.equal(
    await page.locator(".mf-plan-step").count(),
    1,
    "changing recipients preserves the scenario draft",
  );
  await reset();
  await page.getByRole("button", { name: "Запустить сценарий", exact: true }).click();
  await wait();
  assert.deepEqual(
    starts(await calls()).map((call) => call.args.botId),
    ["farmer"],
  );

  await page.getByRole("checkbox", { name: "Выбрать Miner_2 для команд", exact: true }).check();
  await reset();
  await page.getByRole("button", { name: "Ко мне", exact: true }).click();
  await wait();
  assert.deepEqual(
    (await calls())
      .filter((call) => call.args.message === "come")
      .map((call) => call.args.botId)
      .sort(),
    ["farmer", "miner-2"],
  );
  await page.locator("summary").filter({ hasText: "Сохранённые группы" }).click();
  await page.getByRole("textbox", { name: "Название группы", exact: true }).fill("Отряд");
  await page.getByRole("button", { name: "Сохранить выбор", exact: true }).click();
  await page.reload();
  await page.locator("summary").filter({ hasText: "Сохранённые группы" }).click();
  await page.getByRole("button", { name: "Отряд 2", exact: true }).click();
  assert.ok(
    await page
      .getByRole("checkbox", { name: "Выбрать Miner_2 для команд", exact: true })
      .isChecked(),
  );
  assert.equal(await page.locator(".mf-plan-step").count(), 1, "draft survives reload");

  await page.evaluate(() => {
    window.fleetQA.failBotId = "miner-2";
  });
  await reset();
  await page.getByRole("button", { name: "Запустить у 2 ботов", exact: true }).click();
  await wait();
  assert.deepEqual(
    starts(await calls()).map((call) => call.args.botId),
    ["farmer"],
  );
  assert.ok(await page.getByText("Бот временно недоступен", { exact: true }).count());
  await page.evaluate(() => {
    window.fleetQA.failBotId = "";
  });

  await page.getByRole("button", { name: "Инвентарь", exact: true }).click();
  await page.getByRole("button", { name: "Подробности бота", exact: true }).click();
  await page.getByRole("option", { name: "Miner_2", exact: true }).click();
  assert.ok(
    await page
      .getByRole("checkbox", { name: "Выбрать Miner_2 для команд", exact: true })
      .isChecked(),
  );
  assert.ok(
    await page
      .getByRole("checkbox", { name: "Выбрать Farmer для команд", exact: true })
      .isChecked(),
  );
  assert.ok(
    await page
      .getByText("Инвентарь, рабочие блоки и настройки относятся к этому боту.", { exact: false })
      .count(),
  );

  await page.getByRole("button", { name: "Журнал и чат", exact: true }).click();
  await page.getByRole("textbox", { name: "Сообщение от имени бота", exact: true }).fill("follow");
  await reset();
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await wait();
  assert.equal(
    (await calls()).filter((call) => call.args.message === "follow" && call.args.command === true)
      .length,
    2,
  );
  await page.getByRole("button", { name: "Режим отправки", exact: true }).click();
  await page.getByRole("option", { name: "Сообщение в игру", exact: true }).click();
  await page.getByRole("textbox", { name: "Сообщение от имени бота", exact: true }).fill("hello");
  await reset();
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await wait();
  assert.equal(
    (await calls()).filter((call) => call.args.message === "hello" && call.args.command === false)
      .length,
    2,
  );

  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await page.evaluate(() => {
    window.fleetQA.workflow("farmer", "running");
    window.fleetQA.workflow("miner-2", "paused");
  });
  await reset();
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await wait();
  assert.deepEqual(
    (await calls()).filter((call) => call.args.action === "pause").map((call) => call.args.botId),
    ["farmer"],
  );
  await reset();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await wait();
  assert.deepEqual(
    (await calls()).filter((call) => call.args.action === "resume").map((call) => call.args.botId),
    ["miner-2"],
  );
  assert.equal(await page.locator(".mf-group-progress-bot").count(), 2);
  await page.evaluate(() => {
    window.fleetQA.workflow("farmer", "idle");
    window.fleetQA.workflow("miner-2", "idle");
    window.fleetQA.slow = true;
  });
  await reset();
  await page.getByRole("button", { name: "Запустить у 2 ботов", exact: true }).click();
  await page.getByRole("button", { name: "Стоп задач", exact: true }).click();
  await page.evaluate(() => window.fleetQA.release());
  await wait();
  sent = await calls();
  const slowId = sent.find((call) => call.command === "configure_mineflayer_bot_storage").args
    .botId;
  assert.equal(
    starts(sent).some((call) => call.args.botId === slowId),
    false,
    "stop cancels pending scenario dispatch",
  );

  await page.getByRole("button", { name: "Выбрать всех", exact: true }).click();
  await reset();
  await page.getByRole("button", { name: "Подключить выбранных", exact: true }).click();
  await wait();
  assert.deepEqual(
    (await calls())
      .filter((call) => call.command === "start_mineflayer_bot")
      .map((call) => call.args.botId),
    ["offline"],
  );

  const output = path.resolve(process.env.FLEET_SCREENSHOT_DIR || "artifacts/bot-fleet.local");
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 620, height: 1000 });
  await page.screenshot({ path: path.join(output, "narrow.png"), fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
    "narrow layout must not overflow",
  );
  await page.evaluate(() => window.fleetQA.setLocale("en"));
  await page.getByRole("button", { name: "Run for 4 bots", exact: true }).waitFor();
  await page.evaluate(() => window.fleetQA.setLocale("ru"));
  await page.setViewportSize({ width: 1320, height: 1050 });
  await page.goto(`${url}?extraBots=96`);
  await page.getByRole("button", { name: "Выбрать всех", exact: true }).click();
  assert.equal(
    await page.locator(".mf-workspace-targets").count(),
    0,
    "no duplicate recipient list",
  );
  const progress = page.locator(".mf-group-progress");
  assert.equal(await progress.count(), 1, "one progress panel for 100 bots");
  assert.equal(await progress.getAttribute("open"), null, "large fleets start collapsed");
  assert.ok((await progress.boundingBox()).height < 70, "collapsed progress stays compact");
  await progress.locator("summary").click();
  assert.equal(await progress.locator(".mf-group-progress-bot").count(), 100);
  await progress.locator(".csa-thumb").waitFor({ state: "visible" });
  const dimensions = await progress.evaluate((panel) => {
    const scroll = panel.querySelector(".csa-content");
    return {
      panel: panel.getBoundingClientRect().height,
      viewport: scroll.clientHeight,
      content: scroll.scrollHeight,
    };
  });
  assert.ok(
    dimensions.panel < 280 && dimensions.viewport <= 216,
    "expanded progress height is bounded",
  );
  assert.ok(dimensions.content > dimensions.viewport, "100 cards scroll inside the panel");
  const viewport = progress.locator(".csa-content");
  await viewport.hover();
  await page.mouse.wheel(0, 650);
  await page.waitForFunction(
    () => document.querySelector(".mf-group-progress .csa-content").scrollTop > 0,
  );
  await page.screenshot({ path: path.join(output, "100-bots.png"), fullPage: true });
  await progress.locator("summary").click();
  assert.ok((await progress.boundingBox()).height < 70, "progress folds back into one row");
  await page.setViewportSize({ width: 620, height: 1000 });
  await progress.locator("summary").click();
  assert.ok(
    (await progress.boundingBox()).height < 280,
    "narrow windows keep the same height limit",
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Unified bot workspace passed, including 100 bots in one collapsible panel with a bounded custom scrollbar.",
  );
} catch (failure) {
  const output = path.resolve(process.env.FLEET_SCREENSHOT_DIR || "artifacts/bot-fleet.local");
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  throw failure;
} finally {
  await browser.close();
}
