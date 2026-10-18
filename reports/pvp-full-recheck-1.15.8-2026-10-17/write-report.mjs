import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const extension = path.resolve(dir, "../../extensions/mineflayer-bot");
const read = (name) =>
  JSON.parse(readFileSync(path.join(dir, name), "utf8").replace(/^\uFEFF/, ""));
const cpu = read("paired-cpu-results.json");
const separate = read("results.json");
const duels = read("duel-results.json");
const status = read("functional-status.json");
const equivalence = read("equivalence-results.json");
const navigationRetries = read("navigation-water-retries.json");
const attributesRetry = read("navigation-attributes-retry.json");
const sources = read("current-source.json");
const changedSource = Object.entries(sources.sha256)
  .filter(
    ([name, hash]) =>
      createHash("sha256")
        .update(readFileSync(path.join(extension, name)))
        .digest("hex") !== hash,
  )
  .map(([name]) => name);
assert.deepEqual(changedSource, [], "application sources changed during the test run");
const number = (value, digits = 3) =>
  value == null ? "—" : value.toFixed(digits).replace(".", ",");
const clock = (value) => new Date(value).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
const trio = (row, field, digits = 0) =>
  ["reference", "before", "after"].map((key) => number(row[key][field], digits)).join(" → ");
const suite = (name) => {
  const log = readFileSync(path.join(dir, `${name}-tests.txt`), "utf8");
  const get = (field) => Number(log.match(new RegExp(`(?:ℹ|#) ${field} (\\d+(?:\\.\\d+)?)`))?.[1]);
  const result = {
    tests: get("tests"),
    pass: get("pass"),
    fail: get("fail"),
    cancelled: get("cancelled"),
    skipped: get("skipped"),
    durationMs: get("duration_ms"),
  };
  assert.ok(Number.isFinite(result.tests), `missing ${name} summary`);
  return result;
};
const suites = { worker: suite("worker"), pathfinder: suite("pathfinder") };
const navigationLog = readFileSync(path.join(dir, "pathfinder-tests.txt"), "utf8");
const navigationFailures = [
  ...(navigationLog.split("✖ failing tests:")[1] ?? "").matchAll(/^\s*✖ (.+) \([\d.]+ms\)/gm),
].map((match) => match[1]);
const names = {
  cadence: "Обычная серия ударов",
  wall: "Цель прижата к стене",
  approach: "Сближение с 12 блоков",
  runner: "Погоня за спринтующим",
  zigzag: "Спринт зигзагом",
  strafer: "Противник стрейфится",
  shield: "Периодически поднятый щит",
  shieldLate: "Щит поднят перед ударом",
  eating: "Противник ест яблоко",
  pillar: "Цель на столбе высотой 2 блока",
};
const cpuNames = {
  "action-and-item": "Выбор действия и предмета",
  "movement-open-ground": "Расчёт движения",
  "crystal-new-layout": "Новая кристальная комбинация",
  "crystal-continue-layout": "Продолжение кристальной комбинации",
  "crystal-existing-base": "Кристалл на готовом основании",
  "pearl-travel": "Подбор перла для перемещения",
  "pearl-exact-pursuit": "Подбор перла для преследования",
};
const cpuTable = (rows) =>
  [
    "| Расчёт | 1.15.6, мс | До оптимизации: 1.15.7, мс | Сейчас: 1.15.8, мс |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${cpuNames[row.name]} | ${["reference", "before", "after"].map((key) => number(row.profiles[key].medianMs, 6)).join(" | ")} |`,
    ),
  ].join("\n");
