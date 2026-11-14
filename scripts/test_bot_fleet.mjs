// Start Vite first. PLAYWRIGHT_MODULE can point at a bundled Playwright entry point.
/* global window, document */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(entry ? pathToFileURL(path.resolve(entry)).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 1100 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const calls = () => page.evaluate(() => window.fleetQA.calls);
const reset = () =>
  page.evaluate(() => {
    window.fleetQA.calls = [];
  });
const send = page.getByRole("button", { name: "Выдать задачу получателям", exact: true });
const wait = () =>
  page.waitForFunction(
    () => !document.querySelector('.mf-fleet-task-form button[type="submit"]').disabled,
  );
const url = `${process.env.CONTROL_TEST_URL || "http://127.0.0.1:1420"}/scripts/fixtures/bot-fleet/index.html`;
try {
  await page.goto(url);
  await send.waitFor();
  await page.getByRole("checkbox", { name: "Выбрать Miner_2 для команд", exact: true }).check();
  await page.getByRole("checkbox", { name: "Выбрать Sleeper для команд", exact: true }).check();
  await send.click();
  await wait();
  let sent = await calls();
  assert.deepEqual(
    sent.filter((call) => call.args.message?.startsWith("mine ")).map((call) => call.args.botId),
    ["default", "miner-2"],
  );
  assert.equal(
    sent.some((call) => call.args.botId === "offline" || call.args.botId === "farmer"),
    false,
  );
  assert.ok(
    await page
      .getByText("Бот не подключён. Подключите его и повторите отправку", { exact: true })
      .count(),
  );

  await reset();
  await page.getByRole("checkbox", { name: "Выбрать Sleeper для команд", exact: true }).uncheck();
  await page
    .getByRole("checkbox", { name: "Разделить общее количество между ботами", exact: true })
    .check();
  await send.click();
  await wait();
  sent = await calls();
  assert.equal(sent.filter((call) => call.args.message === "mine stone 32 32").length, 2);

  await page.getByRole("button", { name: "Открыть панель Farmer", exact: true }).click();
  assert.equal(await page.locator("#inspected").textContent(), "farmer");
  await reset();
  await page.getByRole("button", { name: "Ко мне", exact: true }).click();
  await wait();
  assert.deepEqual((await calls()).map((call) => call.args.botId).sort(), ["default", "miner-2"]);

  await page.getByText("Сохранённые группы", { exact: true }).click();
  await page.getByRole("textbox", { name: "Название группы", exact: true }).fill("Шахтёры");
  await page.getByRole("button", { name: "Сохранить выбор", exact: true }).click();
  await page.reload();
  await page.getByText("Сохранённые группы", { exact: true }).click();
  await page.getByRole("button", { name: "Шахтёры · 2", exact: true }).click();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Выбрать Miner_2 для команд", exact: true })
      .isChecked(),
    true,
  );

  await reset();
  await page.evaluate(() => {
    window.fleetQA.failBotId = "miner-2";
  });
  await send.click();
  await wait();
  assert.ok(
    (await calls()).some(
      (call) => call.args.botId === "default" && call.args.message?.startsWith("mine "),
    ),
  );
  assert.ok(await page.getByText("Fixture: bot unavailable", { exact: false }).count());
  await page.evaluate(() => {
    window.fleetQA.failBotId = "";
  });

  await reset();
  await page
    .getByRole("textbox", { name: "Команда или сообщение выбранным ботам", exact: true })
    .fill("follow");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await wait();
  assert.ok(
    (await calls()).every((call) => call.args.command === true && call.args.message === "follow"),
  );
  await page.getByRole("button", { name: "Режим отправки", exact: true }).click();
  await page.getByRole("option", { name: "Сообщение в игру", exact: true }).click();
  await reset();
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await wait();
  assert.ok((await calls()).every((call) => call.args.command === false));

  await reset();
  await page.evaluate(() => {
    window.fleetQA.slow = true;
  });
  await send.click();
  await page.getByRole("button", { name: "Стоп задач", exact: true }).click();
  await page.evaluate(() => window.fleetQA.release());
  await wait();
  sent = await calls();
  const stopIndex = sent.findIndex(
    (call) => call.args.botId === "default" && call.args.message === "stop",
  );
  assert.ok(stopIndex >= 0);
  assert.equal(
    sent
      .slice(stopIndex + 1)
      .some((call) => call.args.botId === "default" && call.args.message?.startsWith("mine ")),
    false,
  );

  await page.getByRole("button", { name: "Все подключённые", exact: true }).click();
  await reset();
  await page.getByRole("button", { name: "Следовать за мной", exact: true }).click();
  await wait();
  assert.deepEqual((await calls()).map((call) => call.args.botId).sort(), [
    "default",
    "farmer",
    "miner-2",
  ]);

  const output = path.resolve(process.env.FLEET_SCREENSHOT_DIR || "artifacts/bot-fleet.local");
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 430, height: 1000 });
  await page.screenshot({ path: path.join(output, "narrow.png"), fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
    "narrow layout must not overflow horizontally",
  );
  await page.evaluate(() => window.fleetQA.setLocale("en"));
  await page.getByRole("button", { name: "Assign task to recipients", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Fleet UI passed: recipients, work sharing, independent inspection, saved groups, partial errors, command/chat modes, stop cancellation, all-connected scope, narrow layout and English locale.",
  );
} finally {
  await browser.close();
}
