const { EventEmitter } = require("node:events");
const { Vec3 } = require("vec3");
const { goals } = require("./pathfinder.cjs");
const { queueInventoryTask } = require("./combat-inventory.cjs");
const {
  integer,
  itemByName,
  planCraft,
  smeltingRecipe,
  fuelItems,
  inventoryItems,
  emptySlots,
} = require("./production-plan.cjs");
const { isStorage, discoverBlocks, inspectContents, assignStorage } = require("./storage-scan.cjs");

const STATIONS = new Set([
  "crafting_table",
  "furnace",
  "blast_furnace",
  "smoker",
  "anvil",
  "chipped_anvil",
  "damaged_anvil",
  "enchanting_table",
  "brewing_stand",
  "stonecutter",
  "smithing_table",
  "grindstone",
  "loom",
  "cartography_table",
  "chest",
  "trapped_chest",
  "ender_chest",
  "barrel",
  "hopper",
  "dispenser",
  "dropper",
  "shulker_box",
  "crafter",
]);
const supported = (name) => STATIONS.has(name) || /_shulker_box$/.test(name);
class Cancelled extends Error {
  constructor() {
    super("Работа остановлена");
  }
}

function createProductionController(bot, hooks = {}) {
  const {
    onStatus = () => {},
    onError = () => {},
    onStart = () => {},
    operationTimeoutMs = 20000,
    moveTimeoutMs = 60000,
    smeltTimeoutMs = 900000,
    pollMs = 250,
  } = hooks;
  let job = null,
    pending = Promise.resolve(),
    session = null,
    disposed = false;
  let message = "Готов к работе",
    phase = "idle";
  let outcome = null;
  const properties = new Map();
  let scanSequence = 0,
    nearbyScan = null,
    storageScan = null;
  const report = (text) => {
    message = text;
    onStatus(text);
  };
  const available = () => {
    if (disposed || bot.health <= 0 || bot.isAlive === false)
      throw new Error("Бот отключён или погиб");
    if (bot.launcherSurvival?.busy)
      throw new Error("Бот занят едой или спасением; повторите после завершения");
  };
  function guard(signal) {
    if (signal.aborted || disposed) throw new Cancelled();
    available();
    if (bot.currentWindow && bot.currentWindow !== session?.window)
      throw new Error("Закройте другое открытое окно бота");
  }
  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Cancelled());
      const done = (error) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => done(new Cancelled());
      const timer = setTimeout(done, ms);
      signal.addEventListener("abort", cancel, { once: true });
    });
  }
  async function atomic(action, signal) {
    guard(signal);
    // Keep the shared inventory lock until the underlying Mineflayer action
    // settles. Cancellation cannot leave clicks running over a later job.
    const result = await action();
    guard(signal);
    return result;
  }
  function close() {
    const previous = session;
    session = null;
    properties.clear();
    if (previous && bot.currentWindow === previous.window) {
      try {
        previous.window.close();
      } catch (error) {
        if (!disposed) onError(error);
      }
    }
  }
  function click(block, feet = bot.entity.position) {
    if (!block) return null;
    const eye = feet.offset(0, bot.entity.eyeHeight || 1.62, 0);
    const delta = block.position.offset(0.5, 0.5, 0.5).minus(eye),
      distance = delta.norm();
    if (distance > 4.5) return null;
    const faces = [
      new Vec3(0, -1, 0),
      new Vec3(0, 1, 0),
      new Vec3(0, 0, -1),
      new Vec3(0, 0, 1),
      new Vec3(-1, 0, 0),
      new Vec3(1, 0, 0),
    ];
    if (bot.world?.raycast) {
      const hit = bot.world.raycast(eye, delta.normalize(), distance + 0.1);
      if (!hit?.position.equals(block.position) || !hit.intersect || !faces[hit.face]) return null;
      return { face: faces[hit.face], cursor: hit.intersect.minus(block.position) };
    }
    return { face: new Vec3(0, 1, 0), cursor: new Vec3(0.5, 0.5, 0.5) };
  }
  function find(names) {
    const ids = names.map((name) => bot.registry.blocksByName[name]?.id).filter((id) => id != null);
    return bot
      .findBlocks({ matching: ids, maxDistance: 32, count: 32 })
      .map((position) => bot.blockAt(position))
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position),
      );
  }
  async function approach(block, signal) {
    phase = "move";
    report(`Подхожу к ${block.name}`);
    if (!click(block)) {
      const goal = new goals.GoalNear(block.position.x, block.position.y, block.position.z, 3);
      goal.isEnd = (node) => Boolean(click(bot.blockAt(block.position), node.exitPos));
      let timer, rejectNavigation;
      const interrupted = new Promise((_, reject) => {
        rejectNavigation = reject;
      });
      const cancel = () => {
        void bot.pathfinder.stop().catch(onError);
        rejectNavigation(new Cancelled());
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        await Promise.race([
          atomic(() => bot.pathfinder.goto(goal), signal),
          interrupted,
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              void bot.pathfinder.stop().catch(onError);
              reject(new Error("Не удалось подойти к рабочему блоку за минуту"));
            }, moveTimeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        await bot.pathfinder.stop();
      }
    }
    guard(signal);
    bot.clearControlStates?.();
    bot.setControlState?.("sneak", false);
    if (bot.waitForTicks) await atomic(() => bot.waitForTicks(1), signal);
    const current = bot.blockAt(block.position);
    if (current?.name !== block.name || !click(current))
      throw new Error("Рабочий блок исчез или его грань недоступна");
    return current;
  }
  function expectedWindow(name, type) {
    type = type.replace(/^minecraft:/, "");
    if (name === "crafting_table") return /^(crafting|workbench)/.test(type);
    if (/anvil$/.test(name)) return /anvil/.test(type);
    if (name === "enchanting_table") return /enchant/.test(type);
    if (["smithing_table", "cartography_table", "brewing_stand"].includes(name))
      return type.includes(name.split("_")[0]);
    if (
      [
        "furnace",
        "smoker",
        "blast_furnace",
        "stonecutter",
        "grindstone",
        "loom",
        "hopper",
        "crafter",
      ].includes(name)
    )
      return type.includes(name);
    return /generic|chest|container|shulker|dispenser|dropper/i.test(type);
  }
  async function openAt(block, signal) {
    if (session?.position.equals(block.position) && bot.currentWindow === session.window)
      return session.window;
    close();
    if (bot.currentWindow) throw new Error("Закройте другое открытое окно бота");
    block = await approach(block, signal);
    phase = "open";
    const hit = click(block);
    return new Promise((resolve, reject) => {
      let timer,
        settled = false;
      const finish = (error, window) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        bot.off("windowOpen", opened);
        signal.removeEventListener("abort", cancel);
        if (error) reject(error);
        else resolve(window);
      };
      const cancel = () => finish(new Cancelled());
      const opened = (window) => {
        if (!expectedWindow(block.name, window.type)) {
          if (bot.currentWindow === window) window.close();
          finish(new Error(`Открылось неподходящее окно: ${window.type}`));
          return;
        }
        // prismarine-windows 2.10 retains the old smithing layout and gives the
        // crafter a synthetic output slot. The server sends four smithing slots
        // since 1.20 and nine crafter inputs; fix inventory offsets before use.
        const start =
          block.name === "smithing_table" && bot.registry.version[">="]("1.20")
            ? 4
            : block.name === "crafter"
              ? 9
              : window.inventoryStart;
        if (start !== window.inventoryStart) {
          window.inventoryStart = start;
          window.inventoryEnd = start + 36;
          window.hotbarStart = start + 27;
          window.craftingResultSlot = block.name === "crafter" ? -1 : start - 1;
          window.slots.length = start + 36;
        }
        session = { name: block.name, position: block.position.clone(), window };
        properties.clear();
        finish(null, window);
      };
      bot.on("windowOpen", opened);
      signal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(
        () => finish(new Error("Блок не открылся: проверьте доступ и свободную крышку")),
        operationTimeoutMs,
      );
      Promise.resolve()
        .then(() => {
          guard(signal);
          return bot.activateBlock(block, hit.face, hit.cursor);
        })
        .catch((error) => finish(error));
    });
  }
  async function placeTable(signal) {
    const item = inventoryItems(bot).find((item) => item.name === "crafting_table");
    if (!item) throw new Error("Нет верстака для установки");
    const feet = bot.entity.position.floored();
    for (const y of [0, -1])
      for (const [x, z] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ]) {
        const target = feet.offset(x, y, z),
          support = bot.blockAt(target.offset(0, -1, 0));
        if (
          bot.blockAt(target)?.name !== "air" ||
          support?.boundingBox !== "block" ||
          ["chest", "barrel", "hopper"].some((name) => support.name.includes(name)) ||
          supported(support.name)
        )
          continue;
        if (
          Object.values(bot.entities || {}).some(
            (entity) =>
              entity.isValid !== false &&
              entity.position &&
              entity.position.distanceTo(target.offset(0.5, 0, 0.5)) < 1,
          )
        )
          continue;
        if (!click(support)) continue;
        report("Устанавливаю верстак");
        await atomic(() => bot.equip(item, "hand"), signal);
        await atomic(() => bot.placeBlock(support, new Vec3(0, 1, 0)), signal);
        const placed = bot.blockAt(target);
        if (placed?.name !== "crafting_table")
          throw new Error("Сервер не подтвердил установку верстака");
        return placed;
      }
    throw new Error("Нет свободного места рядом для верстака; поставьте его рядом с ботом");
  }
  async function craftOne(recipe, table, signal) {
    if (hooks.craft) return atomic(() => hooks.craft(recipe, table), signal);
    // Use Mineflayer's installed crafting implementation with guarded calls and
    // an already opened table. Its private windowOpen wait never leaks onto bot.
    const managed = Object.create(bot),
      events = new EventEmitter();
    managed.addListener = events.addListener.bind(events);
    managed.removeListener = events.removeListener.bind(events);
    managed.activateBlock = () => queueMicrotask(() => events.emit("windowOpen", table));
    managed.closeWindow = () => {};
    for (const name of ["clickWindow", "putAway", "putSelectedItemRange"])
      managed[name] = (...args) => atomic(() => bot[name](...args), signal);
    require("mineflayer/lib/plugins/craft")(managed);
    await managed.craft(recipe, 1, table ? { name: "crafting_table" } : null);
  }
  async function recoverCraftInputs(window, size) {
    // Still inside the shared inventory queue: finish returning the cursor and
    // unused inputs before a stopped job releases ownership to the next job.
    // Never use putSelectedItemRange without room: it drops surplus on the ground.
    const current = () => !disposed && bot.health > 0 &&
      (bot.currentWindow || bot.inventory) === window;
    const free = () => window.slots.findIndex((item, index) =>
      index >= window.inventoryStart && index < window.inventoryEnd && !item);
    if (!current() || !bot.clickWindow) return;
    if (window.selectedItem) {
      const destination = free();
      if (destination < 0) return;
      await bot.clickWindow(destination, 0, 0);
    }
    for (let slot = 1; slot <= size; slot++) {
      if (!current() || free() < 0) return;
      if (window.slots[slot]) await bot.putAway(slot);
    }
  }
  async function executeCraft(steps, signal, mode, table) {
    for (const step of steps) {
      // Keep recursive recipes in the same window. Closing a table between
      // planks, sticks and the tool lets late server packets overwrite stock.
      const needsTable = step.recipe.requiresTable || mode === "table" || Boolean(table);
      if (needsTable) {
        if (!table) table = find(["crafting_table"])[0] || (await placeTable(signal));
        await openAt(table, signal);
      } else close();
      phase = "craft";
      report(`Крафчу ${step.name} × ${step.times * step.recipe.result.count}`);
      for (let index = 0; index < step.times; index++) {
        guard(signal);
        const window = needsTable ? session.window : bot.inventory;
        if (window.selectedItem || window.slots?.slice(1, needsTable ? 10 : 5).some(Boolean))
          throw new Error(
            "Освободите сетку крафта и предмет на курсоре перед автоматическим крафтом",
          );
        if (emptySlots(bot) === 0)
          throw new Error("Освободите хотя бы один слот для результата крафта");
        const outputCount = () => inventoryItems(bot).reduce(
          (sum, item) => sum + (item.type === step.recipe.result.id ? item.count : 0), 0,
        );
        const before = outputCount();
        let failure;
        try {
          await craftOne(step.recipe, needsTable ? session.window : null, signal);
        } catch (error) {
          failure = error;
          try {
            await recoverCraftInputs(window, needsTable ? 9 : 4);
          } catch (cleanupError) {
            report(`Возврат ингредиентов: ${cleanupError.message}`);
          }
        }
        // Mineflayer predicts inventory clicks locally. Let server updates
        // settle before another recipe, and reconcile only newly made output.
        if (bot.waitForTicks) await atomic(() => bot.waitForTicks(2), signal);
        guard(signal);
        const produced = outputCount() - before;
        if (failure) {
          if (produced < step.recipe.result.count || window.selectedItem ||
              window.slots?.slice(1, needsTable ? 10 : 5).some(Boolean)) {
            if (/missing ingredient/i.test(failure.message))
              throw new Error(`Не хватает ингредиентов для ${step.name}. Изготовлено в этой операции: ${Math.max(0, produced)}`, { cause: failure });
            throw failure;
          }
        } else if (produced < step.recipe.result.count) {
          throw new Error(`Сервер не подтвердил результат крафта ${step.name}`);
        }
      }
    }
    return table;
  }
  function prepareCraft(item, count, mode) {
    item = itemByName(bot, item);
    count = integer(count, "Количество");
    let steps = planCraft(bot, [{ item: item.name, count }], mode);
    const needsTable = mode === "table" || steps.some((step) => step.recipe.requiresTable);
    const table = needsTable ? find(["crafting_table"])[0] : null;
    if (needsTable && !table) {
      steps = planCraft(
        bot,
        [
          { item: "crafting_table", count: 1, reserve: true, additional: false },
          { item: item.name, count },
        ],
        mode,
      );
    }
    return { item, count, mode, steps, table, needsTable };
  }
  function start(label, action, keepOpen = false) {
    available();
    if (job) throw new Error("Бот уже работает; сначала остановите текущую задачу");
    const controller = new AbortController();
    job = controller;
    onStart();
    outcome = null;
    phase = "queued";
    report(label);
    pending = queueInventoryTask(bot, async () => {
      try {
        guard(controller.signal);
        await action(controller.signal);
        guard(controller.signal);
        outcome = "complete";
      } catch (error) {
        if (error instanceof Cancelled || controller.signal.aborted) { outcome = "stopped"; report("Работа остановлена"); }
        else {
          outcome = "error";
          phase = "error";
          report(error.message);
          onError(error);
        }
      } finally {
        if (!keepOpen || controller.signal.aborted || phase === "error") close();
        if (job === controller) job = null;
        if (phase !== "error") phase = session ? "open" : "idle";
      }
    });
    return label;
  }
  function craft(plan) {
    return start(`Крафт ${plan.item.name} × ${plan.count} начат`, async (signal) => {
      // Setup recipes run in 2×2, before any step that needs the new table.
      let table = plan.table;
      const setupEnd =
        !table && !inventoryItems(bot).some((item) => item.name === "crafting_table")
          ? plan.steps.findIndex((step) => step.name === "crafting_table")
          : -1;
      for (const [index, step] of plan.steps.entries()) {
        const setup = index <= setupEnd;
        table = await executeCraft([step], signal, setup ? "inventory" : plan.mode, table);
      }
      report(`Готово: изготовлено ${plan.item.name} не менее ${plan.count} шт.`);
    });
  }
  function prepareSmelt(item, count = 1, fuel = "auto", station = "auto") {
    const recipe = smeltingRecipe(bot, item, station);
    count = integer(count, "Количество", 1, recipe.input.stackSize || 64);
    const carried = inventoryItems(bot).filter((item) => item.type === recipe.input.id);
    if (carried.reduce((sum, item) => sum + item.count, 0) < count)
      throw new Error(`Не хватает ${recipe.input.name} × ${count}`);
    const fuels = fuelItems(bot).filter(
      (entry) =>
        entry.item.type !== recipe.input.id &&
        (fuel === "auto" || entry.item.name === itemByName(bot, fuel).name),
    );
    // Count across stacks of the same fuel.
    const options = fuels.map((entry) => ({
      ...entry,
      count: fuels
        .filter((other) => other.item.type === entry.item.type)
        .reduce((sum, other) => sum + other.item.count, 0),
    }));
    const chosen = options.find(
      (entry) =>
        entry.count * entry.burn >= count &&
        Math.ceil(count / entry.burn) <=
          (entry.item.stackSize || bot.registry.items[entry.item.type].stackSize || 64),
    );
    if (!chosen) throw new Error("Не хватает подходящего топлива для всей партии");
    const block = find(recipe.stations)[0];
    if (!block)
      throw new Error(`Поставьте рядом ${recipe.stations.join(" / ")}: поиск в радиусе 32 блоков`);
    return {
      ...recipe,
      count,
      fuel: chosen.item,
      fuelCount: Math.ceil(count / chosen.burn),
      block,
    };
  }
  function smelt(plan) {
    return start(`Переплавка ${plan.input.name} × ${plan.count} начата`, async (signal) => {
      const window = await openAt(plan.block, signal);
      if (emptySlots(bot) === 0) throw new Error("Освободите слот для результата переплавки");
      if (window.slots.slice(0, 3).some(Boolean))
        throw new Error("Печь занята: заберите содержимое или выберите пустую печь");
      phase = "smelt";
      const put = (slot, id, amount) =>
        atomic(
          () =>
            bot.transfer({
              window,
              itemType: id,
              metadata: null,
              count: amount,
              sourceStart: window.inventoryStart,
              sourceEnd: window.inventoryEnd,
              destStart: slot,
              destEnd: slot + 1,
            }),
          signal,
        );
      await put(1, plan.fuel.type, plan.fuelCount);
      await put(0, plan.input.id, plan.count);
      report(`Переплавляю ${plan.input.name}: 0/${plan.count}; жду готовый результат`);
      let collected = 0;
      const deadline = Date.now() + Math.min(smeltTimeoutMs, plan.count * 15000 + 30000);
      while (collected < plan.count) {
        guard(signal);
        if (bot.currentWindow !== window)
          throw new Error("Окно печи закрыто; предметы остались в печи");
        const output = window.slots[2];
        if (output) {
          if (output.type !== plan.output.id)
            throw new Error("Сервер выдал другой результат переплавки");
          if (emptySlots(bot) === 0)
            throw new Error("Нет места для результата; предметы остались в печи");
          const amount = output.count;
          await atomic(() => bot.putAway(2), signal);
          collected += amount;
          report(`Переплавлено ${plan.output.name}: ${collected}/${plan.count}`);
        }
        if (Date.now() >= deadline)
          throw new Error("Печь не завершила работу вовремя; проверьте топливо и содержимое");
        if (collected < plan.count) await delay(pollMs, signal);
      }
      // Recover unburned fuel and container remainders (e.g. a lava bucket).
      if (window.slots[1]) await atomic(() => bot.putAway(1), signal);
      report(`Готово: ${plan.output.name} × ${collected}`);
    });
  }
  function prepareStation(target) {
    if (Array.isArray(target)) {
      if (target.length !== 3 || !target.every((value) => Number.isSafeInteger(Number(value))))
        throw new Error("Нужны три целые координаты x y z");
      const block = bot.blockAt(new Vec3(...target.map(Number)));
      if (!block || !supported(block.name))
        throw new Error("По этим координатам нет загруженного рабочего блока");
      return block;
    }
    const name = String(target || "")
      .replace(/^minecraft:/, "")
      .toLowerCase();
    if (!supported(name) || !bot.registry.blocksByName[name])
      throw new Error(`Неподдерживаемый рабочий блок: ${name}`);
    const block = find([name])[0];
    if (!block) throw new Error(`Нет ${name} в радиусе 32 блоков`);
    return block;
  }
  function station(block) {
    return start(
      `Открываю ${block.name}`,
      async (signal) => {
        await openAt(block, signal);
        report(`Открыт ${block.name}; используйте station put / take / select`);
      },
      true,
    );
  }
  function stationAction(action, args) {
    available();
    if (job) throw new Error("Дождитесь завершения текущей операции");
    const current = session;
    if (!current || bot.currentWindow !== current.window)
      throw new Error("Сначала откройте рабочий блок: station open название");
    const window = current.window;
    const outputs = {
      crafting_table: [0],
      furnace: [2],
      blast_furnace: [2],
      smoker: [2],
      anvil: [2],
      chipped_anvil: [2],
      damaged_anvil: [2],
      grindstone: [2],
      cartography_table: [2],
      smithing_table: [window.inventoryStart - 1],
      stonecutter: [1],
      loom: [3],
    };
    let operation;
    if (action === "put") {
      if (args.length < 2 || args.length > 3)
        throw new Error("station put слот предмет [количество]");
      const slot = integer(args[0], "Слот", 0, window.inventoryStart - 1);
      if (outputs[current.name]?.includes(slot))
        throw new Error("Нельзя класть предметы в слот результата");
      const item = itemByName(bot, args[1]),
        count = integer(args[2] ?? 1, "Количество", 1, item.stackSize || 64);
      if (
        inventoryItems(bot)
          .filter((entry) => entry.type === item.id)
          .reduce((sum, entry) => sum + entry.count, 0) < count
      )
        throw new Error(`Не хватает ${item.name} × ${count}`);
      const target = window.slots[slot];
      if (target && (target.type !== item.id || target.count + count > (item.stackSize || 64)))
        throw new Error("Слот занят или в нём недостаточно места");
      operation = () =>
        bot.transfer({
          window,
          itemType: item.id,
          metadata: null,
          count,
          sourceStart: window.inventoryStart,
          sourceEnd: window.inventoryEnd,
          destStart: slot,
          destEnd: slot + 1,
        });
    } else if (action === "take") {
      if (args.length !== 1) throw new Error("station take слот");
      const slot = integer(args[0], "Слот", 0, window.inventoryStart - 1);
      if (!window.slots[slot]) throw new Error("Слот пуст или результат ещё не готов");
      if (emptySlots(bot) === 0) throw new Error("Нет места в инвентаре");
      operation = () => bot.putAway(slot);
    } else if (action === "select" || action === "enchant") {
      if (!["stonecutter", "loom", "enchanting_table"].includes(current.name))
        throw new Error("Выбор варианта доступен у камнереза, ткацкого станка и стола зачарований");
      if (args.length !== 1) throw new Error("station select номерВарианта (от 0)");
      const choice = integer(args[0], "Вариант", 0, current.name === "enchanting_table" ? 2 : 255);
      if (current.name === "enchanting_table") {
        const cost = properties.get(choice);
        if (!window.slots[0] || !window.slots[1] || cost == null || cost <= 0)
          throw new Error(
            "Положите предмет в слот 0 и лазурит в слот 1; дождитесь вариантов зачарования",
          );
        if (
          bot.game?.gameMode !== "creative" &&
          ((bot.experience?.level || 0) < cost || window.slots[1].count < choice + 1)
        )
          throw new Error("Не хватает уровней опыта или лазурита");
      }
      operation = () =>
        bot._client.write("enchant_item", { windowId: window.id, enchantment: choice });
    } else if (action === "rename") {
      if (!/anvil$/.test(current.name)) throw new Error("Переименование доступно на наковальне");
      const name = args.join(" ");
      if (!name || name.length > 35) throw new Error("Имя: от 1 до 35 символов");
      operation = () => {
        if (bot.supportFeature("useMCItemName")) {
          bot._client.registerChannel("MC|ItemName", "string");
          bot._client.writeChannel("MC|ItemName", name);
        } else bot._client.write("name_item", { name });
      };
    } else throw new Error("station open|put|take|select|rename|status|close");
    return start(
      `Рабочий блок: ${action}`,
      async (signal) => {
        if (bot.currentWindow !== window) throw new Error("Окно рабочего блока закрыто");
        await atomic(operation, signal);
        report(`Рабочий блок: ${action} выполнено`);
      },
      true,
    );
  }
  function scanStations(radius = 32) {
    if (disposed || !bot.entity?.position) throw new Error("Бот отключён");
    radius = integer(radius, "Радиус", 4, 64);
    const blocks = discoverBlocks(bot, supported, radius);
    nearbyScan = { id: ++scanSequence, radius, origin: { ...bot.entity.position }, blocks };
    const text = `Найдено рабочих блоков: ${blocks.length}; радиус ${radius}`;
    if (!job) report(text);
    else onStatus(text);
    return text;
  }
  function prepareStorageScan(radius = 32) {
    available();
    radius = integer(radius, "Радиус", 4, 64);
    return {
      radius,
      origin: { ...bot.entity.position },
      blocks: discoverBlocks(bot, isStorage, radius, 64),
    };
  }
  function scanStorage(plan) {
    const scan = {
      id: ++scanSequence,
      state: "running",
      saved: false,
      radius: plan.radius,
      origin: plan.origin,
      total: plan.blocks.length,
      records: [],
      groups: [],
      added: 0,
      warnings: [],
    };
    const accepted = start(`Сканирую сундуки: найдено ${scan.total}`, async (signal) => {
      try {
        for (const [index, found] of plan.blocks.entries()) {
          guard(signal);
          report(
            `Проверяю сундук ${index + 1}/${scan.total}: ${found.position.x} ${found.position.y} ${found.position.z}`,
          );
          try {
            const block = bot.blockAt(
              new Vec3(found.position.x, found.position.y, found.position.z),
            );
            if (!block || block.name !== found.name)
              throw new Error("Контейнер исчез или не загружен");
            const window = await openAt(block, signal);
            guard(signal);
            scan.records.push({ ...found, ...inspectContents(window, bot.registry) });
          } catch (error) {
            guard(signal);
            scan.records.push({ ...found, error: error.message, label: "Недоступен" });
          } finally {
            close();
          }
          phase = "scan_storage";
        }
        guard(signal);
        const result = assignStorage(
          scan.records,
          bot.launcherGathering?.settings.storageGroups || [],
        );
        if (result.added && bot.launcherConfigureStorage)
          bot.launcherConfigureStorage(result.groups);
        Object.assign(scan, result, { state: "complete" });
        const unavailable = scan.records.filter((record) => record.error).length;
        report(
          `Сканирование завершено: проверено ${scan.total}, добавлено ${scan.added}${unavailable ? `, недоступно ${unavailable}` : ""}`,
        );
      } finally {
        if (scan.state === "running")
          scan.state = signal.aborted || disposed ? "cancelled" : "error";
      }
    });
    storageScan = scan;
    return accepted;
  }
  function acknowledgeStorageScan(id) {
    if (!storageScan || storageScan.id !== Number(id) || storageScan.state !== "complete")
      throw new Error("Результат сканирования устарел");
    storageScan.saved = true;
  }
  async function stop() {
    const hadWork = Boolean(job || session);
    job?.abort();
    if (job) await bot.pathfinder?.stop();
    await pending;
    close();
    phase = "idle";
    if (hadWork) report("Работа остановлена; рабочий блок закрыт");
  }
  function interrupt() {
    const hadWork = Boolean(job || session);
    job?.abort();
    // An opening has its own abort listener; close a live window only after the
    // current click finishes, while its task still owns the inventory queue.
    void pending.finally(close);
    if (hadWork) report("Работа прервана");
  }
  function windowClosed(window) {
    if (session?.window === window) {
      session = null;
      properties.clear();
      job?.abort();
    }
  }
  function property(packet) {
    if (session?.window.id === packet.windowId) properties.set(packet.property, packet.value);
  }
  function died() {
    interrupt();
  }
  function ended() {
    disposed = true;
    interrupt();
    cleanup();
  }
  function cleanup() {
    bot.off("death", died);
    bot.off("end", ended);
    bot.off("windowClose", windowClosed);
    bot._client?.off("craft_progress_bar", property);
  }
  bot.on("death", died);
  bot.on("end", ended);
  bot.on("windowClose", windowClosed);
  bot._client?.on("craft_progress_bar", property);
  const controller = {
    prepareCraft,
    craft,
    prepareSmelt,
    smelt,
    prepareStation,
    station,
    stationAction,
    scanStations,
    prepareStorageScan,
    scanStorage,
    acknowledgeStorageScan,
    stop,
    previewCraft(plan) {
      const text = `План: ${plan.steps.map((step) => `${step.name} × ${step.times * step.recipe.result.count}`).join(" → ")}. ${plan.needsTable ? "Верстак 3×3" : "Инвентарь 2×2"}`;
      report(text);
      return text;
    },
    pauseForSurvival: interrupt,
    get busy() {
      return Boolean(job || session);
    },
    get task() {
      return pending;
    },
    get status() {
      return message;
    },
    snapshot() {
      return {
        busy: Boolean(job),
        phase,
        outcome,
        message,
        nearbyScan,
        storageScan,
        station: session
          ? {
              name: session.name,
              position: session.position,
              type: session.window.type,
              slots: session.window.slots
                .slice(0, session.window.inventoryStart)
                .map((item, slot) => (item ? { slot, name: item.name, count: item.count } : null)),
              properties: Object.fromEntries(properties),
            }
          : null,
      };
    },
    async dispose() {
      disposed = true;
      await stop();
      cleanup();
    },
  };
  bot.launcherProduction = controller;
  return controller;
}

module.exports = { createProductionController, STATIONS };
