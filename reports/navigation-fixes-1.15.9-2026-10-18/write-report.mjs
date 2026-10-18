import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../extensions/mineflayer-bot");
const read = (name) =>
  JSON.parse(readFileSync(path.join(dir, name), "utf8").replace(/^\uFEFF/, ""));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const testedSource = read("tested-source.json");
for (const [name, hash] of Object.entries(testedSource.sha256))
  assert.equal(
    digest(readFileSync(path.join(root, name))),
    hash,
    `source changed during verification: ${name}`,
  );
const suites = {};
for (const name of ["worker", "navigation"]) {
  const log = readFileSync(path.join(dir, `${name}-tests.txt`), "utf8");
  const get = (key) => Number(log.match(new RegExp(`(?:ℹ|#) ${key} (\\d+(?:\\.\\d+)?)`))?.[1]);
  suites[name] = Object.fromEntries(
    ["tests", "pass", "fail", "cancelled", "skipped", "duration_ms"].map((key) => [key, get(key)]),
  );
  assert.equal(suites[name].fail, 0, `${name}: failures remain`);
  assert.equal(suites[name].cancelled, 0, `${name}: timeouts remain`);
  assert.equal(suites[name].skipped, 0, `${name}: tests skipped`);
  assert.equal(suites[name].pass, suites[name].tests);
}
const navStatus = read("navigation-status.json"),
  workerStatus = read("worker-status.json");
assert.equal(navStatus.exitCode, 0);
assert.equal(workerStatus.exitCode, 0);
const duel = read("duel-comparison.json");
assert.deepEqual(duel.changes, []);
const archive = JSON.parse(readFileSync(path.join(root, "pathfinder-source.json"), "utf8"));
for (const [name, source] of Object.entries(archive.files))
  assert.equal(readFileSync(path.join(root, name), "utf8"), source, `stale archive: ${name}`);
const previous = JSON.parse(
  readFileSync(path.join(dir, "../pvp-full-recheck-1.15.8-2026-10-17/current-source.json"), "utf8"),
);
const rootChanges = Object.entries(previous.sha256)
  .filter(([name, hash]) => digest(readFileSync(path.join(root, name))) !== hash)
  .map(([name]) => name)
  .sort();
assert.deepEqual(
  rootChanges,
  [
    "extension.json",
    "package-lock.json",
    "package.json",
    "pathfinder-source.json",
    "pathfinder.cjs",
    "pathfinder.test.mjs",
  ].sort(),
);
const before = read("before-source.json");
const after = Object.fromEntries(
  Object.keys(before.sha256).map((name) => [name, digest(readFileSync(path.join(root, name)))]),
);
const summary = {
  date: new Date().toISOString(),
  version: "1.15.9",
  suites,
  rootChanges,
  archiveFilesVerified: Object.keys(archive.files).length,
  duel,
  sourceSha256: after,
};
writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
const n = (value) => value.toFixed(2).replace(".", ",");
const trace = (version, label) =>
  read(`trace-${version}-${label}.json`).rows.find((row) => row.event === "arrived").ms;
