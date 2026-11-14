const { NestedStateMachine, StateTransition } = require("mineflayer-statemachine");
const { Tool } = require("mineflayer-tool");
const { scanMine, createMineIndex } = require("./gathering-scan.cjs");
const { Vec3 } = require("vec3");
const {
  goals,
  waitForMiningGround,
  installMiningToolMaterials,
  miningBlock,
  getItemEnchantments,
  NavigationError,
  NavigationTaskError,
} = require("./pathfinder.cjs");
const plan = require("./gathering-plan.cjs");
const { createGatheringDefense } = require("./gathering-defense.cjs");
const storage = require("./gathering-storage.cjs");
const farming = require("./farming.cjs");
const crewTools = require("./fleet-crew.cjs");

const SAPLING_SOIL = new Set([
  "dirt", "grass_block", "podzol", "coarse_dirt", "rooted_dirt", "mud", "moss_block", "pale_moss_block",
]);
function saplingFor(registry, log) {
  const match = /^(oak|spruce|birch|jungle|acacia|dark_oak|cherry|pale_oak|mangrove)_log$/.exec(log);
  if (!match) return null;
  const name = match[1] === "mangrove" ? "mangrove_propagule" : `${match[1]}_sapling`;
  return registry.itemsByName?.[name] && registry.blocksByName?.[name] ? name : null;
}

class WorkError extends NavigationTaskError {
  constructor(message, resumeOnRecovery = false) {
    super(message);
    this.name = "WorkError";
    this.resumeOnRecovery = resumeOnRecovery;
  }
}
class Interrupted extends NavigationTaskError {
  constructor() {
    super("Задача прервана");
    this.name = "Interrupted";
  }
}
class InventoryFull extends NavigationTaskError {
  constructor() {
    super("Нет места для блоков при прокладке пути");
    this.name = "InventoryFull";
  }
}
const CONTAINER_REACH = 4;

// Scouting only needs to arrive above or below the place: the horizontal
// distance decides. Being a GoalNear keeps distant-goal prefix routing, so a
// scout walks to the loaded chunk frontier instead of failing on unloaded terrain.
class GoalScout extends goals.GoalNear {
  isEnd(node) {
    return this.distHeuristic(node) <= this.distance;
  }
  distHeuristic(node) {
    const pos = node.exitPos ?? node;
    return Math.hypot(this.x - pos.x, this.z - pos.z);
  }
}

class GoalContainerAccess extends goals.GoalNear {
  constructor(position, canInteractAt) {
    const center = position.offset(0.5, 0.5, 0.5);
    super(center.x, center.y, center.z, CONTAINER_REACH);
    this.canInteractAt = canInteractAt;
  }
  isEnd(node) {
    const feet = node.exitPos || new Vec3(node.x + 0.5, node.y, node.z + 0.5);
    return this.canInteractAt(feet);
  }
}

const PHASES = [
  "idle",
  "scan",
  "move",
  "equip",
  "dig",
  "farming",
  "pickup",
  "deposit",
  "deliver",
  "return",
  "explore",
  "paused",
];
const LABELS = {
  idle: "ожидание",
  scan: "поиск",
  move: "подход",
  equip: "инструмент",
  dig: "добыча",
  farming: "работа на грядках",
  pickup: "сбор дропа",
  deposit: "выгрузка",
  deliver: "несёт добычу владельцу",
  return: "возвращается к работе",
  explore: "разведка новых мест",
  paused: "пауза",
};