const battleTables = [];
for (const version of ["1.20.4", "26.1.2"]) {
  for (const profile of ["default", "aggressive"]) {
    const rows = duels.comparison.filter(
      (row) => row.version === version && row.profile === profile,
    );
    assert.equal(rows.length, 10);
    battleTables.push(
      `**Minecraft ${version}, ${profile === "default" ? "обычные настройки" : "агрессивный профиль"}.**\n\n` +
        [
          "| Сценарий | Время сценария, с | Попадания | Урон, HP | Криты | Первый удар, мс | Средний интервал, мс |",
          "| --- | ---: | --- | --- | --- | --- | --- |",
          ...rows.map(
            (row) =>
              `| ${names[row.scenario]} | ${duels.scenarios[row.scenario].ticks * 0.05} | ${trio(row, "landed")} | ${trio(row, "damage", 1)} | ${trio(row, "critical")} | ${trio(row, "firstHitMs")} | ${trio(row, "meanIntervalMs", 1)} |`,
          ),
        ].join("\n"),
    );
  }
}
const checkNames = [
  [/cornered opponent every 13 ticks/, "Удары у стены каждые 650 мс с критами"],
  [/sprint jumps catch/, "Спринт-прыжки догоняют убегающего"],
  [/two-block pillar/, "Удар снизу по цели на двухблочном столбе"],
  [/shield raised as the hit becomes ready/, "Удар во время подъёма щита"],
  [/real wind-charge, mace and shield packets/, "Пакеты заряда ветра, булавы и щита"],
  [/wind jump waits for real descent/, "Булава ждёт реального падения и досягаемости"],
  [/wind launch holds its blast position/, "Удержание позиции до подтверждённого импульса"],
  [/bundled come plans an entire tall tower/, "Come планирует высокую башню"],
];
const workerLog = readFileSync(path.join(dir, "worker-tests.txt"), "utf8");
const selectedChecks = checkNames.map(([pattern, title]) => {
  const lines = workerLog
    .split(/\r?\n/)
    .filter((line) => pattern.test(line) && /^\s*[✔✖]/.test(line));
  return `| ${title} | ${lines.length && lines.every((line) => /^\s*✔/.test(line)) ? "PASS" : "См. журнал"} |`;
});
const checks = {
  sourcesUnchanged: changedSource.length === 0,
  suites,
  functionalStatus: status,
  equivalence,
  measuredDuelRuns: duels.comparison.length * duels.repeats * 3,
  cpuMethod: cpu.method,
  navigationFailures,
  navigationRetries,
  attributesRetry,
};
writeFileSync(path.join(dir, "summary.json"), `${JSON.stringify(checks, null, 2)}\n`);
const report = `# Полная повторная проверка PvP и навигации — 1.15.8

Запущены оба полных набора тестов бота и навигации, все десять дуэльных сценариев
с двумя профилями на двух версиях Minecraft, семь CPU-замеров и три кристальных
сценария. Код приложения во время проверки не менялся. Контрольные суммы:
[current-source.json](current-source.json).

Сравнение везде одинаковое: **1.15.6 → 1.15.7 → 1.15.8**. 1.15.6 восстановлена
из Git, коммит \`0c57fcdab4617d607d701ad3ecd4062ae06e3800\`; 1.15.7 — сохранённые
пользовательские изменения до оптимизации; 1.15.8 — текущий код.

**Все автоматические тесты.**

| Набор | Всего | Прошли | Ошибки | Отменены/таймауты | Пропущены | Длительность, с |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${Object.entries(suites)
  .map(
    ([key, value]) =>
      `| ${key === "worker" ? "Бот: pnpm test:worker" : "Навигация: pnpm test:pathfinder"} | ${value.tests} | ${value.pass} | ${value.fail} | ${value.cancelled} | ${value.skipped} | ${number(value.durationMs / 1000, 2)} |`,
  )
  .join("\n")}

Бот: ${clock(status.worker.startedAt)}–${clock(status.worker.finishedAt)}, Москва.
Навигация: ${clock(status.pathfinder.startedAt)}–${clock(status.pathfinder.finishedAt)}, Москва.
Полные журналы каждого теста: [worker-tests.txt](worker-tests.txt),
[pathfinder-tests.txt](pathfinder-tests.txt); коды выхода — [functional-status.json](functional-status.json).

${suites.worker.fail ? "Единственное падение worker-набора — `worker honors disabled STAY ON WATER and disconnect removes the overlay`: ожидается исходная ссылка на `setControlState`, получается `[Function: setControl]`. Оно также заново воспроизведено на закоммиченной 1.15.6, до текущих оптимизаций. [Журнал базовой версии](baseline-water-test.txt), [проверка исходников из Git](baseline-water-source.json). Полный worker-набор возвращает код 1 и не считается зелёным." : "Все worker-тесты прошли."}

${suites.pathfinder.fail || suites.pathfinder.cancelled ? `В полном наборе навигации не прошли: ${navigationFailures.map((name) => `\`${name}\``).join(", ")}. Сценарий выхода из воды на 26.1.2 отдельно повторён трижды: ${navigationRetries.map((run, i) => `повтор ${i + 1} — ${run.exitCode === 0 ? "PASS" : "FAIL"}`).join("; ")}. Это нестабильная проверка; повторные успешные запуски не отменяют падение полного прогона. Исходники и тесты навигации совпадают с 1.15.6: [navigation-source-check.json](navigation-source-check.json). Журналы повторов: [1](navigation-water-retry-1.txt), [2](navigation-water-retry-2.txt), [3](navigation-water-retry-3.txt).` : "Все тесты навигации прошли."}

Проверки сохранения атрибутов движения после плавания на обеих версиях Minecraft
также повторены отдельно: оба сценария снова превысили лимит 8500 мс,
код выхода ${attributesRetry.exitCode}. Полный результат:
[navigation-attributes-retry.txt](navigation-attributes-retry.txt).

В не прошедшем сценарии выхода из воды бот достиг цели и встал на землю.
Проверка остановилась на подсчёте поисков после выхода на берег:
ожидалось 0 повторных поисков подтверждённого маршрута, получилось 1.

| Проверка из полного набора | Результат |
| --- | --- |
${selectedChecks.join("\n")}

**Все дуэльные сценарии.** По ${duels.repeats} повтора для каждой версии кода:
10 сценариев × 2 версии Minecraft × 2 профиля × 3 версии кода × ${duels.repeats} повтора
= **${checks.measuredDuelRuns} симуляций**. Во всех повторах каждой версии боевые результаты
воспроизводятся. Для 1.15.7 и 1.15.8 проверено точное совпадение атак, попаданий,
урона, критов, спринт-ударов, блокирований, ударов вне досягаемости, первого удара,
среднего интервала, дистанции и тиков с активным маршрутом.

Попадание — удар, нанёсший положительный урон; это не количество отправленных
пакетов атаки. Урон указан в HP: 2 HP = одно сердце. Средний интервал считается
между успешными попаданиями; тире означает, что попаданий для расчёта нет.
В каждой ячейке ниже: **1.15.6 → 1.15.7 → 1.15.8**.

${battleTables.join("\n\n")}

В сценарии «столб» проверяется удар снизу по цели на **двухблочном** столбе.
Это не проверка бесконечного подъёма зарядами ветра по огромной колонне с ваших
скриншотов. Полный набор содержит отдельные проверки прыжков с зарядом ветра
и булавой, но отдельного сценария длительного подъёма по той колонне в нём нет.

Используются физика Mineflayer, Custom PvP, навигатор и настоящая сериализация
пакетов. Противник задан сценарием и не атакует; серверная оценка урона приближённая.
Это симуляции без сетевого джиттера. Подробные значения, включая время CPU на тик,
находятся в [duel-results.json](duel-results.json) и каталоге \`duel-raw/\`.

**Все CPU-замеры.** ${clock(cpu.startedAt)}–${clock(cpu.finishedAt)}, Москва.
${cpu.node}, ${cpu.cpu}, Minecraft 26.1.2. Три повтора по 100 выборок после
20 прогревочных. На каждой выборке версии поочерёдно выполняются в одном
процессе с меняющимся порядком. Движение измерено пачками по 50 вызовов,
выбор действия — по 1000; цифры пересчитаны на один вызов. Таблица содержит
медиану трёх медиан. Подготовка мира и загрузка модулей исключены.

${cpuTable(cpu.rows)}

Старые числа из прошлых сообщений не смешиваются со свежими: все три версии
в этом отчёте измерены заново. Времена неизменённых функций могут колебаться
из-за среды и JIT. Логика выбора действия и кристального планировщика между
1.15.7 и 1.15.8 совпадает побайтно; все измеренные решения также совпали.
Все выборки: [paired-cpu-results.json](paired-cpu-results.json).

Для сопоставления с прежней методикой проведён ещё один полный замер отдельными
процессами, с чередованием версий между повторами:

${cpuTable(separate.cpuResults)}

Результаты: [results.json](results.json), каталог \`raw/\`.

**Кристальная цепочка и реакция на постановку.** Это игровое время в симуляции
при тике 50 мс; оно отделено от CPU-расчётов выше. По три повтора для каждой версии.

| Сценарий | 1.15.6, мс | 1.15.7, мс | 1.15.8, мс |
| --- | ---: | ---: | ---: |
${separate.simulationResults.map((row) => `| ${{ "foundation-crystal-attack": "Основание → кристалл → удар", "target-enters-range-placement": "Новая возможность постановки → постановка", "confirmed-base-placement": "Подтверждение основания → постановка кристалла" }[row.name]} | ${["reference", "before", "after"].map((key) => row.profiles[key].medianMs).join(" | ")} |`).join("\n")}

Сериализация пакетов проверена; все повторы дали одинаковые сроки.

**Дополнительное сравнение решений.** ${equivalence.corridors} проверок коридора,
${equivalence.controlTicks} тиков управления, ${equivalence.pearlFlights} траекторий
и ${equivalence.pearlPlans} полных подборов перла: решения до и после оптимизации
совпали. [equivalence-results.json](equivalence-results.json).

Скрипты для повтора лежат рядом с отчётом: \`run.mjs\`, \`paired-cpu.mjs\`,
\`run-duels.mjs\`, \`equivalence.mjs\`. Сначала выполняется \`run.mjs\`, затем остальные.
Полные функциональные наборы повторяются командами \`pnpm test:worker\` и
\`pnpm test:pathfinder\` из корня проекта. Настройки и контрольные суммы сохранены.
`;
writeFileSync(path.join(dir, "REPORT.md"), report);