const report = `# Исправлены четыре не прошедшие проверки — 1.15.9

Все четыре прежних сбоя устранены с исходными лимитами времени и проверками
результата. Дополнительно добавлены три регрессионных сценария. Изменения
применены к текущим рабочим файлам; коммит не создавался.

| Проверка | До | После |
| --- | --- | --- |
| STAY ON WATER выключен, очистка при отключении | FAIL: лишняя подмена setControlState | PASS |
| Выход на берег с подтверждённым продолжением, 26.1.2 | Иногда лишний поиск: 1 вместо 0 | PASS, включая принудительно частичный маршрут |
| Плавание → паркур с серверным бонусом скорости, 1.20.4 | Таймаут 8500 мс | PASS, тот же лимит 8500 мс |
| То же, 26.1.2 | Таймаут 8500 мс | PASS, тот же лимит 8500 мс |

**Причины и исправления.**

- Обработчик прыжков под низким потолком устанавливался даже при запрещённом
  спринте. Теперь он подключается только когда спринт разрешён; изменение
  настроек включает и выключает его корректно. Отключённый STAY ON WATER и
  отключение бота восстанавливают ожидаемое управление.
- Частичный водный маршрут мог уже привести на нужный берег. Его статус всё
  равно запускал ещё один поиск с нулём шагов, прежде чем использовалось
  подтверждённое сухое продолжение. Теперь достижение берега проверяется и у
  частичного маршрута; используется сохранённое продолжение. Проверки реального
  положения и опоры, а также достижения цели сохранены.
- После прыжка бот с серверным бонусом скорости слишком сильными полными
  шагами корректировал положение около центра блока и раскачивался до
  срабатывания восстановления. Точная остановка теперь использует небольшую
  коррекцию с приседанием только при серверном бонусе скорости, вблизи цели
  и при почти погашенной скорости. Обычный спринтовый модификатор исключён из
  расчёта; обычная ходьба не получает лишних приседаний.
  Допуск позиции 0,08 блока и предел скорости остановки 0,025 не менялись.
  Обработчик полёта после реального приземления передаёт управление остановкой
  навигатору. Серверные атрибуты и их модификаторы сохранены.

Диагностический полный маршрут «плавание → прыжок → остановка» до и после,
без изменения физики или скорости тиков:

| Minecraft | До исправления, с | После, с |
| --- | ---: | ---: |
| 1.20.4 | ${n(trace("1.20.4", "before") / 1000)} | ${n(trace("1.20.4", "final") / 1000)} |
| 26.1.2 | ${n(trace("26.1.2", "before") / 1000)} | ${n(trace("26.1.2", "final") / 1000)} |

В диагностике был отдельный предохранитель 12 с для наблюдения поведения до
исправления; исходные регрессионные тесты сохраняют свой лимит **8,5 с**.
Никакие проверки достижения цели, атрибутов, модификаторов, положения тела и
приземления из исходных тестов не убирались. При отмене теста маршрут теперь
также корректно останавливается.

**Полные проверки после исправления.**

| Набор | Прошли | Ошибки | Таймауты/отмены | Пропущены | Время, с |
| --- | ---: | ---: | ---: | ---: | ---: |
| Бот, pnpm test:worker | ${suites.worker.pass}/${suites.worker.tests} | 0 | 0 | 0 | ${n(suites.worker.duration_ms / 1000)} |
| Все исходные тесты навигации | ${suites.navigation.pass}/${suites.navigation.tests} | 0 | 0 | 0 | ${n(suites.navigation.duration_ms / 1000)} |

Навигация: те же ${navStatus.files.length} файлов \`.test.ts\`, которые загружает
\`tests/run.cjs\`; каждый файл запускается изолированно, четыре процесса
одновременно. Все тесты и их таймауты сохранены. Скрипт и точный список файлов:
[run-navigation.cjs](run-navigation.cjs), [navigation-status.json](navigation-status.json).

Журналы: [worker-tests.txt](worker-tests.txt), [navigation-tests.txt](navigation-tests.txt).
Первый целевой запуск: [focused-worker-tests.txt](focused-worker-tests.txt),
[focused-source-tests.txt](focused-source-tests.txt).

После ограничения точной коррекции бонусом скорости отдельно повторены оба
исходных сценария и тест обычного тоннеля без приседаний:
[precision-regression-tests.txt](precision-regression-tests.txt). Промежуточный
полный прогон сохранён в \`round-1/\`; его единственное замечание к обычной
ходьбе исправлено до окончательных полных прогонов выше.

Новые проверки: включение и отключение спринта без ненужной подмены управления;
завершённый водный маршрут со статусом частичного на 1.20.4 и 26.1.2. Для
последних возвращается реальная рассчитанная траектория до берега, а её статус
имитирует достижение границы временного бюджета. Проверяется отсутствие лишнего
поиска при переходе на сохранённое продолжение.

**Сохранение PvP.** ${duel.scenarios} симуляций: 10 сценариев × 2 профиля ×
2 версии Minecraft. В сравнении с 1.15.8 совпали попадания, урон, криты,
спринт-удары, блокирования, удары вне досягаемости, время первого попадания,
средний интервал, дистанция и число тиков с маршрутом.
[duel-comparison.json](duel-comparison.json). Это прежние симуляции с физикой
Mineflayer и запрограммированным противником, без сетевой задержки.

**Упаковка и сохранность изменений.** \`pnpm build:pathfinder\` и TypeScript
прошли; пересобран \`pathfinder.cjs\`. Все ${Object.keys(archive.files).length}
файлов внутри \`pathfinder-source.json\` совпадают с рабочими исходниками.
Версия расширения — 1.15.9. Пользовательские изменения PvP и оптимизации 1.15.8
сохранены: контрольные суммы остальных корневых исходников совпадают.
Контрольные суммы и итог: [summary.json](summary.json),
исходное состояние: [before-source.json](before-source.json).
`;
writeFileSync(path.join(dir, "REPORT.md"), report);
