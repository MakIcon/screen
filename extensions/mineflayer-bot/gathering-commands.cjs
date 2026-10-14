const { Vec3 } = require("vec3");
const { integer, position, bounds } = require("./gathering-plan.cjs");

const COMMANDS = new Set([
  "mine",
  "ores",
  "wood",
  "forest",
  "quarry",
  "digarea",
  "tunnel",
  "collect",
  "stash",
  "deposit",
  "area",
  "work",
  "deliver",
  "bring",
  "give",
]);
function coordinates(args) {
  if (args.length !== 3 || !args.every((value) => value.trim() && Number.isFinite(Number(value))))
    throw new Error("Нужны три координаты x y z");
  return position(new Vec3(...args.map(Number)));
}
function ownerPosition(bot, source, owner) {
  const entity = owner ? owner() : bot.players?.[bot.launcherOwnerName]?.entity;
  if (!entity || entity.isValid === false)
    throw new Error("Владелец не виден боту. Подойдите ближе к боту и повторите выбор.");
  if (source === "owner") return position(entity.position);
  if (![entity.yaw, entity.pitch].every(Number.isFinite))
    throw new Error("Направление взгляда ещё недоступно. Повернитесь в игре и повторите выбор.");
  const direction = new Vec3(-Math.sin(entity.yaw) * Math.cos(entity.pitch),
    Math.sin(entity.pitch), -Math.cos(entity.yaw) * Math.cos(entity.pitch));
  // The upstream cursor helper rejects zero yaw/pitch. Raycast directly so
  // looking horizontally or due north remains a valid selection.
  const eyeHeight = entity.eyeHeight ?? (entity.height ? entity.height * 0.9 : 1.62);
  const block = bot.world.raycast(entity.position.offset(0, eyeHeight, 0), direction, 6);
  if (!block) throw new Error("Наведите прицел на блок в пределах 6 блоков и повторите выбор.");
  return position(block.position);
}
function taskFromCommand(bot, work, command, args) {
  if (command === "mine" || command === "ores") {
    if (command === "mine" && !args[0])
      throw new Error("mine блок,блок [количество блоков] [радиус]");
    const values = command === "ores" ? args : args.slice(1);
    if (values.length > 4)
      throw new Error("mine блок,блок [количество блоков] [радиус] [minY] [maxY]");
    return {
      kind: "mine",
      blocks: command === "ores" ? "ores" : args[0],
      count: values[0] ?? 64,
      radius: values[1] ?? 32,
      minY: values[2],
      maxY: values[3],
    };
  }
  if (command === "wood" || command === "forest") {
    if (
      args.length > 4 ||
      (args[2] && !["leaves", "logs"].includes(args[2])) ||
      (args[3] && !["scaffold", "plain"].includes(args[3]))
    )
      throw new Error("forest [радиус] [количество, 0 = все] [leaves|logs] [scaffold|plain]");
    return {
      kind: "forest",
      radius: args[0] ?? 16,
      count: args[1] ?? 0,
      leaves: args[2] === "leaves",
      scaffold: args[3] !== "plain",
    };
  }
  if (command === "quarry" || command === "digarea") {
    if (args.length === 1 || args.length === 2)
      return { kind: "quarry", area: work.getArea(args[0]), blocks: args[1] };
    if (args.length === 6 || args.length === 7)
      return {
        kind: "quarry",
        area: bounds(coordinates(args.slice(0, 3)), coordinates(args.slice(3, 6))),
        blocks: args[6],
      };
    throw new Error("quarry имяОбласти [блоки] или quarry x1 y1 z1 x2 y2 z2 [блоки]");
  }
  if (command === "tunnel") {
    if (args.length > 3) throw new Error("tunnel [длина] [ширина] [высота]");
    const length = integer(args[0] ?? 16, "Длина", 1, 128);
    const width = integer(args[1] ?? work.settings.tunnelWidth, "Ширина", 1, 8),
      height = integer(args[2] ?? work.settings.tunnelHeight, "Высота", 2, 8);
    const origin = bot.entity.position.floored();
    const facing = new Vec3(-Math.sin(bot.entity.yaw), 0, -Math.cos(bot.entity.yaw));
    const direction =
      Math.abs(facing.x) > Math.abs(facing.z)
        ? new Vec3(Math.sign(facing.x), 0, 0)
        : new Vec3(0, 0, Math.sign(facing.z));
    const side = new Vec3(-direction.z, 0, direction.x);
    const a = origin.plus(direction).plus(side.scaled(-Math.floor((width - 1) / 2)));
    const b = origin
      .plus(direction.scaled(length))
      .plus(side.scaled(Math.ceil((width - 1) / 2)))
      .offset(0, height - 1, 0);
    return { kind: "quarry", area: bounds(a, b), tunnel: true, tunnelWidth: width, tunnelHeight: height };
  }
  if (command === "collect") {
    if (args.length > 2) throw new Error("collect [радиус] [предмет]");
    return { kind: "collect", radius: args[0] ?? 16, item: args[1] };
  }
  if (command === "deposit") {
    if (args.length) throw new Error("deposit");
    return { kind: "deposit" };
  }
  return null;
}