function createGatheringController(bot, options = {}, hooks = {}) {
  const settings = { ...plan.DEFAULTS, ...options, ...plan.passageSettings(options), ...plan.defenseSettings(options) };
  settings.storageGroups = storage.normalizeStorageGroups(options.storageGroups);
  const onStatus = hooks.onStatus || (() => {});
  const onProgress = hooks.onProgress || (() => {});
  const now = hooks.now || Date.now;
  installMiningToolMaterials(bot);
  const tool = bot.tool || new Tool(bot);
  bot.tool = tool;
  // The published tool plugin predates item components. Use modern enchants
  // while retaining its getDigTime API and harvest-based selection.
  tool.getDigTime = (block, item) => {
    const eye = bot.blockAt(bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0));
    const helmet = bot.inventory.slots?.[bot.getEquipmentDestSlot?.("head")];
    return miningBlock(block, bot.registry).digTime(
      item?.type ?? null,
      bot.game?.gameMode === "creative",
      eye?.name === "water" || eye?.name === "flowing_water",
      !bot.entity.onGround,
      getItemEnchantments(item, bot.registry).concat(getItemEnchantments(helmet, bot.registry)),
      bot.entity.effects || {},
    );
  };
  let task = null,
    nextId = 1,
    desired = "idle",
    pending = false,
    disposed = false;
  let revision = 0,
    abort = new AbortController(),
    work = Promise.resolve();
  let pausedReason = "",
    survivalPaused = false,
    pauseRequested = false;
  let target = null,
    lastBlock = null,
    pickupOnly = false,
    chest = null;
  let movementSettings = null,
    chestWindow = null,
    reportAt = 0;
  let deliveryContext = null;
  let clearCancelledOpen = () => {};
  let storagePick = null, transferTask = Promise.resolve();
  const storageStatus = new Map();
  const hasStorage = () => Boolean(chest) || settings.storageGroups.some((group) => group.enabled && group.chests.length && group.filters.length);
  const queue = [],
    history = [],
    areas = new Map(),
    corners = new Map();
  const trackedDrops = new Map(),
    picked = new Map();
  const originalDig = bot.dig.bind(bot);
  const torchSites = new Map();
  const passageFloors = new Map();
  let torchAttempt = null;
  // Fleet crew link (one per worker process). `site` is the work site this bot
  // has leased from the crew hub: a tree, an ore cell or a farm plot.
  const crew = hooks.crew || null;
  let site = null;
  // Where the owner was last visible: the way home for a delivery from afar.
  let ownerSeen = null;
  let ownerDimension = crewTools.dimensionOf(bot);
  function rememberOwner(owner) {
    const dim = crewTools.dimensionOf(bot);
    if (dim !== ownerDimension) {
      ownerSeen = null;
      ownerDimension = dim;
    }
    if (owner?.position && owner.isValid !== false) ownerSeen = owner.position.clone();
  }
  // Passage floors dug by other crew bots (shared through the hub) and our
  // own floors waiting to be shared. Nobody digs a floor out of a tunnel or a
  // staircase that another bot needs for its way back.
  const sharedFloors = new Set();
  const floorOutbox = [];
  let floorCursor = { seq: 0, epoch: "", dim: "" };
  let playerSupports = { at: -Infinity, keys: new Set() };
  function underPlayer(key) {
    if (now() - playerSupports.at > 400) {
      const keys = new Set();
      for (const entity of Object.values(bot.entities || {})) {
        if (entity === bot.entity || entity.type !== "player" || entity.isValid === false || !entity.position) continue;
        // The owner watches from close by; only fellow bots need their footing kept.
        if (hooks.isOwner?.(entity.username)) continue;
        const { x, y, z } = entity.position;
        for (const bx of new Set([Math.floor(x - 0.3), Math.floor(x + 0.3)]))
          for (const bz of new Set([Math.floor(z - 0.3), Math.floor(z + 0.3)]))
            keys.add(`${bx},${Math.floor(y) - 1},${bz}`);
      }
      playerSupports = { at: now(), keys };
    }
    return playerSupports.keys.has(key);
  }
  // Blocks the crew must keep: transient, so they redirect a route instead of
  // pausing the job like a real safety problem does.
  function crewProtected(block) {
    if (!crew || !block) return null;
    const key = plan.key(block.position);
    if (sharedFloors.has(key)) return "Пол прохода другого бота";
    if (underPlayer(key)) return "На блоке стоит другой бот";
    return null;
  }
  function matchesTarget(block) {
    return plan.matches(task, block) &&
      !(torchSites.has(plan.key(block.position)) && /^(wall_)?torch$/.test(block.name));
  }
  function trackDig(block) {
    lastBlock = block.position.clone();
    task.digSites ||= new Map();
    for (const [key, site] of task.digSites)
      if (now() - site.time > 5000) task.digSites.delete(key);
    task.digSites.set(plan.key(block.position), { position: lastBlock, time: now() });
    task.lastDigAt = now();
    // Remember where a trunk stood so a sapling can replace the felled tree.
    if (task.kind === "forest" && task.replantSaplings && plan.isWood(block.name)) {
      const soil = bot.blockAt(block.position.offset(0, -1, 0));
      const sapling = saplingFor(bot.registry, block.name);
      if (sapling && soil && SAPLING_SOIL.has(soil.name)) {
        task.saplings ||= new Map();
        task.saplings.set(plan.key(soil.position), { position: soil.position.clone(), sapling });
      }
    }
  }
  function travelRouting() {
    return task?.kind === "deliver" || task?.kind === "deposit" ||
      machine.activeState === states.deposit;
  }
  function routeBreakReason(block) {
    const travel = travelRouting();
    if (!travel && (!task?.routeDig || !plan.insideTask(task, block.position)))
      return "Блок вне области добычи";
    if (!travel && task.kind === "forest" && !plan.isWood(block.name) && !plan.isLeaves(block.name))
      return "Блок не относится к дереву";
    if (!travel && passageFloors.get(plan.key(block.position)) === block.type) return "Пол готового прохода";
    const unsafe = plan.safetyReason(bot, block);
    if (unsafe) return unsafe;
    if (plan.supportBlock(bot, block)) {
      const ownSupport = task.kind === "deliver" && task.deliveryPhase === "return" &&
        task.scaffolds.get(plan.key(block.position)) === block.type;
      const landing = bot.blockAt(block.position.offset(0, -1, 0));
      if (!ownSupport || landing?.boundingBox !== "block" || plan.FLUIDS.has(landing.name))
        return "Опора под ногами";
    }
    return null;
  }
  async function routeDig(block, ...args) {
    if (!task || (!travelRouting() && (!task.routeDig ||
        ![states.move, states.pickup, states.explore].includes(machine.activeState))))
      return originalDig(block, ...args);
    const signal = abort.signal;
    guard(signal);
    const travel = travelRouting();
    if (!travel && (task.kind === "mine" || task.tunnel)) {
      for (const floor of bot.pathfinder.currentMove?.metadata?.excavationFloors || []) {
        const support = bot.blockAt(floor);
        if (support?.boundingBox !== "block") continue;
        const floorKey = plan.key(floor);
        if (crew && !passageFloors.has(floorKey)) floorOutbox.push(floorKey);
        passageFloors.set(floorKey, support.type);
      }
    }
    if (!travel && task.count && task.mined >= task.count && matchesTarget(block))
      throw new Error("Количество целевых блоков уже достигнуто");
    // The planner already avoids other bots' floors unless there is no other
    // way. Only a block somebody stands on is refused outright.
    if (crew && underPlayer(plan.key(block.position)))
      throw new Error("На блоке стоит другой бот; прокладываю путь иначе");
    const unsafe = routeBreakReason(block);
    if (unsafe) throw new WorkError(`Нельзя безопасно проложить путь: ${unsafe}`);
    if (!travel && inventoryFull()) throw new InventoryFull();
    await selectTool(block, signal);
    if (bot.setControlState)
      await waitForMiningGround(bot, () => {
        guard(signal);
        return false;
      });
    trackDig(block);
    const loose = plan.FALLING.test(bot.blockAt(block.position.offset(0, 1, 0))?.name || "");
    await originalDig(block, true, visibleFace(block) || args[1] || "raycast");
    guard(signal);
    if (!travel && matchesTarget(block)) task.mined++;
    if (loose) await settleFalling(block.position, signal);
    if (!travel && (task.kind === "mine" || task.tunnel)) await lightPassage(signal);
  }
  // Gravel and sand above a dug cell fall into it. Keep digging the cell until
  // the column is spent, so the route really is clear when the bot walks on.
  async function settleFalling(position, signal) {
    for (let round = 0; round < 12; round++) {
      let landed = null;
      for (let poll = 0; poll < 18 && !landed; poll++) {
        const current = bot.blockAt(position);
        if (current && plan.FALLING.test(current.name)) landed = current;
        else await wait(50, signal);
      }
      guard(signal);
      if (!landed || plan.safetyReason(bot, landed) || !bot.canDigBlock(landed)) return;
      await selectTool(landed, signal);
      trackDig(landed);
      await originalDig(landed, true, visibleFace(landed) || "raycast");
      guard(signal);
    }
  }
  // What the owner does by hand when a bot is stuck: open a one-wide, two-high
  // doorway in the direction of the destination. Every block passes the same
  // safety and ownership checks as route excavation.
  async function clearWayToward(point, signal) {
    if (!task || !point || !bot.entity.onGround) return false;
    if (!travelRouting() && !task.routeDig) return false;
    const feet = bot.entity.position.floored();
    const dx = point.x - bot.entity.position.x, dz = point.z - bot.entity.position.z;
    const along = [Math.sign(dx), 0], across = [0, Math.sign(dz)];
    const directions = (Math.abs(dx) >= Math.abs(dz) ? [along, across] : [across, along])
      .filter(([x, z]) => x || z);
    for (const [x, z] of directions) {
      const blocking = [feet.offset(x, 1, z), feet.offset(x, 0, z)]
        .map((position) => bot.blockAt(position))
        .filter((block) => block && block.boundingBox === "block");
      if (!blocking.length) continue;
      if (blocking.some((block) => routeBreakReason(block) || (crew && underPlayer(plan.key(block.position))) ||
          !bot.canDigBlock(block) || (!travelRouting() && task.count && task.mined >= task.count && matchesTarget(block))))
        continue;
      if (!travelRouting() && inventoryFull()) throw new InventoryFull();
      for (const block of blocking) {
        guard(signal);
        const live = bot.blockAt(block.position);
        if (!live || live.boundingBox !== "block") continue;
        await selectTool(live, signal);
        if (bot.setControlState)
          await waitForMiningGround(bot, () => {
            guard(signal);
            return false;
          });
        trackDig(live);
        const loose = plan.FALLING.test(bot.blockAt(live.position.offset(0, 1, 0))?.name || "");
        await operation(() => originalDig(live, true, visibleFace(live) || "raycast"), signal,
          Math.max(settings.operationTimeoutMs, tool.getDigTime(live, bot.heldItem) + 5000));
        if (!travelRouting() && matchesTarget(live)) task.mined++;
        if (loose) await settleFalling(live.position, signal);
      }
      return true;
    }
    return false;
  }
  bot.dig = routeDig;

  const busy = () => Boolean(task || queue.length || pending);
  function taskSummary(entry) {
    if (!entry) return null;
    return {
      id: entry.id,
      kind: entry.kind,
      tunnel: Boolean(entry.tunnel),
      names: entry.names,
      radius: entry.radius,
      count: entry.count || 0,
      minY: entry.minY,
      maxY: entry.maxY,
      item: entry.item,
      crop: entry.crop,
      replant: entry.replant,
      tilled: entry.tilled || 0,
      planted: entry.planted || 0,
      harvested: entry.harvested || 0,
      area: entry.area,
      mined: entry.mined,
      collected: entry.collected,
      deposited: entry.deposited,
      delivered: entry.delivered || 0,
      missedDrops: entry.missedDrops || 0,
    };
  }
  function status() {
    if (!task) return `Добыча: ожидание; очередь ${queue.length}`;
    return (
      `#${task.id} ${task.kind}: ${LABELS[machine.activeState?.stateName] || desired}; ` +
      (farming.isFarming(task)
        ? `вспахано ${task.tilled || 0}; посажено ${task.planted || 0}; урожай ${task.harvested || 0}; подобрано ${task.collected}; `
        : `блоки ${task.mined}${task.count ? `/${task.count}` : ""}; подобрано ${task.collected}; `) +
      `выгружено ${task.deposited}; очередь ${queue.length}` +
      (site && !site.pending && site.team > 1 ? `; ботов на цели: ${site.team}` : "") +
      (pausedReason ? `; ${pausedReason}` : "")
    );
  }
  function report(force = false) {
    if (force || now() >= reportAt) {
      reportAt = now() + 1000;
      onStatus(status());
      onProgress({
        phase: pauseRequested ? "paused" : desired,
        kind: task?.kind || null,
        mined: task?.mined ?? history.at(-1)?.mined ?? 0,
        collected: task?.collected ?? history.at(-1)?.collected ?? 0,
        delivered: task?.delivered || 0,
        queued: queue.length,
        reason: pausedReason || (!task ? history.at(-1)?.reason || "" : ""),
        message: status(),
        active: taskSummary(task),
        queue: queue.map(taskSummary),
        history: [...history],
        suspended: taskSummary(deliveryContext?.task),
        selection: selectionSnapshot(),
      });
    }
  }
  function selectionSnapshot() {
    return { chest, storagePick, storageGroups: settings.storageGroups,
      storageStatus: Object.fromEntries(storageStatus), areas: Object.fromEntries(corners) };
  }
  function guard(signal = abort.signal) {
    if (signal.aborted || disposed || !task) throw new Interrupted();
    if (bot.health <= 0 || bot.isAlive === false) throw new WorkError("Бот погиб");
    if (bot.health <= settings.minHealth)
      throw new WorkError(`Мало здоровья (${bot.health}); жду восстановления`, true);
    if (defense.busy || bot.launcherSurvival?.busy || bot.launcherDefendingBow)
      throw new WorkError("Еда или аварийное спасение; затем продолжу работу", true);
  }
  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Interrupted());
      const cancel = () => {
        clearTimeout(timer);
        reject(new Interrupted());
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", cancel);
        resolve();
      }, ms);
      signal.addEventListener("abort", cancel, { once: true });
    });
  }
  async function operation(
    factory,
    signal,
    timeout = settings.operationTimeoutMs,
    detach = false,
    recoverable = false,
    progress = null,
  ) {
    guard(signal);
    let timer, cancel;
    const original = Promise.resolve().then(() => {
      guard(signal);
      return factory();
    });
    const limit = new Promise((_, reject) => {
      cancel = () => reject(new Interrupted());
      signal.addEventListener("abort", cancel, { once: true });
      let deadline = now() + timeout;
      timer = setInterval(
        () => {
          const allowance = progress?.();
          if (allowance) deadline = now() + allowance;
          if (now() >= deadline)
            reject(
              recoverable
                ? new NavigationError("timeout", "Не удалось подойти к цели за отведённое время")
                : new WorkError("Операция заняла слишком много времени"),
            );
        },
        Math.min(200, timeout),
      );
    });
    try {
      const result = await Promise.race([original, limit]);
      guard(signal);
      return result;
    } catch (error) {
      // Retire a late container opened after cancellation, without touching a
      // window subsequently opened by another controller.
      void original
        .then((result) => {
          if (result?.close && (signal.aborted || error instanceof WorkError)) result.close();
        })
        .catch(() => {});
      if (error instanceof WorkError) requestPause(error.message, error.resumeOnRecovery);
      else if (recoverable && !signal.aborted) await halt();
      // Equipment/dig/path operations must settle before a later job can take
      // inventory/control ownership. Container opening is event-based and may
      // never resolve after disconnect; its late window is closed above.
      if (!detach) await original.catch(() => {});
      throw error;
    } finally {
      clearInterval(timer);
      signal.removeEventListener("abort", cancel);
    }
  }
  async function navigateOnce(goal, signal, timeout, allowMiningPrefix = false) {
    // Progress means reaching a new cell (or digging), not any motion: a bot
    // shuffling against a ledge or re-centring on an edge must time out.
    const visits = new Set();
    const digs = new Set();
    let cell = "";
    let completed = false;
    const dug = () => { completed = true; };
    const entered = () => {
      const current = plan.key(bot.entity.position.floored());
      if (current === cell) return false;
      cell = current;
      if (visits.has(current)) return false;
      visits.add(current);
      return true;
    };
    entered();
    bot.on("diggingCompleted", dug);
    try {
      return await operation(
        () => bot.pathfinder.goto(goal, { allowMiningPrefix }),
        signal,
        Math.min(timeout, settings.operationTimeoutMs),
        false,
        true,
        () => {
          if (entered() || completed) { completed = false; return timeout; }
          const block = bot.targetDigBlock;
          const digKey = block && `${plan.key(block.position)}:${block.type}`;
          if (block && !digs.has(digKey)) {
            digs.add(digKey);
            const time = bot.digTime?.(block) ?? tool.getDigTime(block, bot.heldItem);
            return Math.max(timeout, (Number.isFinite(time) ? time : 0) + 5000);
          }
          return 0;
        },
      );
    } finally { bot.off("diggingCompleted", dug); }
  }
  function travelMoveOptions() {
    const base = movementSettings || bot.pathfinder.defaultMoveSettings;
    return {
      canDig: Boolean(base.canDig),
      canPlace: base.canPlace ?? true,
      allow1by1towers: base.allow1by1towers ?? true,
      maxDropDown: base.maxDropDown ?? 3,
      allowWaterDrop: base.allowWaterDrop ?? false,
      allowBucketWaterDrop: base.allowBucketWaterDrop ?? false,
    };
  }
  // `toward` names the destination for the stuck recovery: when the route
  // search or the walk fails, the bot opens the way ahead once and retries.
  async function navigate(goal, signal, timeout = settings.moveTimeoutMs, toward = null) {
    const unstick = async (error) => {
      guard(signal);
      if (!(error instanceof NavigationError) || !toward) return false;
      const point = typeof toward === "function" ? toward() : toward;
      if (!(await clearWayToward(point, signal))) return false;
      onStatus("Застрял: расчистил проход перед собой и продолжаю");
      guard(signal);
      return true;
    };
    if (!travelRouting()) {
      try {
        return await navigateOnce(goal, signal, timeout, Boolean(task?.routeDig));
      } catch (error) {
        guard(signal);
        // A stale approach or a corner recovery is not proof that terrain
        // needs removing. Replan from the stopped position on foot first.
        if (error instanceof NavigationError && toward && task?.routeDig) {
          const phaseSettings = { ...bot.pathfinder.defaultMoveSettings };
          try {
            bot.pathfinder.setMoveOptions?.({ canDig: false, canPlace: false });
            return await navigateOnce(goal, signal, timeout);
          } catch (walkingError) {
            guard(signal);
            if (!(walkingError instanceof NavigationError)) throw walkingError;
          } finally {
            if (!signal.aborted) bot.pathfinder.setMoveOptions?.(phaseSettings);
          }
        }
        if (!(await unstick(error))) throw error;
        return await navigateOnce(goal, signal, timeout, Boolean(task?.routeDig));
      }
    }
    const phaseSettings = { ...bot.pathfinder.defaultMoveSettings };
    try {
      try {
        return await navigateOnce(goal, signal, timeout);
      } catch (error) {
        guard(signal);
        if (!(error instanceof NavigationError)) throw error;
        // The failed operation has stopped before this one bounded retry.
        // Task guards and break exclusions still validate any route excavation.
        onStatus("Путь прервался; строю маршрут заново из текущей позиции");
        guard(signal);
        bot.pathfinder.setMoveOptions?.({ canDig: true });
        try {
          return await navigateOnce(goal, signal, timeout);
        } catch (failure) {
          if (!(await unstick(failure))) throw failure;
          return await navigateOnce(goal, signal, timeout);
        }
      }
    } finally {
      if (!signal.aborted) bot.pathfinder.setMoveOptions?.(phaseSettings);
    }
  }
  // A trunk can hide the center of its lower log while the side is exposed.
  // Test the same face we will actually aim at instead of requiring a center ray.
  function visibleFace(block, feet = bot.entity.position) {
    if (!block) return null;
    if (!bot.world?.raycast)
      return bot.canDigBlock(block) && bot.canSeeBlock?.(block) !== false ? "raycast" : null;
    const eye = feet.offset(0, bot.entity.eyeHeight || 1.62, 0);
    const center = block.position.offset(0.5, 0.5, 0.5);
    if (eye.distanceTo(center) > settings.digReach + 0.5) return null;
    for (const axis of ["y", "x", "z"]) {
      const sign = Math.sign(eye[axis] - center[axis]);
      if (Math.abs(eye[axis] - center[axis]) < 0.5) continue;
      const face = new Vec3(0, 0, 0);
      face[axis] = sign;
      // End just inside the face so floating-point boundary hits are stable.
      const aim = center.plus(face.scaled(0.499));
      const distance = eye.distanceTo(aim);
      if (distance > settings.digReach) continue;
      const hit = bot.world.raycast(eye, aim.minus(eye).normalize(), distance + 0.01);
      if (hit?.position.equals(block.position)) return face;
    }
    return null;
  }
  function miningGoal(block) {
    const goal = goals.GoalLookAt.fromBlock(bot.pathfinder.world, block, settings.digReach);
    if (bot.world?.raycast) {
      goal.isEnd = (node) =>
        Boolean(visibleFace(block, node.exitPos || new Vec3(node.x + 0.5, node.y, node.z + 0.5)));
      // Digging will look directly at the selected face; no extra look step.
      goal.onFinish = async () => {};
    }
    return goal;
  }
  async function lightPassage(signal) {
    guard(signal);
    if (!settings.placeTorches || !bot.placeBlock || !bot.entity.onGround) return;
    const item = bot.inventory.items().find((value) => value.name === "torch" && value.count > 0);
    if (!item) return;
    const foot = bot.entity.position.floored();
    if (torchAttempt?.equals(foot)) return;
    for (const [key, site] of torchSites) {
      if (!/^(wall_)?torch$/.test(bot.blockAt(site.position)?.name || "")) torchSites.delete(key);
      else if (site.feet.distanceTo(foot) < settings.torchInterval) return;
    }
    const ids = ["torch", "wall_torch"].map((name) => bot.registry.blocksByName[name]?.id).filter(Number.isInteger);
    if (ids.length && bot.findBlocks?.({ point: foot, matching: ids,
      maxDistance: Math.max(1, settings.torchInterval - 2), count: 1 }).length) return;
    torchAttempt = foot.clone();
    const route = bot.pathfinder.currentPath?.slice(bot.pathfinder.currentIndex || 0) || [];
    const scheduled = (pos) => route.some((move) => move.toBreak.some((entry) => entry.vec.equals(pos)));
    const choices = [];
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const direction = new Vec3(x, 0, z);
      for (let distance = 1; distance <= 3; distance++) {
        const wall = bot.blockAt(foot.offset(x * distance, 1, z * distance));
        if (!wall) break;
        if (plan.AIR.has(wall.name)) continue;
        const destination = wall.position.minus(direction);
        const space = bot.blockAt(destination);
        if (wall.boundingBox === "block" && !plan.PROTECTED.test(wall.name) &&
            !plan.FLUIDS.has(wall.name) && !wall.getProperties?.().waterlogged &&
            plan.AIR.has(space?.name) && plan.insideTask(task, destination) &&
            (!task.area || !plan.insideTask(task, wall.position)) &&
            !scheduled(destination) && !scheduled(wall.position) && visibleFace(wall))
          choices.push({ wall, face: direction.scaled(-1), destination });
        break;
      }
    }
    const choice = choices[0];
    if (!choice) return;
    const previous = bot.heldItem;
    try {
      await operation(() => bot.equip(item, "hand"), signal);
      guard(signal);
      if (!plan.AIR.has(bot.blockAt(choice.destination)?.name)) return;
      await operation(() => bot._placeBlockWithOptions
        ? bot._placeBlockWithOptions(choice.wall, choice.face, { forceLook: true, swingArm: "right" })
        : bot.placeBlock(choice.wall, choice.face), signal,
        Math.max(settings.operationTimeoutMs, 6500));
      if (/^(wall_)?torch$/.test(bot.blockAt(choice.destination)?.name || ""))
        torchSites.set(plan.key(choice.destination), { position: choice.destination, feet: foot });
    } catch (error) {
      if (error instanceof Interrupted || error instanceof WorkError) throw error;
      onStatus(`Факел не установлен: ${error.message}; продолжаю добычу`);
    } finally {
      if (!signal.aborted) {
        const items = bot.inventory.items();
        const held = previous && (items.find((value) => value === previous) ||
          items.find((value) => value.type === previous.type && value.slot === previous.slot) ||
          items.find((value) => value.type === previous.type));
        await operation(() => held ? bot.equip(held, "hand") : bot.unequip("hand"), signal);
      }
    }
  }
  function nearbyTargets() {
    return (task.candidates || []).map((pos) => bot.blockAt(pos)).filter(allowed);
  }
  // Keep the connected ore component, including cells already mined away:
  // removing its middle must not make the remaining half look like a new vein.
  function extendVein(candidates) {
    if (!task.mineVein) return;
    const known = new Map([...(task.mineCandidates || []), ...candidates.map(block => block.position)]
      .map(pos => [plan.key(pos), pos]));
    const queue = [...task.mineVein.values()];
    for (let i = 0; i < queue.length; i++) {
      const pos = queue[i];
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        if (task.mineVein.size >= Math.max(512, settings.scanLimit * 4)) return;
        const next = pos.offset(x, y, z), key = plan.key(next);
        if (task.mineVein.has(key) || !known.has(key)) continue;
        const block = bot.blockAt(next);
        if (!allowed(block) || !plan.isOre(block.name)) continue;
        task.mineVein.set(key, next); queue.push(next);
      }
    }
  }
  function veinTargets(candidates) {
    if (!task.mineVein) return candidates;
    extendVein(candidates);
    const focused = candidates.filter(block => task.mineVein.has(plan.key(block.position)));
    if (focused.length) return focused;
    if (crewEnabled() && [...task.mineVein.values()].some(pos => allowed(bot.blockAt(pos)))) {
      // The same vein may cross an 8-block crew lease boundary. Refresh the
      // lease before choosing unrelated ore still inside the old cell.
      task.rescanAt = 0;
      return [];
    }
    task.mineVein = null;
    return candidates;
  }
  function chooseTarget(candidates) {
    candidates = veinTargets(candidates);
    const reachable = new Set(
      candidates
        .filter((block) => !plan.supportBlock(bot, block) && visibleFace(block))
        .map((block) => plan.key(block.position)),
    );
    candidates.sort(
      (a, b) =>
        Number(plan.supportBlock(bot, a)) - Number(plan.supportBlock(bot, b)) ||
        Number(reachable.has(plan.key(b.position))) - Number(reachable.has(plan.key(a.position))) ||
        (task.kind === "forest" && a.position.x === b.position.x && a.position.z === b.position.z
          ? a.position.y - b.position.y
          : a.position.distanceTo(bot.entity.position) -
            b.position.distanceTo(bot.entity.position)),
    );
    const chosen = candidates[0];
    if (chosen && task.kind === "mine" && !task.area && plan.isOre(chosen.name) && !task.mineVein) {
      task.mineVein = new Map([[plan.key(chosen.position), chosen.position.clone()]]);
      extendVein(candidates);
    }
    return chosen;
  }
  async function awaitDrops(signal) {
    // A previous drop must not end the wait for the last block's delayed
    // spawn/metadata. Wait once per batch, including blocks broken en route.
    const remaining = (task.lastDigAt ?? -Infinity) + settings.dropWaitMs - now();
    if (remaining > 0) await wait(remaining, signal);
    guard(signal);
  }
  function acquireMovement() {
    if (movementSettings || !bot.pathfinder?.setMoveOptions) return;
    movementSettings = { ...bot.pathfinder.defaultMoveSettings };
    bot.pathfinder.setMoveOptions({
      canDig: false,
      allowExcavatedDescent: false,
      excavationWidth: 0,
      excavationStairWidth: 0,
      canPlace: Boolean(task?.scaffold) || travelRouting(),
      allow1by1towers: Boolean(task?.scaffold) || travelRouting(),
      exclusionAreasBreak: [
        ...(movementSettings.exclusionAreasBreak || []),
        (block) => {
          const actual = bot.blockAt(block.position);
          if (!actual || routeBreakReason(actual) || crewProtected(actual)) return 1000000;
          if (
            !travelRouting() &&
            task.count &&
            task.mined >= task.count &&
            matchesTarget(bot.blockAt(block.position))
          )
            return 1000000;
          return 0;
        },
      ],
      exclusionAreasPlace: [
        ...(movementSettings.exclusionAreasPlace || []),
        (block) => (task && (travelRouting() || plan.insideTask(task, block.position)) ? 0 : 1000000),
      ],
      allowWaterDrop: false,
      allowBucketWaterDrop: false,
      ...(farming.isFarming(task) ? { walkOnly: true, allowSprinting: false, allowJumpSprint: false, allowLowCeilingJumps: false } : {}),
      maxDropDown: Math.min(2, movementSettings.maxDropDown ?? 2),
    });
  }
  function restoreMovement() {
    if (movementSettings) bot.pathfinder.setMoveOptions(movementSettings);
    movementSettings = null;
  }
  async function halt() {
    bot.stopDigging?.();
    await bot.pathfinder?.stop();
    bot.clearControlStates?.();
    // Finish an already issued inventory click sequence before another
    // controller can close its window and take ownership of the inventory.
    await transferTask.catch(() => {});
    closeStorageWindow();
  }
  function requestPause(reason, survival = false) {
    if (!task && !queue.length) return;
    // A bot waiting for its owner frees its site; a short survival pause keeps it.
    if (!survival) releaseSite();
    pauseRequested = true;
    pausedReason = reason;
    survivalPaused = survival;
    revision++;
    abort.abort();
    desired = "paused";
    void halt().catch((error) => onStatus(`Остановка добычи: ${error.message}`));
    if (!pending) machine.update();
    report(true);
  }
  function inventoryFull() {
    return bot.inventory.emptySlotCount() <= settings.reserveSlots;
  }
  function finish(outcome, reason = "") {
    if (!task) return;
    if (task.kind !== "deliver") releaseSite();
    const finished = {
      ...taskSummary(task),
      outcome,
      mined: task.mined,
      collected: task.collected,
      deposited: task.deposited,
      delivered: task.delivered || 0,
      reason,
    };
    history.push(finished);
    if (history.length > 20) history.shift();
    onStatus(
      `#${task.id} ${outcome}: блоки ${task.mined}; подобрано ${task.collected}${reason ? `; ${reason}` : ""}`,
    );
    task = null;
    target = null;
    lastBlock = null;
    trackedDrops.clear();
    picked.clear();
    desired = "idle";
    restoreMovement();
    if (deliveryContext) {
      const saved = deliveryContext;
      deliveryContext = null;
      task = saved.task;
      trackedDrops.clear();
      for (const [id, entity] of saved.drops) trackedDrops.set(id, entity);
      picked.clear();
      for (const [id, count] of saved.picked) picked.set(id, count);
      pauseRequested = saved.paused;
      pausedReason = saved.reason;
      if (task && !pauseRequested) acquireMovement();
      desired = pauseRequested ? "paused" : task ? "scan" : "idle";
    }
    report(true);
  }
  function dispatch() {
    if (pauseRequested) {
      desired = "paused";
      return;
    }
    if (!task && queue.length) {
      task = queue.shift();
      acquireMovement();
      target = null;
      lastBlock = null;
      trackedDrops.clear();
      picked.clear();
      task.startedAt = now();
      report(true);
    }
    if (!task) return;
    desired = task.kind === "deposit" ? "deposit" : task.kind === "deliver" ? "deliver" : "scan";
  }
  function allowed(block) {
    return (
      matchesTarget(block) &&
      !plan.safetyReason(bot, block) &&
      (task.failed.get(plan.key(block.position)) || 0) < settings.maxAttempts
    );
  }
  async function scanArea(signal) {
    const { min, max } = task.area;
    let unloaded = 0,
      remaining = 0,
      scanned = 0;
    const candidates = [];
    // Complete each layer before descending; traversal is bounded and yields
    // so stop/health events remain responsive even in a large cuboid.
    for (let y = max.y; y >= min.y; y--) {
      for (let x = min.x; x <= max.x; x++) {
        for (let z = min.z; z <= max.z; z++) {
          guard(signal);
          const block = bot.blockAt(new Vec3(x, y, z));
          if (!block) unloaded++;
          else if (matchesTarget(block)) {
            remaining++;
            if (allowed(block)) candidates.push(block);
          }
          if (++scanned % 512 === 0) await wait(0, signal);
        }
      }
      if (candidates.length) break;
    }
    candidates.sort(
      (a, b) =>
        Number(plan.supportBlock(bot, a)) - Number(plan.supportBlock(bot, b)) ||
        a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position),
    );
    return { candidates, unloaded, remaining };
  }
  function drops() {
    // Metadata can arrive after entity spawn, or before our itemDrop listener.
    // Reconcile the live entities as well as retaining already tracked loot.
    if (task.kind !== "collect")
      for (const entity of Object.values(bot.entities || {})) itemDrop(entity);
    const entities =
      task.kind === "collect" ? Object.values(bot.entities || {}) : [...trackedDrops.values()];
    return entities
      .filter(
        (entity) =>
          entity.isValid !== false &&
          !picked.has(entity.id) &&
          entity.getDroppedItem?.() &&
          (task.kind !== "collect" || plan.insideTask(task, entity.position)) &&
          (farming.isFarming(task) || !task.item || entity.getDroppedItem().name === task.item) &&
          (task.failed.get(`item:${entity.id}`) || 0) < settings.maxAttempts,
      )
      .sort(
        (a, b) =>
          a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position),
      );
  }
  async function descendScaffold(signal, scaffoldTask = task) {
    const feet = bot.entity.position.floored();
    const support = bot.blockAt(feet.offset(0, -1, 0));
    const owned = support && scaffoldTask.scaffolds.get(plan.key(support.position));
    if (!owned || owned !== support.type || !bot.entity.onGround) return false;
    const landing = bot.blockAt(support.position.offset(0, -1, 0));
    // Remove only our own support, with an immediate solid landing one block
    // below. A natural floor, changed support, liquid or void is never used.
    if (
      landing?.boundingBox !== "block" ||
      plan.FLUIDS.has(landing.name) ||
      plan.safetyReason(bot, support)
    )
      return false;
    await operation(() => bot.pathfinder.stop(), signal);
    bot.clearControlStates();
    await selectTool(support, signal);
    trackDig(support);
    await operation(() => originalDig(support, true, visibleFace(support) || "raycast"), signal);
    scaffoldTask.scaffolds.delete(plan.key(support.position));
    const until = now() + 3000;
    while (bot.entity.position.y > feet.y - 0.9 || !bot.entity.onGround) {
      if (now() >= until) throw new WorkError("Не удалось безопасно спуститься с опоры");
      await wait(50, signal);
    }
    return true;
  }
  // --- Crew coordination -------------------------------------------------
  function crewEnabled() {
    return Boolean(crew && task && !task.area && (["mine", "forest"].includes(task.kind) || farming.isFarming(task)));
  }
  function crewPosition() {
    const { x, y, z } = bot.entity.position;
    return { x, y, z };
  }
  function releaseSite(done = false, unreachable = false) {
    if (!site) return;
    const { scope, key } = site;
    site = null;
    void Promise.resolve(crew?.request("release", { scope, key, done, unreachable })).catch(() => {});
  }
  async function claimSite(groups, chunks, signal, force = false) {
    const scope = crewTools.scopeOf(task);
    const layout = crewTools.layoutFor(task);
    const ranked = [...groups.values()].sort((a, b) => a.d - b.d).slice(0, 120);
    const reply = await crew.request("claim", {
      scope, dim: crewTools.dimensionOf(bot), pos: crewPosition(), force,
      sites: ranked.map(group => ({ ...crewTools.siteSummary(group),
        d: group.d - (group.positions.some(pos => task.mineVein?.has(plan.key(pos))) ? 1024 : 0) })),
      chunks, zone: layout.zone, zoneCap: layout.zoneCap,
    });
    guard(signal);
    const chosen = reply?.key ? groups.get(reply.key) : null;
    if (!chosen) {
      site = null;
      return null;
    }
    site = { scope, key: chosen.key, x: chosen.x, y: chosen.y, z: chosen.z, cap: chosen.cap, team: reply.team || 1 };
    task.exploreHops = 0;
    return chosen;
  }
  // Narrow the scanned candidates to this bot's site. Keep a live site; when
  // it is used up, report the scan to the crew and lease the best free site.
  async function assignSite(chunks, signal) {
    const dim = crewTools.dimensionOf(bot);
    const groups = crewTools.groupSites(task, task.candidates || [], bot.entity.position, dim);
    task.crewBlocked = 0;
    task.crewGroups = null;
    if (task.mineVein) {
      extendVein(task.candidates.map(pos => bot.blockAt(pos)).filter(allowed));
      if (!task.candidates.some(pos => task.mineVein.has(plan.key(pos)))) task.mineVein = null;
    }
    if (site && groups.has(site.key) && (!task.mineVein ||
        groups.get(site.key).positions.some(pos => task.mineVein.has(plan.key(pos))))) {
      site.pending = false;
      task.candidates = groups.get(site.key).positions;
      return;
    }
    if (site) {
      const done = site.key;
      releaseSite(!groups.has(done));
      if (task.kind === "forest" && done) task.replantDue = true;
    }
    const chosen = await claimSite(groups, chunks, signal);
    if (chosen) {
      // Capacity/ownership still wins if another bot holds the continuation.
      if (task.mineVein && !chosen.positions.some(pos => task.mineVein.has(plan.key(pos)))) task.mineVein = null;
      task.candidates = chosen.positions;
      return;
    }
    task.candidates = [];
    if (groups.size) {
      task.crewBlocked = groups.size;
      task.crewGroups = groups;
    }
  }
  // Nothing free nearby: travel to a site another bot reported, scout an
  // unexplored chunk, or as a last resort help a staffed site.
  async function crewNext(signal) {
    const scope = crewTools.scopeOf(task);
    if ((task.exploreHops || 0) < settings.maxExploreHops) {
      const reply = await crew.request("explore", {
        scope, dim: crewTools.dimensionOf(bot), pos: crewPosition(),
        origin: { x: task.origin.x, y: task.origin.y, z: task.origin.z }, radius: task.radius,
        avoid: [...(task.exploreAvoid || [])],
      });
      guard(signal);
      if (reply?.type === "site" || reply?.type === "chunk") {
        task.exploreHops = (task.exploreHops || 0) + 1;
        task.exploreTarget = reply;
        if (reply.type === "site")
          site = { scope, key: reply.key, x: reply.x, y: reply.y, z: reply.z, cap: reply.cap || 1, team: 1, pending: true };
        desired = "explore";
        return true;
      }
    }
    if (task.crewGroups?.size) {
      const chosen = await claimSite(task.crewGroups, [], signal, true);
      task.crewGroups = null;
      if (chosen) {
        task.crewBlocked = 0;
        task.candidates = chosen.positions;
        const candidates = nearbyTargets();
        if (candidates.length) {
          target = chooseTarget(candidates);
          desired = "move";
          return true;
        }
      }
    }
    return false;
  }
  async function explore(signal) {
    guard(signal);
    const goal = task.exploreTarget;
    task.exploreTarget = null;
    task.rescanAt = 0;
    if (!goal) {
      desired = "scan";
      return;
    }
    while (task.scaffold && (await descendScaffold(signal))) guard(signal);
    onStatus(goal.type === "site"
      ? `Иду к цели, которую нашёл другой бот: ${goal.x} ${goal.y} ${goal.z}`
      : `Разведка: иду в неисследованный чанк ${Math.floor(goal.x / 16)} ${Math.floor(goal.z / 16)}`);
    report(true);
    const scout = new GoalScout(goal.x, bot.entity.position.y, goal.z, goal.type === "site" ? 3 : 6);
    const digging = Boolean(bot.pathfinder.defaultMoveSettings?.canDig);
    try {
      // Walk through existing caves and tunnels first. A scout digs its own
      // passage only when there is no way on foot, so the crew does not riddle
      // the ground with one tunnel per bot.
      bot.pathfinder.setMoveOptions?.({ canDig: false });
      try {
        await navigateOnce(scout, signal, settings.moveTimeoutMs);
      } catch (error) {
        if (!(error instanceof NavigationError) || !digging) throw error;
        guard(signal);
        bot.pathfinder.setMoveOptions?.({ canDig: true });
        await navigate(scout, signal, settings.moveTimeoutMs, goal);
      }
    } catch (error) {
      if (error instanceof Interrupted || error instanceof WorkError || error instanceof InventoryFull) throw error;
      task.exploreAvoid ||= new Set();
      task.exploreAvoid.add(goal.type === "site" ? goal.key : goal.chunk);
      if (goal.type === "site") releaseSite(false, true);
      else void Promise.resolve(crew?.request("skip", { scope: crewTools.scopeOf(task), chunk: goal.chunk })).catch(() => {});
      onStatus(`Разведка: не дошёл (${error.message}); выбираю другое направление`);
    } finally {
      if (!signal.aborted) bot.pathfinder.setMoveOptions?.({ canDig: digging });
    }
    guard(signal);
    desired = "scan";
  }
  async function replantSaplings(signal) {
    task.replantDue = false;
    if (task.kind !== "forest" || !task.saplings?.size) return;
    for (const [entryKey, entry] of [...task.saplings]) {
      guard(signal);
      const item = bot.inventory.items().find((value) => value.name === entry.sapling && value.count > 0);
      // Keep the spot: saplings may still drop from decaying leaves.
      if (!item) continue;
      const soil = bot.blockAt(entry.position);
      const above = bot.blockAt(entry.position.offset(0, 1, 0));
      if (!soil || !SAPLING_SOIL.has(soil.name) || !plan.AIR.has(above?.name) ||
          entry.position.distanceTo(bot.entity.position) > 32) {
        task.saplings.delete(entryKey);
        continue;
      }
      while (task.scaffold && (await descendScaffold(signal))) guard(signal);
      try {
        const top = entry.position.offset(0.5, 1, 0.5);
        if (bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0).distanceTo(top) > settings.digReach - 0.5)
          await navigate(new goals.GoalNear(top.x, entry.position.y + 1, top.z, 2), signal);
        await operation(() => bot.equip(item, "hand"), signal);
        await operation(() => bot.placeBlock(bot.blockAt(entry.position), new Vec3(0, 1, 0)), signal);
        task.planted = (task.planted || 0) + 1;
        onStatus(`Посажен ${entry.sapling} на месте срубленного дерева`);
      } catch (error) {
        if (error instanceof Interrupted || error instanceof WorkError || error instanceof InventoryFull) throw error;
        onStatus(`Саженец не посажен: ${error.message}`);
      }
      task.saplings.delete(entryKey);
    }
  }
  // Split a field into 4x4 plots: one bot per plot, finishing it before the next.
  async function pickFarmAction(actions, signal) {
    const dim = crewTools.dimensionOf(bot);
    const rank = { harvest: 0, plant: 1, till: 2 };
    const byKey = new Map(actions.map((action) => [plan.key(action.position), action]));
    const groups = crewTools.groupSites(task, actions.map((action) => action.position), bot.entity.position, dim,
      (pos) => (rank[byKey.get(plan.key(pos))?.kind] ?? 2) * 6);
    task.crewBlocked = 0;
    const inside = (chosen) => {
      const keys = new Set(chosen.positions.map(plan.key));
      return actions.find((action) => keys.has(plan.key(action.position))) || null;
    };
    if (site && groups.has(site.key)) {
      site.pending = false;
      return inside(groups.get(site.key));
    }
    if (site) releaseSite(true);
    const chosen = await claimSite(groups, [], signal);
    if (chosen) return inside(chosen);
    task.crewBlocked = groups.size;
    return null;
  }
  async function scan(signal) {
    guard(signal);
    if (inventoryFull()) {
      if (!hasStorage())
        throw new WorkError(
          "Инвентарь заполнен. Нажмите «Принести мне добычу» или освободите место и продолжите",
        );
      desired = "deposit";
      return;
    }
    if (task.kind === "collect") {
      pickupOnly = true;
      const list = drops();
      if (list.length) {
        target = list[0];
        desired = "pickup";
      } else
        finish(
          task.missedDrops ? "частично" : "готово",
          "Доступный дроп в заданном радиусе собран",
        );
      return;
    }
    if (farming.isFarming(task)) {
      await awaitDrops(signal);
      if (drops().length) {
        pickupOnly = false;
        desired = "pickup";
        return;
      }
      target = await farming.scanFarming(bot, task, {
        inside: plan.insideTask, maxAttempts: settings.maxAttempts, scanLimit: settings.scanLimit,
        yieldControl: () => wait(0, signal).then(() => guard(signal)),
        pick: crewEnabled() ? (actions) => pickFarmAction(actions, signal) : undefined,
      });
      guard(signal);
      if (target) desired = "farming";
      else if (task.crewBlocked)
        finish(task.failed.size || task.missedDrops ? "частично" : "готово",
          `Мои грядки готовы: вспахано ${task.tilled || 0}, посажено ${task.planted || 0}, собрано ${task.harvested || 0}. ` +
          "Остальные участки обрабатывают другие боты");
      else finish(task.failed.size || task.missedDrops || (task.count && task.mined < task.count) ? "частично" : "готово",
        `Проход завершён: вспахано ${task.tilled || 0}, посажено ${task.planted || 0}, собрано ${task.harvested || 0}. ` +
        "Молодые растения оставлены расти; обрабатываются только загруженные грядки" +
        (task.lastFailure ? `; ${task.lastFailure}` : ""));
      return;
    }
    if (task.count && task.mined >= task.count) {
      while (task.scaffold && (await descendScaffold(signal))) guard(signal);
      await awaitDrops(signal);
      if (drops().length) {
        pickupOnly = false;
        desired = "pickup";
        return;
      }
      await replantSaplings(signal);
      finish(task.missedDrops ? "частично" : "готово");
      return;
    }
    if (drops().length) {
      pickupOnly = false;
      desired = "pickup";
      return;
    }
    if (task.replantDue && task.saplings?.size) {
      await replantSaplings(signal);
      guard(signal);
    }
    let result;
    if (task.area) result = await scanArea(signal);
    else {
      let candidates = nearbyTargets();
      if (!candidates.length || now() >= (task.rescanAt || 0)) {
        let chunks = [];
        const dim = crewTools.dimensionOf(bot);
        if (task.kind === "mine") {
          const found = await scanMine(bot, task, {
            limit: settings.scanLimit,
            index: mineIndex,
            allowed,
            yieldControl: () => wait(0, signal).then(() => guard(signal)),
          });
          task.candidates = found.candidates.map((block) => block.position);
          task.mineCandidates = task.candidates;
          task.scanRemaining = found.remaining;
          chunks = (found.chunks || []).map((chunk) => `${dim}:${chunk}`);
        } else {
          // A crew bot scouts away from the start point: scan around the bot,
          // still limited to the task radius by allowed().
          const from = bot.entity.position.floored();
          const reach = crew ? Math.ceil(task.radius + from.distanceTo(task.origin)) : task.radius;
          task.candidates = bot.findBlocks({
            point: crew ? from : task.origin,
            maxDistance: reach,
            count: settings.scanLimit,
            matching: task.names.map((name) => bot.registry.blocksByName[name].id),
            useExtraInfo: (block) => allowed(block),
          });
          if (crewEnabled()) {
            const farthest = task.candidates.length >= settings.scanLimit
              ? Math.max(...task.candidates.map((pos) => pos.distanceTo(from)))
              : reach;
            chunks = crewTools.scannedChunks(bot, task, from, farthest);
          }
        }
        task.rescanAt = now() + settings.rescanIntervalMs;
        if (crewEnabled()) await assignSite(chunks, signal);
        candidates = nearbyTargets();
      }
      result = {
        candidates,
        remaining: !candidates.length
          ? task.kind === "mine"
            ? task.scanRemaining
            : bot.findBlocks({
                point: task.origin,
                maxDistance: task.radius,
                count: 1,
                matching: task.names.map((name) => bot.registry.blocksByName[name].id),
              }).length
          : 0,
      };
    }
    guard(signal);
    if (!result.candidates.length) {
      if (task.area && (result.unloaded || result.remaining))
        throw new WorkError(
          `Область не закончена: осталось ${result.remaining} блоков; не загружено ${result.unloaded}. Уберите препятствия и продолжите`,
        );
      while (task.scaffold && (await descendScaffold(signal))) guard(signal);
      await awaitDrops(signal);
      if (drops().length) {
        pickupOnly = false;
        desired = "pickup";
        return;
      }
      if (!task.area) await replantSaplings(signal);
      if (crewEnabled() && (await crewNext(signal))) return;
      const staffed = crewEnabled() && task.crewBlocked > 0;
      const scouted = crewEnabled() && (task.exploreHops || 0) > 0;
      let reason =
        staffed
          ? "Свободных целей нет: оставшиеся добывают другие боты"
          : task.count && task.mined < task.count
            ? scouted
              ? "Радиус разведан, целей больше нет; количество не достигнуто"
              : "Целей в загруженной части радиуса больше нет; количество не достигнуто"
            : scouted
              ? "Радиус разведан, доступные цели закончились"
              : "Доступные цели в загруженной части радиуса закончились";
      if (task.lastFailure) reason += `; ${task.lastFailure}`;
      finish(
        (task.count && task.mined < task.count) ||
          task.failed.size ||
          (!staffed && result.remaining) ||
          task.missedDrops
          ? "частично"
          : "готово",
        reason,
      );
      return;
    }
    target = task.area ? result.candidates[0] : chooseTarget(result.candidates);
    desired = "move";
  }
  async function move(signal) {
    guard(signal);
    const block = bot.blockAt(target.position);
    if (!allowed(block)) {
      desired = "scan";
      return;
    }
    while (
      task.scaffold &&
      bot.entity.position.y > block.position.y + 1 &&
      (await descendScaffold(signal))
    )
      guard(signal);
    if (plan.supportBlock(bot, block)) {
      const foot = bot.entity.position.floored();
      const exits = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
        .map(([x, z]) => foot.offset(x, 0, z))
        .filter(
          (pos) =>
            bot.blockAt(pos)?.boundingBox === "empty" &&
            bot.blockAt(pos.offset(0, 1, 0))?.boundingBox === "empty" &&
            bot.blockAt(pos.offset(0, -1, 0))?.boundingBox === "block" &&
            !plan.FLUIDS.has(bot.blockAt(pos)?.name),
        );
      if (!exits.length) throw new Error("Нельзя безопасно отойти с блока под ногами");
      await navigate(
        new goals.GoalCompositeAny(...exits.map((pos) => new goals.GoalBlock(pos.x, pos.y, pos.z))),
        signal,
      );
    }
    // A look-at goal raycasts the live world, so it cannot see through blocks
    // that only the planned route has removed. Reach an adjacent cell first
    // for enclosed ore, then aim against the updated world.
    if (task.routeDig && !visibleFace(block) && bot.canSeeBlock?.(block) === false)
      await navigate(
        new goals.GoalMiningApproach(block.position, task.tunnel ? task.area.min.y : block.position.y),
        signal,
        settings.moveTimeoutMs,
        block.position,
      );
    if (!allowed(bot.blockAt(target.position))) {
      desired = "scan";
      return;
    }
    if (task.routeDig && bot.world?.raycast) {
      // The adjacent feet cell can be open while a block above the ore still
      // hides its face from eye height. Clear only the actual ray obstruction.
      for (let attempt = 0; attempt < 8; attempt++) {
        guard(signal);
        const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0);
        const center = block.position.offset(0.5, 0.5, 0.5);
        const hit = bot.world.raycast(eye, center.minus(eye).normalize(), 4);
        if (visibleFace(block) || !hit || hit.position.equals(block.position)) break;
        const obstruction = bot.blockAt(hit.position);
        await operation(
          () => routeDig(obstruction, true, "raycast"),
          signal,
          Math.max(settings.operationTimeoutMs, tool.getDigTime(obstruction, bot.heldItem) + 5000),
        );
      }
    }
    if (!visibleFace(block)) await navigate(miningGoal(block), signal, settings.moveTimeoutMs, block.position);
    if (!allowed(bot.blockAt(target.position))) {
      desired = "scan";
      return;
    }
    desired = "equip";
  }
  async function farm(signal) {
    const reachable = (block, top, feet = bot.entity.position) => {
      if (!block) return false;
      const height = Math.max(0.5, ...(block.shapes || []).map((shape) => shape[4]));
      const aim = block.position.offset(0.5, top ? height - 0.001 : height / 2, 0.5);
      const eye = feet.offset(0, bot.entity.eyeHeight || 1.62, 0);
      const distance = eye.distanceTo(aim);
      if (distance > settings.digReach || (top && eye.y <= aim.y)) return false;
      if (!bot.world?.raycast) return bot.canSeeBlock?.(block) !== false;
      const hit = bot.world.raycast(eye, aim.minus(eye).normalize(), distance + 0.002);
      // Crops have no collision shapes: an unobstructed ray can end in air.
      return hit ? hit.position.equals(block.position) : !top;
    };
    await farming.executeFarming(bot, task, target, {
      guard: () => guard(signal),
      operation: (factory) => operation(factory, signal),
      approach: async (block, top) => {
        if (!reachable(block, top))
          await navigate(new GoalContainerAccess(block.position, (feet) => reachable(block, top, feet)), signal);
        guard(signal);
        if (!reachable(bot.blockAt(block.position), top)) throw new Error("Грядка вне досягаемости или закрыта");
      },
      confirm: async (predicate, message) => {
        const deadline = now() + 1500;
        while (!predicate() && now() < deadline) await wait(25, signal);
        guard(signal);
        if (!predicate()) throw new Error(message);
      },
      fail: (message) => { throw new WorkError(message); },
      remainingDurability: plan.remainingDurability,
      minToolDurability: settings.minToolDurability,
      trackDig,
    });
    guard(signal);
    desired = "scan";
    report(true);
  }
  async function selectTool(block, signal) {
    const candidates = bot.inventory
      .items()
      .filter(
        (item) =>
          plan.remainingDurability(bot, item) > settings.minToolDurability &&
          block.canHarvest(item.type),
      );
    if (block.canHarvest(null)) candidates.push(null);
    candidates.sort((a, b) => tool.getDigTime(block, a) - tool.getDigTime(block, b));
    if (!candidates.length)
      throw new WorkError(
        `Нет подходящего инструмента для ${block.name}. Положите инструмент в инвентарь и продолжите`,
      );
    const selected = candidates[0];
    if (selected !== (bot.heldItem || null))
      await operation(() => (selected ? bot.equip(selected, "hand") : bot.unequip("hand")), signal);
    if (!block.canHarvest(bot.heldItem?.type ?? null))
      throw new WorkError("Нужен инструмент, который сохраняет дроп блока");
  }
  async function equip(signal) {
    const block = bot.blockAt(target.position);
    if (!allowed(block)) {
      desired = "scan";
      return;
    }
    await selectTool(block, signal);
    desired = "dig";
  }
  async function dig(signal) {
    if (inventoryFull()) {
      desired = "scan";
      return;
    }
    if (task.count && task.mined >= task.count) {
      desired = "scan";
      return;
    }
    const block = bot.blockAt(target.position);
    if (!allowed(block)) {
      desired = "scan";
      return;
    }
    if (plan.supportBlock(bot, block)) throw new Error("Бот стоит на выбранном блоке");
    if (crew && underPlayer(plan.key(block.position))) throw new Error("На блоке стоит другой бот");
    if (!bot.canDigBlock(block)) throw new Error("Блок вне досягаемости");
    const face = visibleFace(block);
    if (!face) throw new Error("Грань блока закрыта; выбираю другую цель");
    if (bot.heldItem && plan.remainingDurability(bot, bot.heldItem) <= settings.minToolDurability)
      throw new WorkError("Инструмент почти сломан. Замените его и продолжите");
    if (!block.canHarvest(bot.heldItem?.type ?? null))
      throw new WorkError("Инструмент сменился; проверьте инвентарь");
    guard(signal);
    if (bot.setControlState)
      await waitForMiningGround(bot, () => {
        guard(signal);
        return false;
      });
    trackDig(block);
    await operation(
      () => bot.dig(block, true, face),
      signal,
      Math.max(settings.operationTimeoutMs, tool.getDigTime(block, bot.heldItem) + 5000),
    );
    // Mineflayer usually resolves after the update; allow a delayed server ack.
    const confirmBy = now() + 1000;
    while (bot.blockAt(block.position)?.type === block.type && now() < confirmBy)
      await wait(25, signal);
    if (bot.blockAt(block.position)?.type === block.type)
      throw new Error("Сервер не подтвердил разрушение блока");
    task.mined++;
    task.failed.delete(plan.key(block.position));
    if (task.kind === "mine" || task.area) await lightPassage(signal);
    const next =
      !task.area &&
      (!task.count || task.mined < task.count) &&
      chooseTarget(nearbyTargets());
    if (next && !plan.supportBlock(bot, next) && visibleFace(next)) {
      target = next;
      desired = "equip";
      return;
    }
    await awaitDrops(signal);
    pickupOnly = false;
    desired = "pickup";
    report();
  }
  async function pickup(signal) {
    for (const entity of pickupOnly ? [target] : drops()) {
      guard(signal);
      if (entity.isValid === false || picked.has(entity.id)) continue;
      if (inventoryFull()) {
        if (!hasStorage())
          throw new WorkError(
            "Нет места для дропа. Нажмите «Принести мне добычу» или освободите инвентарь",
          );
        desired = "deposit";
        return;
      }
      let collected = false;
      const collectedEvent = (collector, item) => {
        if (collector.id === bot.entity.id && item.id === entity.id) collected = true;
      };
      bot.on("playerCollect", collectedEvent);
      try {
        // Reach the item's cell; a one-block stopping distance can leave the
        // bot outside pickup range. Falling items can be collected by the body
        // above the feet, so do not require standing at their fractional Y.
        // 0.75 also includes a valid cell centre for items on cell corners
        // (the furthest centre is sqrt(0.5^2 + 0.5^2) blocks away).
        const goal = goals.GoalFollowEntity.fromEntity(entity, 0.75, { dynamic: true });
        goal.distHeuristic = (node) => {
          const pos = node.exitPos ?? node;
          const dy = entity.position.y - pos.y;
          return Math.hypot(entity.position.x - pos.x, entity.position.z - pos.z,
            Math.max(0, -dy - 0.5, dy - 1.5));
        };
        // Vertical pickup bounds are independent of the horizontal radius.
        // Adding that radius to the lower bound accepts a full block above
        // an item, leaving the player crouched at the edge forever.
        goal.isEnd = (node) => {
          const pos = node.exitPos ?? node;
          const dy = entity.position.y - pos.y;
          return dy >= -0.25 && dy <= 1.5 &&
            Math.hypot(entity.position.x - pos.x, entity.position.z - pos.z) <= 0.75;
        };
        await navigate(
          goal,
          signal,
          settings.pickupTimeoutMs,
          () => entity.position,
        );
        const until = now() + settings.pickupTimeoutMs;
        while (!collected && entity.isValid !== false && now() < until) await wait(50, signal);
        if (!collected && !picked.has(entity.id)) {
          failedDrop(entity);
        }
      } catch (error) {
        if (collected || picked.has(entity.id)) continue;
        if (error instanceof Interrupted || error instanceof WorkError || error instanceof InventoryFull) throw error;
        failedDrop(entity);
      } finally {
        bot.off("playerCollect", collectedEvent);
      }
    }
    desired = "scan";
  }
  function failedDrop(entity) {
    const key = `item:${entity.id}`;
    const attempts = (task.failed.get(key) || 0) + 1;
    task.failed.set(key, attempts);
    if (attempts === settings.maxAttempts) task.missedDrops++;
  }
  async function deposit(signal) {
    if (!hasStorage()) throw new WorkError("Добавьте сундук или группу сундуков во вкладке «Добыча»");
    const before = bot.inventory.emptySlotCount();
    const groups = settings.storageGroups.length ? storage.normalizeStorageGroups(settings.storageGroups) :
      [{ id: "legacy", name: "Сундук", enabled: true, filters: ["#all"], chests: [chest] }];
    let scaffoldReserve = task.scaffold ? settings.travelBlockReserve : 0;
    const buckets = new Map();
    let unmatched = 0;
    for (const item of [...bot.inventory.items()]) {
      if (plan.keepItem(bot, item)) continue;
      if (farming.isFarming(task) && farming.CROPS.some((crop) => item.name === crop.seed)) continue;
      if (task.kind === "forest" && task.replantSaplings && /(?:_sapling|_propagule)$/.test(item.name)) continue;
      const keep = plan.SCAFFOLD_ITEMS.has(item.name) ? Math.min(item.count, scaffoldReserve) : 0;
      scaffoldReserve -= keep;
      const remaining = item.count - keep;
      if (!remaining) continue;
      const group = storage.storageGroupForItem(groups, item, bot.registry);
      if (!group) { unmatched += remaining; continue; }
      if (!buckets.has(group.id)) buckets.set(group.id, { group, entries: [] });
      buckets.get(group.id).entries.push({ item, remaining });
    }
    const blocked = [];
    for (const { group, entries } of buckets.values()) {
      const failures = [];
      let fullChests = 0;
      for (const position of group.chests) {
        guard(signal);
        if (!entries.some((entry) => entry.remaining)) break;
        const statusKey = `${group.id}:${storage.key(position)}`;
        try {
          await approachStorage(position, signal);
          onStatus(`Выгружаю: ${group.name} · ${storage.key(position)}`);
          for (const entry of entries) {
            guard(signal);
            const amount = Math.min(entry.remaining, storage.containerCapacity(chestWindow, entry.item, bot.registry));
            if (!amount) continue;
            await operation(() => {
              const job = task;
              transferTask = Promise.resolve(chestWindow.deposit(entry.item.type, entry.item.metadata, amount, entry.item.nbt)).then(() => {
                entry.remaining -= amount;
                job.deposited += amount;
              });
              return transferTask;
            }, signal);
            report(true);
          }
          const full = entries.some((entry) => entry.remaining);
          if (full) fullChests++;
          storageStatus.set(statusKey, { state: full ? "full" : "ok",
            message: full ? "Нет места для оставшейся добычи" : "Выгрузка выполнена" });
        } catch (error) {
          if (signal.aborted || error instanceof Interrupted) throw error;
          storageStatus.set(statusKey, { state: "unavailable", message: error.message });
          failures.push(`${storage.key(position)}: ${error.message}`);
          onStatus(`${group.name}: ${error.message}; пробую следующий сундук`);
        } finally { closeStorageWindow(); report(true); }
      }
      const left = entries.reduce((count, entry) => count + entry.remaining, 0);
      if (left) {
        const reasons = [];
        if (fullChests) reasons.push("нет места; освободите или добавьте сундуки");
        if (failures.length) reasons.push(`сундуки недоступны (${failures.join("; ")})`);
        blocked.push(`${group.name}: ${left} предметов — ${reasons.join("; ")}`);
      }
    }
    if (blocked.length) throw new WorkError(`Не удалось выгрузить ${blocked.join("; ")}. После устранения причины продолжите задачу`);
    if (task.kind === "deposit") {
      finish("готово", unmatched ? `Без подходящей группы у бота осталось ${unmatched} предметов` : "");
      return;
    }
    if (bot.inventory.emptySlotCount() <= before || inventoryFull())
      throw new WorkError(unmatched ? `Нет места: ${unmatched} предметов без подходящей группы сундуков` :
        "Не удалось освободить достаточно места; инструменты и еда сохранены");
    desired = trackedDrops.size ? "pickup" : "scan";
  }
  function closeStorageWindow() {
    const window = chestWindow;
    chestWindow = null;
    if (window && (!bot.currentWindow || bot.currentWindow === window)) window.close();
  }
  async function approachStorage(position, signal) {
    const chestPosition = plan.position(position);
    let block = bot.blockAt(chestPosition);
    if (!block || bot.entity.position.distanceTo(chestPosition) > 6) {
      // A distant container is a travel destination first. The positional
      // goal enables remembered cave exits and ascent planning even when its
      // chunk is already loaded above us. Use face visibility only nearby.
      await navigate(new goals.GoalNear(chestPosition.x, chestPosition.y, chestPosition.z, 3), signal);
      block = bot.blockAt(chestPosition);
    }
    if (!block || !/(?:chest|barrel|shulker_box)$/.test(block.name))
      throw new Error("Сундук не загружен или отсутствует");
    // Retain a positional goal through the final approach so ascent, remembered
    // exits and chunk-frontier routing still work if the chest is above us.
    // Chests have inset collision shapes; arrival requires a clickable surface.
    const goal = new GoalContainerAccess(block.position, (feet) => Boolean(containerClick(block, feet)));
    await navigate(goal, signal);
    bot.clearControlStates?.();
    bot.setControlState?.("sneak", false);
    // Sneaking with a tool suppresses container interaction. Give Mineflayer
    // one physics tick to publish the released sneak flag to the server.
    if (bot.waitForTicks) await operation(() => bot.waitForTicks(1), signal);
    block = bot.blockAt(chestPosition);
    if (!block || !/(?:chest|barrel|shulker_box)$/.test(block.name))
      throw new Error("Контейнер исчез во время подхода");
    const click = containerClick(block);
    if (!click) throw new Error(`Нет доступной грани сундука в пределах ${CONTAINER_REACH} блоков`);
    if (bot.currentWindow) throw new Error("Закройте открытое окно перед выгрузкой");
    const opening = new AbortController();
    const cancelled = () => opening.abort();
    signal.addEventListener("abort", cancelled, { once: true });
    const timer = setTimeout(cancelled, settings.operationTimeoutMs);
    try {
      chestWindow = await operation(() => openContainer(block, click, opening.signal), signal, settings.operationTimeoutMs + 1000);
    } catch (error) {
      if (opening.signal.aborted && !signal.aborted) throw new Error("Сундук не открылся: проверьте крышку и доступ на сервере", { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancelled);
    }
  }
  function containerClick(block, feet = bot.entity.position) {
    if (!block) return null;
    const eye = feet.offset(0, bot.entity.eyeHeight || 1.62, 0);
    const center = block.position.offset(0.5, 0.5, 0.5);
    const delta = center.minus(eye), length = delta.norm();
    if (!bot.world?.raycast) {
      if (length > CONTAINER_REACH) return null;
      const face = new Vec3(0, 0, 0);
      const axis = ["x", "y", "z"].sort((a, b) => Math.abs(delta[b]) - Math.abs(delta[a]))[0];
      face[axis] = -Math.sign(delta[axis]) || 1;
      return { face, cursor: new Vec3(0.5, 0.5, 0.5) };
    }
    const hit = bot.world.raycast(eye, delta.normalize(), Math.min(CONTAINER_REACH, length + 0.1));
    if (!hit?.position.equals(block.position) || !hit.intersect) return null;
    const faces = [new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1),
      new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)];
    return faces[hit.face] ? { face: faces[hit.face], cursor: hit.intersect.minus(block.position) } : null;
  }
  async function openContainer(block, click, signal) {
    // Mineflayer's openContainer leaves its windowOpen listener alive after a
    // cancelled request. A later retry can then resolve both calls and close
    // the new window under deposit. Own only this opening's event listeners.
    if (!bot.activateBlock) return bot.openContainer(block, click.face, click.cursor);
    clearCancelledOpen();
    let cancelOpening = () => {};
    const opening = new Promise((resolve, reject) => {
      const cleanup = () => {
        bot.off("windowOpen", opened);
        bot.off("end", cancel);
        signal.removeEventListener("abort", cancel);
      };
      const opened = (window) => { cleanup(); resolve(window); };
      const cancel = () => {
        cleanup();
        const late = (window) => {
          clearCancelledOpen();
          if (bot.currentWindow === window) window.close();
        };
        const timer = setTimeout(() => clearCancelledOpen(), 2500);
        timer.unref?.();
        clearCancelledOpen = () => {
          clearTimeout(timer);
          bot.off("windowOpen", late);
          clearCancelledOpen = () => {};
        };
        bot.on("windowOpen", late);
        reject(new Interrupted());
      };
      cancelOpening = cancel;
      bot.on("windowOpen", opened);
      bot.once("end", cancel);
      signal.addEventListener("abort", cancel, { once: true });
    });
    const activation = Promise.resolve().then(() => {
      guard(signal);
      return bot.activateBlock(block, click.face, click.cursor);
    });
    try {
      const [window] = await Promise.all([opening, activation]);
      if (!/minecraft:(?:generic|container|.*chest|barrel|.*shulker_box)/.test(window.type || "")) {
        window.close();
        throw new Error("Сервер открыл другое меню вместо контейнера");
      }
      return window;
    } catch (error) {
      if (!signal.aborted) cancelOpening();
      await activation.catch(() => {});
      throw error;
    }
  }
  async function deliver(signal) {
    guard(signal);
    if (!task.prepared) {
      while (
        deliveryContext?.task?.scaffold &&
        (await descendScaffold(signal, deliveryContext.task))
      )
        guard(signal);
      task.returnPoint = bot.entity.position.clone();
      task.prepared = true;
    }
    let owner = task.owner();
    rememberOwner(owner);
    if (!owner || owner.isValid === false) {
      // Far from the owner the server stops sending the player. Walk back to
      // where the owner was last seen (or where the work started) first.
      const anchor = ownerSeen || deliveryContext?.task?.origin;
      if (!anchor)
        throw new WorkError("Владелец не виден. Подойдите ближе и нажмите «Продолжить»");
      onStatus(`Владелец далеко: иду туда, где видел его в последний раз (${Math.floor(anchor.x)} ${Math.floor(anchor.y)} ${Math.floor(anchor.z)})`);
      for (let leg = 0; leg < 24; leg++) {
        guard(signal);
        owner = task.owner();
        if ((owner && owner.isValid !== false) || bot.entity.position.distanceTo(anchor) <= 6) break;
        await navigate(new goals.GoalNear(anchor.x, anchor.y, anchor.z, 4), signal, settings.moveTimeoutMs, anchor);
      }
      owner = task.owner();
      if (!owner || owner.isValid === false)
        throw new WorkError("Дошёл до места, где видел владельца, но его там нет. Подойдите ближе и нажмите «Продолжить»");
    }
    const goal = goals.GoalFollowEntity.fromEntity(owner, 2, { dynamic: true });
    const nearOwner = goal.isEnd.bind(goal);
    goal.isEnd = (node) => nearOwner(node) && Math.abs((node.exitPos || node).y - goal.y) <= 1;
    try {
      await navigate(goal, signal, settings.moveTimeoutMs, () => owner.position);
    } catch (error) {
      if (error instanceof NavigationError && ["noPath", "timeout"].includes(error.reason)) {
        const blocks = bot.inventory.items().some((item) => plan.SCAFFOLD_ITEMS.has(item.name));
        throw new WorkError(blocks
          ? "Не найден безопасный выход к владельцу; проверьте препятствия и продолжите"
          : "Для выхода нужны строительные блоки: булыжник, колотый глубинный сланец или земля");
      }
      throw error;
    }
    let scaffoldReserve = settings.travelBlockReserve;
    let retained = 0;
    for (const item of [...bot.inventory.items()]) {
      guard(signal);
      if (plan.keepItem(bot, item)) continue;
      const keep = plan.SCAFFOLD_ITEMS.has(item.name) ? Math.min(item.count, scaffoldReserve) : 0;
      scaffoldReserve -= keep;
      retained += keep;
      const amount = item.count - keep;
      if (!amount) continue;
      const currentOwner = task.owner();
      if (
        !currentOwner ||
        currentOwner.isValid === false ||
        currentOwner.position.distanceTo(bot.entity.position) > 3.5
      )
        throw new WorkError("Владелец отошёл. Добыча сохранена; подойдите ближе и продолжите");
      await operation(() => bot.lookAt(currentOwner.position.offset(0, 1, 0), true), signal);
      await operation(() => amount === item.count
        ? bot.tossStack(item)
        : bot.toss(item.type, item.metadata, amount), signal);
      task.delivered += amount;
      report(true);
    }
    onStatus(`Выброшено для владельца: ${task.delivered} предметов. Для пути оставлено ${retained} блоков. Возвращаюсь к месту работы`);
    task.deliveryPhase = "return";
    desired = "return";
  }
  async function returnToWork(signal) {
    // A pillar fills the original shaft. Walk to its top before dismantling
    // our own supports; a walking search cannot see through the filled floor.
    const column = [...task.scaffolds.keys()]
      .map((key) => new Vec3(...key.split(",").map(Number)))
      .filter((pos) => pos.offset(0.5, 0, 0.5).xzDistanceTo(task.returnPoint) < 0.8 &&
        pos.y >= Math.floor(task.returnPoint.y) &&
        bot.blockAt(pos)?.type === task.scaffolds.get(plan.key(pos)))
      .sort((a, b) => b.y - a.y)[0];
    if (column && bot.entity.position.y >= column.y + 0.9) {
      await navigate(new goals.GoalBlock(column.x, column.y + 1, column.z), signal);
    }
    while (bot.entity.position.y > task.returnPoint.y + 0.9 && await descendScaffold(signal))
      guard(signal);
    await navigate(new goals.GoalNear(task.returnPoint.x, task.returnPoint.y, task.returnPoint.z, 0.8), signal,
      settings.moveTimeoutMs, task.returnPoint);
    finish("готово", `Добыча выброшена у владельца: ${task.delivered}`);
  }
  const actions = {
    idle: dispatch,
    scan,
    move,
    equip,
    dig,
    farming: farm,
    pickup,
    deposit,
    deliver,
    return: returnToWork,
    explore,
  };
  function enter(name) {
    if (name === "paused") {
      restoreMovement();
      report(true);
      return;
    }
    if (name === "idle") {
      dispatch();
      return;
    }
    if (!task || pending) return;
    const travel = ["deliver", "return", "deposit"].includes(name);
    const passage = ["move", "explore"].includes(name) && (task.kind === "mine" || task.tunnel) && task.routeDig;
    bot.pathfinder.setMoveOptions?.({
      allowExcavatedDescent: name === "move" && task.kind === "mine" && task.routeDig,
      excavationWidth: passage ? task.tunnelWidth || settings.tunnelWidth : 0,
      excavationHeight: task.tunnelHeight || settings.tunnelHeight,
      excavationStairWidth: passage ? settings.stairWidth : 0,
      excavationStairHeight: settings.stairHeight,
      ...(travel ? travelMoveOptions() : {
        canDig: ["move", "pickup", "explore"].includes(name) && task.routeDig,
        canPlace: Boolean(task.scaffold),
        allow1by1towers: Boolean(task.scaffold),
        maxDropDown: passage ? 1 : Math.min(2, movementSettings?.maxDropDown ?? 2),
        allowWaterDrop: false,
        allowBucketWaterDrop: false,
      }),
    });
    const generation = revision,
      signal = abort.signal;
    pending = true;
    work = Promise.resolve()
      .then(() => {
        guard(signal);
        return actions[name](signal);
      })
      .catch((error) => {
        if (generation !== revision || disposed) return;
        if (error instanceof Interrupted) {
          requestPause("Движение прервано; восстанавливаю работу", true);
          return;
        }
        if (error instanceof InventoryFull) {
          if (hasStorage()) desired = "deposit";
          else requestPause(`${error.message}; добавьте сундук или освободите инвентарь и продолжите`);
          return;
        }
        if (error instanceof WorkError || ["scan", "deposit", "deliver", "return"].includes(name)) {
          requestPause(error.message, error.resumeOnRecovery);
          return;
        }
        const targetKey =
          target && (target.getDroppedItem ? `item:${target.id}` : plan.key(target.position));
        if (targetKey) task.failed.set(targetKey, (task.failed.get(targetKey) || 0) + 1);
        onStatus(`#${task.id}: пропуск цели (${error.message})`);
        task.lastFailure = error.message;
        desired = "scan";
      })
      .finally(() => {
        pending = false;
        if (pauseRequested) desired = "paused";
        if (!disposed) machine.update();
      });
  }
  const states = Object.fromEntries(
    PHASES.map((name) => [
      name,
      {
        stateName: name,
        active: false,
        onStateEntered: () => enter(name),
      },
    ]),
  );
  const transitions = [];
  for (const parent of PHASES)
    for (const child of PHASES) {
      if (parent === child) continue;
      transitions.push(
        new StateTransition({
          parent: states[parent],
          child: states[child],
          shouldTransition: () => !pending && desired === child,
          name: `${parent}:${child}`,
        }),
      );
    }
  const machine = new NestedStateMachine(transitions, states.idle);
  machine.active = true;
  machine.onStateEntered();
  function tick() {
    if (disposed) return;
    const ownerEntity = bot.players?.[bot.launcherOwnerName]?.entity;
    rememberOwner(ownerEntity);
    defense.tick();
    if (task && !pauseRequested && bot.health <= settings.minHealth)
      requestPause(`Мало здоровья (${bot.health}); жду восстановления`, bot.health > 0);
    if (task && bot.launcherSurvival?.busy && !pauseRequested)
      requestPause("Еда или аварийное спасение", true);
    if (task && bot.launcherDefendingBow && !pauseRequested) requestPause("Защита от стрел", true);
    if (
      survivalPaused &&
      !bot.launcherSurvival?.busy &&
      !bot.launcherDefendingBow &&
      !defense.busy &&
      !pending &&
      bot.health > settings.minHealth
    )
      resume(false);
    if (!pending) {
      if (machine.activeState === states.idle) dispatch();
      machine.update();
    }
    if (task && !pauseRequested) report();
  }
  function itemDrop(entity) {
    if (
      task &&
      entity.getDroppedItem?.() &&
      !picked.has(entity.id) &&
      [...(task.digSites?.values() || [])].some(
        (site) =>
          now() - site.time <= 5000 &&
          entity.position.distanceTo(site.position.offset(0.5, 0.5, 0.5)) <= 3,
      )
    )
      trackedDrops.set(entity.id, entity);
  }
  function blockPlaced(previous, block) {
    if (
      task && (task.scaffold || travelRouting()) &&
      block &&
      previous?.boundingBox === "empty" &&
      (travelRouting() || plan.insideTask(task, block.position)) &&
      bot.pathfinder.currentMove?.toPlace.some((place) => place.vec.equals(block.position))
    )
      task.scaffolds.set(plan.key(block.position), block.type);
  }
  function collected(collector, entity) {
    if (!task || collector.id !== bot.entity.id || picked.has(entity.id)) return;
    itemDrop(entity);
    if (
      trackedDrops.has(entity.id) ||
      (task.kind === "collect" &&
        plan.insideTask(task, entity.position) &&
        (!task.item || entity.getDroppedItem?.()?.name === task.item))
    ) {
      const count = entity.getDroppedItem?.()?.count || 1;
      picked.set(entity.id, count);
      trackedDrops.delete(entity.id);
      const failedKey = `item:${entity.id}`;
      if ((task.failed.get(failedKey) || 0) >= settings.maxAttempts) task.missedDrops--;
      task.failed.delete(failedKey);
      task.collected += count;
      report();
    }
  }
  function resume(clearFailures = true) {
    if (disposed) throw new Error("Бот отключён");
    if (pending) throw new Error("Дождитесь остановки текущей операции");
    if (bot.launcherSurvival?.busy) throw new Error("Бот занят едой или спасением");
    if (bot.launcherDefendingBow) throw new Error("Бот защищается от стрел");
    if (defense.busy) throw new Error("Бот защищается или отходит от опасности");
    if (bot.health <= settings.minHealth) throw new Error("Сначала восстановите здоровье");
    revision++;
    abort = new AbortController();
    pauseRequested = false;
    survivalPaused = false;
    pausedReason = "";
    if (task && clearFailures) task.failed.clear();
    if (task) acquireMovement();
    desired = task
      ? task.kind === "deposit"
        ? "deposit"
        : task.kind === "deliver"
          ? task.deliveryPhase || "deliver"
          : "scan"
      : "idle";
    machine.update();
    report(true);
  }
  async function stop() {
    if (!busy() && !movementSettings) return;
    revision++;
    abort.abort();
    pauseRequested = true;
    await defense.stop();
    queue.length = 0;
    deliveryContext = null;
    await halt();
    await work;
    finish("отменено");
    restoreMovement();
    pauseRequested = false;
    survivalPaused = false;
    pausedReason = "";
    abort = new AbortController();
    desired = "idle";
    if (!disposed) machine.update();
  }
  const controller = {
    machine,
    settings,
    configurePassages(input) {
      Object.assign(settings, plan.passageSettings(input, settings));
      torchAttempt = null;
      return plan.passageSettings(settings);
    },
    configureDefense(input) {
      Object.assign(settings, plan.defenseSettings(input, settings));
      defense.tick();
      return plan.defenseSettings(settings);
    },
    configureStorage(input) {
      const groups = storage.normalizeStorageGroups(input);
      const keys = new Set(groups.flatMap((group) => group.chests.map((point) => `${group.id}:${storage.key(point)}`)));
      for (const key of storageStatus.keys()) if (!keys.has(key)) storageStatus.delete(key);
      settings.storageGroups = groups;
      report(true);
      return groups;
    },
    captureChest(value) {
      storagePick = plan.position(value);
      report(true);
      return storagePick;
    },
    get protecting() {
      return !disposed && Boolean(task) && (!pauseRequested || survivalPaused);
    },
    get busy() {
      return busy();
    },
    get status() {
      return status();
    },
    get task() {
      return work;
    },
    get snapshot() {
      return {
        phase: machine.activeState?.stateName,
        automaticPause: survivalPaused,
        active: taskSummary(task),
        queue: queue.map(taskSummary),
        history: [...history],
        reason: pausedReason,
        selection: selectionSnapshot(),
      };
    },
    validate: (input) => plan.normalizeTask(bot, input, settings),
    enqueue(input) {
      if (disposed) throw new Error("Бот отключён");
      if (queue.length >= settings.maxQueue) throw new Error("Очередь заполнена");
      const spec = plan.normalizeTask(bot, input, settings);
      const entry = {
        ...spec,
        id: nextId++,
        mined: 0,
        collected: 0,
        deposited: 0,
        missedDrops: 0,
        failed: new Map(),
        scaffolds: new Map(),
      };
      queue.push(entry);
      tick();
      report(true);
      return entry.id;
    },
    pause(reason) {
      requestPause(reason || "Пауза владельца");
      void defense.stop();
    },
    resume,
    stop,
    async deliver(owner) {
      if (disposed) throw new Error("Бот отключён");
      if (task?.kind === "deliver") {
        if (
          pauseRequested &&
          !pending &&
          bot.health > settings.minHealth &&
          !bot.launcherSurvival?.busy &&
          !defense.busy &&
          !bot.launcherDefendingBow
        )
          resume(false);
        report(true);
        return task.id;
      }
      const player = owner();
      rememberOwner(player);
      if ((!player || player.isValid === false) && !ownerSeen && !task?.origin)
        throw new Error("Владелец не виден. Подойдите к боту");
      if (!bot.inventory.items().some((item) => !plan.keepItem(bot, item)))
        throw new Error("В инвентаре нет добычи для передачи");
      const paused =
        pauseRequested && !survivalPaused && !/Инвентарь|места для дропа/.test(pausedReason);
      const reason = paused ? pausedReason : "";
      requestPause("Подготовка передачи добычи");
      await defense.stop();
      await halt();
      await work;
      revision++;
      abort = new AbortController();
      const returnPoint = bot.entity.position.clone();
      deliveryContext = { task, paused, reason, drops: [...trackedDrops], picked: [...picked] };
      restoreMovement();
      task = {
        id: nextId++,
        kind: "deliver",
        owner,
        returnPoint,
        mined: 0,
        collected: 0,
        deposited: 0,
        delivered: 0,
        failed: new Map(),
        scaffolds: new Map(),
      };
      target = null;
      lastBlock = null;
      trackedDrops.clear();
      picked.clear();
      pauseRequested = false;
      survivalPaused = false;
      pausedReason = "";
      revision++;
      abort = new AbortController();
      acquireMovement();
      desired = "deliver";
      machine.update();
      report(true);
      return task.id;
    },
    pauseForSurvival() {
      if (task && !pauseRequested) requestPause("Еда или аварийное спасение", true);
    },
    pauseForDefense(reason = "Защита от стрел") {
      if (task && !pauseRequested) requestPause(reason, true);
      else if (task && survivalPaused) { pausedReason = reason; report(true); }
    },
    resumeAfterSurvival() {
      if (
        survivalPaused &&
        !pending &&
        !bot.launcherSurvival?.busy &&
        !bot.launcherDefendingBow &&
        !defense.busy &&
        bot.health > settings.minHealth
      )
        resume(false);
    },
    setChest(value) {
      chest = value ? plan.position(value) : null;
      report(true);
      return chest;
    },
    setCorner(name, corner, value) {
      if (!/^[\p{L}\p{N}_-]{1,32}$/u.test(name) || ![1, 2].includes(corner))
        throw new Error("area имя 1|2 [x y z]");
      const selection = {
        ...corners.get(name),
        [corner]: plan.position(value || bot.entity.position),
      };
      if (selection[1] && selection[2])
        // Picking a new area may temporarily combine a new corner with an old
        // distant one. Validate the volume when starting work, not while picking.
        areas.set(name, plan.bounds(selection[1], selection[2], Number.MAX_SAFE_INTEGER));
      corners.set(name, selection);
      report(true);
      return areas.get(name) || null;
    },
    getArea(name) {
      const area = areas.get(name);
      if (!area) throw new Error(`Область ${name} не задана двумя углами`);
      return plan.bounds(area.min, area.max, settings.maxAreaVolume);
    },
    get areas() {
      return [...areas.entries()].map(([name, area]) => `${name}: ${area.min} → ${area.max}`);
    },
    remove(id) {
      const index = queue.findIndex((t) => t.id === Number(id));
      if (index < 0) throw new Error("Такой задачи в очереди нет");
      queue.splice(index, 1);
      report(true);
    },
    reorder(id, direction) {
      if (!["up", "down"].includes(direction)) throw new Error("Направление: up или down");
      const index = queue.findIndex((entry) => entry.id === Number(id));
      if (index < 0) throw new Error("Такой задачи в очереди нет");
      const next = index + (direction === "up" ? -1 : 1);
      if (next >= 0 && next < queue.length)
        [queue[index], queue[next]] = [queue[next], queue[index]];
      report(true);
    },
    async cancel(id) {
      if (task?.id !== Number(id)) {
        controller.remove(id);
        return;
      }
      const paused = (pauseRequested && !survivalPaused) || Boolean(deliveryContext?.paused);
      revision++;
      abort.abort();
      pauseRequested = true;
      await defense.stop();
      await halt();
      await work;
      finish("отменено");
      abort = new AbortController();
      pauseRequested = paused;
      survivalPaused = false;
      pausedReason = paused ? "Пауза владельца" : "";
      desired = paused ? "paused" : task ? "scan" : "idle";
      machine.update();
      tick();
      report(true);
    },
    clearQueue() {
      queue.length = 0;
      report(true);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      crew?.setBeat(null);
      releaseSite();
      await defense.dispose();
      mineIndex.dispose();
      if (bot.dig === routeDig) bot.dig = originalDig;
      bot.off("physicsTick", tick);
      bot.off("itemDrop", itemDrop);
      bot.off("playerCollect", collected);
      bot.off("blockPlaced", blockPlaced);
      await stop();
      clearCancelledOpen();
      machine.onStateExited();
    },
  };
  const mineIndex = createMineIndex(bot);
  const defense = createGatheringDefense(bot, controller, { isOwner: hooks.isOwner, now, onStatus });
  bot.on("physicsTick", tick);
  bot.on("itemDrop", itemDrop);
  bot.on("playerCollect", collected);
  bot.on("blockPlaced", blockPlaced);
  crew?.setBeat(() => {
    if (disposed || !bot.entity?.position) return null;
    const active = task?.kind === "deliver" ? deliveryContext?.task : task;
    const dim = crewTools.dimensionOf(bot);
    if (dim !== floorCursor.dim) {
      // Floors are per dimension: reread them after a portal.
      sharedFloors.clear();
      floorCursor = { seq: 0, epoch: floorCursor.epoch, dim };
    }
    return {
      pos: crewPosition(),
      dim,
      scope: active && active.kind !== "deposit" ? crewTools.scopeOf(active) : null,
      held: site ? [{ scope: site.scope, key: site.key, x: site.x, y: site.y, z: site.z, cap: site.cap }] : [],
      floors: floorOutbox.splice(0, 512),
      floorSeq: floorCursor.seq,
      floorEpoch: floorCursor.epoch,
    };
  }, (reply) => {
    if (disposed || typeof reply.floorEpoch !== "string") return;
    // A new hub took over: it has no floors yet, so share ours again.
    if (floorCursor.epoch && reply.floorEpoch !== floorCursor.epoch) {
      floorOutbox.length = 0;
      floorOutbox.push(...passageFloors.keys());
    }
    floorCursor = { seq: Number(reply.floorSeq) || 0, epoch: reply.floorEpoch, dim: floorCursor.dim };
    for (const key of reply.floors || []) sharedFloors.add(key);
    for (const key of sharedFloors) {
      if (sharedFloors.size <= 40000) break;
      sharedFloors.delete(key);
    }
  });
  bot.launcherGathering = controller;
  return controller;
}

module.exports = { createGatheringController, WorkError, Interrupted };