// Shared by owner chat and the launcher's local command surface. Validate a
// complete job before stopping movement, so a typo cannot cancel a good job.
async function handleGatheringCommand(bot, work, command, args, { prepare, reply, owner }) {
  if (!COMMANDS.has(command)) return false;
  if (!work) throw new Error("Система добычи ещё не готова");
  if (["deliver", "bring", "give"].includes(command)) {
    if (args.length) throw new Error("deliver — принести добычу владельцу");
    if (!work.busy && (await prepare(false)) === false) return true;
    const id = await work.deliver(() => bot.players?.[bot.launcherOwnerName]?.entity);
    reply(
      bot.health <= work.settings.minHealth
        ? `Задача #${id}: доставка сохранена; жду восстановления здоровья, затем принесу добычу`
        : `Задача #${id}: несу добычу владельцу, затем вернусь к работе`,
    );
    return true;
  }
  if (command === "work") {
    const action = args[0] || "status";
    if (action === "defense") {
      if (args.length !== 4 || !args.slice(1).every((value) => ["on", "off"].includes(value)))
        throw new Error("work defense on|off on|off on|off — мобы, игроки, стрелы");
      work.configureDefense({ defendMobs: args[1] === "on", defendPlayers: args[2] === "on", defendArrows: args[3] === "on" });
      reply("Защита при добыче настроена");
      return true;
    }
    if (action === "tunnels") {
      if (args.length !== 7 || !["on", "off"].includes(args[5]))
        throw new Error("work tunnels ширина высота ширинаЛестницы просветЛестницы on|off интервалФакелов");
      work.configurePassages({ tunnelWidth: args[1], tunnelHeight: args[2],
        stairWidth: args[3], stairHeight: args[4], placeTorches: args[5] === "on", torchInterval: args[6] });
      reply("Тоннели и освещение настроены; размеры применятся при следующем подходе");
      return true;
    }
    if (action === "pause") work.pause();
    else if (action === "resume") {
      if ((await prepare(false)) === false) return true;
      work.resume();
    } else if (action === "stop") await work.stop();
    else if (action === "clear") work.clearQueue();
    else if (action === "remove") work.remove(integer(args[1], "Номер задачи", 1, 1000000));
    else if (action === "cancel") await work.cancel(integer(args[1], "Номер задачи", 1, 1000000));
    else if (action === "move") work.reorder(integer(args[1], "Номер задачи", 1, 1000000), args[2]);
    else if (action === "queue") {
      reply(work.snapshot.queue.map((t) => `#${t.id} ${t.kind}`).join("; ") || "Очередь пуста");
      return true;
    } else if (action !== "status")
      throw new Error(
        "work status|queue|pause|resume|stop|clear|remove номер|cancel номер|move номер up|down",
      );
    reply(work.status);
    return true;
  }
  if (command === "stash") {
    if (args.length === 1 && args[0] === "pick") {
      const point = ownerPosition(bot, "look", owner);
      if (!/^(?:chest|trapped_chest|barrel|(?:[a-z]+_)?shulker_box)$/.test(bot.blockAt(point)?.name || ""))
        throw new Error("Наведите прицел на сундук, бочку или шалкеровый ящик.");
      work.captureChest(point);
      reply(`Сундук выбран: ${point.x} ${point.y} ${point.z}`);
      return true;
    }
    if (args[0] === "clear" && args.length === 1) {
      work.setChest(null);
      reply("Сундук отключён");
    } else {
      const picked = args.length === 1 && args[0] === "look";
      const target = picked ? ownerPosition(bot, "look", owner) : coordinates(args);
      if (picked && !/^(?:chest|trapped_chest|barrel|(?:[a-z]+_)?shulker_box)$/.test(bot.blockAt(target)?.name || ""))
        throw new Error("Наведите прицел на сундук, бочку или шалкеровый ящик.");
      const pos = work.setChest(target);
      reply(`Сундук: ${pos.x} ${pos.y} ${pos.z}`);
    }
    return true;
  }
  if (command === "area") {
    if (!args.length || (args.length === 1 && args[0] === "list")) {
      reply(work.areas.join("; ") || "Нет готовых областей");
      return true;
    }
    if (![2, 5].includes(args.length) && !(args.length === 3 && ["owner", "look"].includes(args[2])))
      throw new Error("area имя 1|2 [x y z|owner|look]");
    const area = work.setCorner(
      args[0],
      integer(args[1], "Угол", 1, 2),
      args.length === 5 ? coordinates(args.slice(2)) : args.length === 3 ? ownerPosition(bot, args[2], owner) : undefined,
    );
    reply(
      area
        ? `Область ${args[0]}: ${area.volume} блоков${area.volume > work.settings.maxAreaVolume ? `; максимум ${work.settings.maxAreaVolume}, выберите углы ближе` : ""}`
        : `Угол ${args[1]} области ${args[0]} задан`,
    );
    return true;
  }
  const spec = taskFromCommand(bot, work, command, args);
  work.validate(spec);
  if (!work.busy && (await prepare(false)) === false) return true;
  const id = work.enqueue(spec);
  reply(`Задача #${id} ${spec.kind} добавлена. work status — ход работы, work pause — пауза`);
  return true;
}

module.exports = { COMMANDS, coordinates, taskFromCommand, handleGatheringCommand, ownerPosition };
