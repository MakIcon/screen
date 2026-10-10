const defaults = require("./combat-defaults.json");
const { Vec3 } = require("vec3");
const { toNotchianYaw, toNotchianPitch } = require("mineflayer/lib/conversions");
const { goals } = require("./pathfinder.cjs");
const { createCrystalPlanner } = require("./crystals.cjs");
const { createBowDefense } = require("./bow-defense.cjs");
const { carriedItems, equipCombatItem } = require("./combat-inventory.cjs");

const protocolInstalled = Symbol("combatProtocolInstalled");
const originalTurnTime = Symbol("originalSmoothTurnTime");

function combatLookPacket(bot, yaw = bot.entity.yaw, pitch = bot.entity.pitch) {
  return {
    yaw: Math.fround(toNotchianYaw(yaw)),
    pitch: Math.fround(toNotchianPitch(pitch)),
    onGround: Boolean(bot.entity.onGround),
    flags: {
      onGround: Boolean(bot.entity.onGround),
      hasHorizontalCollision: Boolean(bot.entity.isCollidedHorizontally),
    },
  };
}

function installCombatProtocol(bot) {
  const client = bot._client;
  if (!client || client[protocolInstalled]) return;
  const types = bot.registry?.protocol?.play?.toServer?.types;
  const write = client.write.bind(client);
  client.write = (name, packet) => {
    if (name === "attack" || (name === "use_entity" && packet.mouse === 1)) {
      // physicsTick runs before Mineflayer publishes the updated rotation.
      // Publish the aimed view first so other players see it before the strike.
      if (client.state === "play") write("look", combatLookPacket(bot));
    }
    // 26.1 split attacks from entity interactions. Both Mineflayer 4.37.1
    // and Custom PvP still send the old mouse=1 interaction packet.
    if (name === "use_entity" && packet.mouse === 1 && types?.packet_attack) {
      return write("attack", { entityId: packet.target });
    }
    if (
      ["position", "position_look", "look", "flying"].includes(name) &&
      types?.MovementFlags &&
      !packet.flags &&
      typeof packet.onGround === "boolean"
    ) {
      packet = {
        ...packet,
        flags: {
          onGround: packet.onGround,
          hasHorizontalCollision: Boolean(bot.entity?.isCollidedHorizontally),
        },
      };
    }
    return write(name, packet);
  };
  client[protocolInstalled] = true;
}

function canSeeTarget(bot, entity) {
  if (!bot.entity?.position || !entity?.position || entity.isValid === false || !bot.world?.raycast)
    return false;
  const eyes = bot.entity.position.offset(
    0,
    bot.entity.eyeHeight ?? (bot.entity.height ?? 1.8) * 0.9,
    0,
  );
  const height = entity.height ?? 1.8;
  // Test the torso and head so partial cover does not hide the whole entity.
  return [0.5, 0.9].some((fraction) => {
    const offset = entity.position.offset(0, height * fraction, 0).minus(eyes);
    const range = offset.norm();
    return range < 0.01 || bot.world.raycast(eyes, offset.scaled(1 / range), range) === null;
  });
}

function loadBasicCombat(bot) {
  const on = bot.on;
  // Scope the old event alias to this plugin's synchronous initialization.
  bot.on = function (name, listener) {
    return on.call(this, name === "physicTick" ? "physicsTick" : name, listener);
  };
  try {
    require("mineflayer-pvp").plugin(bot);
  } finally {
    bot.on = on;
  }
}

function normalizeCombat(value = {}) {
  const draft = value && typeof value === "object" ? value : {};
  const result = { ...defaults };
  const enums = {
    engine: ["custom", "basic"],
    style: ["auto", "melee", "ranged", "crystal"],
    autoTarget: ["manual", "hostile"],
    weapon: ["sword", "axe"],
    strafe: ["off", "intelligent", "circle", "random"],
    criticals: ["off", "hop", "shorthop"],
    sprintTap: ["off", "wtap", "stap", "sprintcancel"],
    bowEngine: ["custom", "hawkeye"],
    crystalPriority: ["damage", "closest"],
    crystalCoverBlock: ["auto", "obsidian", "planks", "cobblestone"],
    bowDefenseMode: ["early", "trajectory"],
  };
  const bounds = {
    bowDefenseCheckMs: [0, 500],
    bowDefenseRange: [4, 128],
    bowDefenseMargin: [0, 2],
    bowDefenseHoldMs: [100, 2000],
    crystalMaxCoverBlocks: [0, 4],
    crystalSpawnTimeoutMs: [300, 5000],
    crystalRetries: [1, 5],
    targetRange: [4, 128],
    reactionMs: [0, 3000],
    meleeSkill: [0, 100],
    cps: [1, 20],
    attackRange: [1, 3],
    smoothAimSpeed: [10, 300],
    bowAccuracy: [0, 100],
    bowRange: [4, 120],
    bowIntervalMs: [1200, 10000],
    crystalPlaceRange: [1, 4.5],
    crystalBreakRange: [1, 4.5],
    crystalMinDamage: [0, 100],
    crystalMaxSelfDamage: [0, 20],
    crystalMinHealth: [1, 20],
    crystalIntervalMs: [100, 5000],
    crystalPredictionTicks: [0, 10],
    pearlMinDistance: [4, 64],
    pearlMaxDistance: [8, 64],
    pearlCooldownMs: [1000, 10000],
    pearlMinHealth: [6, 20],
    pearlReserve: [0, 64],
  };
  for (const key of Object.keys(defaults)) {
    if (typeof defaults[key] === "boolean") {
      if (typeof draft[key] === "boolean") result[key] = draft[key];
    } else if (enums[key]) {
      if (enums[key].includes(draft[key])) result[key] = draft[key];
    } else if (typeof draft[key] === "number" && Number.isFinite(draft[key])) {
      const [min, max] = bounds[key];
      const numeric = [
        "attackRange",
        "targetRange",
        "bowRange",
        "crystalPlaceRange",
        "crystalBreakRange",
        "bowDefenseRange",
        "bowDefenseMargin",
      ].includes(key)
        ? draft[key]
        : Math.round(draft[key]);
      result[key] = Math.max(min, Math.min(max, numeric));
    }
  }
  result.pearlMinDistance = Math.min(result.pearlMinDistance, result.pearlMaxDistance);
  return result;
}

// Translate the small classic Pathfinder surface used by both melee plugins
// to the launcher's dynamic entity goals. Keep the existing planner and controls.
function installCombatNavigation(bot, onError) {
  const pathfinder = bot.pathfinder;
  const stop = pathfinder.stop.bind(pathfinder);
  let generation = 0;
  let follow = null;
  pathfinder.setMovements = () => {}; // The launcher owns movement settings.
  pathfinder.setGoal = (goal) => {
    if (!goal) {
      void pathfinder.stop();
      return;
    }
    if (!goal.entity) throw new Error("Combat navigation requires an entity goal");
    const range = Math.sqrt(goal.rangeSq ?? 4);
    if (follow?.entity === goal.entity && follow.range === range) return;
    follow = { entity: goal.entity, range };
    pathfinder.goal = goal;
    const revision = ++generation;
    const nativeGoal = goals.GoalFollowEntity.fromEntity(goal.entity, range, {
      dynamic: true,
      neverfinish: true,
    });
    void pathfinder.goto(nativeGoal).catch((error) => {
      if (revision === generation) {
        follow = null;
        onError(error);
      }
    });
  };
  pathfinder.stop = () => {
    generation++;
    follow = null;
    pathfinder.goal = null;
    return Promise.resolve(stop()).catch(onError);
  };
}

function configureCombatPlugins(bot, settings, onError = () => {}) {
  installCombatProtocol(bot);
  const custom = require("@nxg-org/mineflayer-custom-pvp");
  const hawkeye = require("minecrafthawkeye");
  bot.loadPlugin(custom.default || custom);
  bot.loadPlugin(loadBasicCombat);
  bot.loadPlugin(hawkeye.default || hawkeye);
  const customRequire = require("node:module").createRequire(
    require.resolve("@nxg-org/mineflayer-custom-pvp"),
  );
  const smoothRequire = require("node:module").createRequire(
    customRequire.resolve("@nxg-org/mineflayer-smooth-look"),
  );
  bot.smoothLook.setEasing(smoothRequire("@tweenjs/tween.js").Easing.Quadratic.Out);
  const smoothLook = bot.smoothLook;
  smoothLook[originalTurnTime] ??= smoothLook.estimateTurnTime.bind(smoothLook);
  // Scale only the combat tween; physics rotation speeds also control navigation.
  smoothLook.estimateTurnTime = (yaw, pitch) =>
    (smoothLook[originalTurnTime](yaw, pitch) * 100) /
    (settings.smoothAimSpeed ?? defaults.smoothAimSpeed);

  function rotateTowardTarget(target) {
    if (bot.launcherDefendingBow) return;
    if (!target || !canSeeTarget(bot, target)) return;
    const point = target.position.offset(0, (target.height ?? 1.8) * 0.9, 0);
    const rotation = settings.smoothAim
      ? bot.smoothLook.lookAt(point, true)
      : bot.lookAt(point, true);
    void rotation.catch(onError);
  }
  function aimedAt(target) {
    if (!target || !canSeeTarget(bot, target)) return false;
    const eyes = bot.entity.position.offset(0, bot.entity.eyeHeight ?? bot.entity.height * 0.9, 0);
    return (
      bot.util.raytrace.entityRaytrace(
        eyes,
        bot.util.getViewDir(),
        settings.attackRange,
        (entity) => entity.id === target.id,
      ) === target
    );
  }

  const options = bot.swordpvp.options;
  options.cps = settings.cps;
  options.genericConfig.attackRange = settings.attackRange;
  options.genericConfig.viewDistance = settings.targetRange;
  options.genericConfig.tooCloseRange = Math.max(0.5, settings.attackRange - 0.5);
  options.genericConfig.hitThroughWalls = false;
  // The upstream miss implementation recursively waits for another tick.
  // Skip opportunities here instead, including skill=0, without pending loops.
  options.genericConfig.missChancePerTick = 0;
  options.followConfig = {
    mode: "standard",
    distance: Math.max(1, settings.attackRange - 0.5),
    predictTicks: 4,
  };
  options.strafeConfig.enabled = settings.strafe !== "off";
  options.strafeConfig.mode.mode = settings.strafe === "off" ? "intelligent" : settings.strafe;
  options.critConfig.enabled = settings.criticals !== "off";
  options.critConfig.mode = settings.criticals === "off" ? "hop" : settings.criticals;
  options.critConfig.reaction.enabled =
    settings.meleeSkill >= 70 && !bot.supportFeature("doesntHaveOffHandSlot");
  options.tapConfig.enabled = settings.sprintTap !== "off";
  options.tapConfig.mode = settings.sprintTap === "off" ? "wtap" : settings.sprintTap;
  options.shieldConfig.enabled = settings.shield && !bot.supportFeature("doesntHaveOffHandSlot");
  options.shieldDisableConfig.enabled =
    settings.shieldBreak && !bot.supportFeature("doesntHaveOffHandSlot");
  options.rotateConfig.smooth = settings.smoothAim;
  options.rotateConfig.lookAtHidden = false;
  // These upstream callbacks were registered as function references. Replace
  // the listeners too, so their normal shield/rotation logic yields to defense.
  for (const name of ["update", "checkForShield"]) {
    const update = bot.swordpvp[name];
    bot.off("physicsTick", update);
    bot.swordpvp[name] = (...args) => {
      if (!bot.launcherDefendingBow) return update(...args);
    };
    bot.on("physicsTick", bot.swordpvp[name]);
  }
  bot.swordpvp.weaponOfChoice = settings.weapon;
  // Upstream visibility only raycasts along the current view, while rotation
  // refuses hidden targets. Use line of sight to let it turn toward a new target.
  bot.swordpvp.checkVisibility = () => {
    bot.swordpvp.wasVisible = canSeeTarget(bot, bot.swordpvp.target);
  };
  bot.swordpvp.rotate = () => rotateTowardTarget(bot.swordpvp.target);
  // Recreate the legacy CPS timing solver after applying the chosen CPS.
  if (bot.supportFeature("doesntHaveOffHandSlot")) {
    bot.swordpvp.meleeAttackRate = new bot.swordpvp.meleeAttackRate.constructor(bot, settings.cps);
  }
  const customTiming = bot.swordpvp.meleeAttackRate.getTicks.bind(bot.swordpvp.meleeAttackRate);
  bot.swordpvp.meleeAttackRate.getTicks = (...args) =>
    Math.max(customTiming(...args), Math.ceil(20 / settings.cps));
  const customAttempt = bot.swordpvp.attemptAttack.bind(bot.swordpvp);
  bot.swordpvp.attemptAttack = (reason) => {
    if (bot.launcherDefendingBow) return Promise.resolve();
    if (!aimedAt(bot.swordpvp.target)) return Promise.resolve();
    if (Math.random() * 100 >= settings.meleeSkill) {
      bot.swordpvp.ticksToNextAttack = 1;
      return Promise.resolve();
    }
    return customAttempt(reason);
  };
  bot.pvp.attackRange = settings.attackRange;
  bot.pvp.followRange = Math.max(1, settings.attackRange - 0.5);
  bot.pvp.viewDistance = settings.targetRange;
  bot.pvp.movements = undefined;
  // The old plugin waits for classic path_stop for five seconds. Our planner
  // has a different lifecycle; forceStop cancels its goal immediately.
  bot.pvp.stop = async () => bot.pvp.forceStop();
  const hasShield = bot.pvp.hasShield.bind(bot.pvp);
  bot.pvp.hasShield = () => settings.shield && hasShield();
  const attempt = bot.pvp.attemptAttack.bind(bot.pvp);
  const update = bot.pvp.update.bind(bot.pvp);
  bot.pvp.update = () => {
    if (bot.launcherDefendingBow) return;
    rotateTowardTarget(bot.pvp.target);
    update();
  };
  bot.pvp.attemptAttack = () => {
    if (!bot.pvp.target || Math.random() * 100 >= settings.meleeSkill || !aimedAt(bot.pvp.target)) {
      bot.pvp.timeToNextAttack = 1;
      return;
    }
    attempt();
  };
  const timing = bot.pvp.meleeAttackRate.getTicks.bind(bot.pvp.meleeAttackRate);
  bot.pvp.meleeAttackRate.getTicks = (...args) =>
    Math.max(timing(...args), Math.ceil(20 / settings.cps));
}

const HOSTILES = new Set([
  "zombie",
  "husk",
  "drowned",
  "skeleton",
  "stray",
  "bogged",
  "wither_skeleton",
  "spider",
  "cave_spider",
  "creeper",
  "witch",
  "pillager",
  "vindicator",
  "evoker",
  "ravager",
  "phantom",
  "silverfish",
  "endermite",
  "blaze",
  "ghast",
  "slime",
  "magma_cube",
  "piglin_brute",
  "breeze",
  "wither",
  "ender_dragon",
]);

function createCombatController(
  bot,
  value,
  {
    isOwner = () => false,
    onStatus = () => {},
    onError = () => {},
    now = Date.now,
    random = Math.random,
    loadPlugins = true,
  } = {},
) {
  const settings = normalizeCombat(value);
  installCombatNavigation(bot, onError);
  if (loadPlugins) configureCombatPlugins(bot, settings, onError);
  let target = null;
  let mode = null;
  let requestedStyle = settings.style;
  let generation = 0;
  let pending = false;
  let nextActionAt = 0;
  let chargeAt = null;
  let nextShotAt = 0;
  let lastPlanAt = 0;
  let plan = null;
  let aimOffset = [0, 0];
  let autoEnabled = settings.autoTarget === "hostile";
  let suspended = false;
  let disposed = false;
  let prepareTask = Promise.resolve();
  let actionTask = Promise.resolve();
  const crystals = createCrystalPlanner(bot, settings, isOwner);
  const defense = createBowDefense(bot, settings, {
    now,
    onStatus,
    onError,
    beforeDefend() {
      generation++;
      pending = false;
      stopEngines();
      bot.launcherPauseTravelForDefense?.();
      bot.clearControlStates();
      return bot.pathfinder.stop();
    },
    afterDefend() {
      bot.launcherResumeTravelAfterDefense?.();
    },
  });
  let nextCrystalAt = 0;
  let nextCrystalStatusAt = 0;

  function distance(entity) {
    return bot.entity.position.distanceTo(entity.position);
  }
  function allowed(entity) {
    return (
      entity &&
      entity !== bot.entity &&
      entity.id !== bot.entity.id &&
      entity.isValid !== false &&
      entity.position &&
      (!entity.username || entity.username.toLowerCase() !== bot.username.toLowerCase())
    );
  }
  function stopEngines() {
    if (bot.swordpvp?.target) bot.swordpvp.stop();
    if (bot.pvp?.target) bot.pvp.forceStop();
    // The locked smooth-look package exposes task cleanup; stop its tween too
    // so a cancelled combat turn cannot override navigation or bow cancellation.
    bot.smoothLook?._cleanupTasks(true);
    if (bot.smoothLook) bot.smoothLook._pendingTask = null;
    // Cancelling a draw releases an arrow in Minecraft. Turn into the ground
    // first so stop/death/target loss never sends a final arrow at the target.
    if (chargeAt !== null) {
      void bot.look(bot.entity.yaw, -Math.PI / 2, true).catch(onError);
      flushBowLook(bot.entity.yaw, -Math.PI / 2);
      bot.deactivateItem();
    } else if (bot.usingHeldItem) {
      bot.deactivateItem();
    }
    chargeAt = null;
    mode = null;
    plan = null;
  }
  function flushBowLook(yaw, pitch) {
    // force=true updates local rotation; Mineflayer sends it on the next tick.
    // Send the normal look packet before releasing use so the server uses the
    // current aim, including the downward aim when a charged shot is cancelled.
    if (bot._client?.state !== "play") return;
    bot._client.write("look", combatLookPacket(bot, yaw, pitch));
  }
  function stop(suspendAuto = true) {
    generation++;
    defense.stop();
    crystals.clear();
    if (target) bot.tracker?.stopTrackingEntity(target);
    target = null;
    pending = false;
    suspended = suspendAuto;
    stopEngines();
    void bot.pathfinder.stop();
    bot.clearControlStates();
  }
  function select(entity, style = settings.style) {
    if (!settings.enabled) throw new Error("PvP is disabled in extension settings");
    if (!allowed(entity)) throw new Error("Target is missing or is the bot itself");
    if (style === "crystal" && !settings.crystalEnabled)
      throw new Error("Auto Crystal is disabled in extension settings");
    const maxRange =
      style === "melee" ? settings.targetRange : Math.max(settings.targetRange, settings.bowRange);
    if (distance(entity) > maxRange) throw new Error("Target is too far away");
    stop(false);
    target = entity;
    requestedStyle = style;
    nextActionAt = now() + settings.reactionMs;
    nextShotAt = now();
    onStatus(`combat target: ${entity.username || entity.name || entity.id}; ${style}`);
  }
  function hasBow() {
    const items = carriedItems(bot);
    return (
      settings.bowEnabled &&
      items.some((item) => item.name === "bow") &&
      items.some((item) => ["arrow", "spectral_arrow", "tipped_arrow"].includes(item.name))
    );
  }
  function chooseMode() {
    const hasCrystals =
      settings.crystalPlace && carriedItems(bot).some((item) => item.name === "end_crystal");
    const crystalAvailable = settings.crystalEnabled && (settings.crystalBreak || hasCrystals);
    if (requestedStyle === "crystal")
      return crystalAvailable ? "crystal" : settings.meleeFallback ? "melee" : null;
    // Approach with the crystal controller from the start. Starting melee while
    // a base is out of reach adds strafing/criticals before the first placement.
    if (requestedStyle === "auto" && crystalAvailable && (hasCrystals || crystals.active))
      return "crystal";
    if (
      requestedStyle === "auto" &&
      crystalAvailable &&
      distance(target) <= 10 &&
      crystals.plan(target, now())
    )
      return "crystal";
    const ranged = hasBow() && distance(target) <= settings.bowRange;
    if (requestedStyle === "melee") return "melee";
    if (requestedStyle === "ranged")
      return ranged ? "ranged" : settings.meleeFallback ? "melee" : null;
    return ranged && distance(target) > settings.attackRange + 2 ? "ranged" : "melee";
  }
  async function prepare(nextMode) {
    const revision = ++generation;
    pending = true;
    const previous = prepareTask;
    let release;
    prepareTask = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (revision !== generation || !target) return;
      stopEngines();
      await bot.pathfinder.stop();
      if (revision !== generation || !target) return;
      bot.clearControlStates();
      const items = carriedItems(bot);
      const current = () => revision === generation && target && !bot.launcherDefendingBow;
      if (nextMode === "ranged") {
        const hand =
          settings.bowOffhand && !bot.supportFeature("doesntHaveOffHandSlot") ? "off-hand" : "hand";
        await equipCombatItem(
          bot,
          items.find((item) => item.name === "bow"),
          hand,
          current,
        );
      } else if (nextMode === "melee") {
        const tier = ["netherite", "diamond", "iron", "stone", "golden", "wooden"];
        const weapons = items.filter((item) => item.name.endsWith(`_${settings.weapon}`));
        weapons.sort(
          (a, b) => tier.indexOf(a.name.split("_")[0]) - tier.indexOf(b.name.split("_")[0]),
        );
        if (weapons[0]) await equipCombatItem(bot, weapons[0], "hand", current);
        const shield = items.find((item) => item.name === "shield");
        if (settings.shield && shield && !bot.supportFeature("doesntHaveOffHandSlot"))
          await equipCombatItem(bot, shield, "off-hand", current);
      } else if (nextMode === "crystal") {
        const crystal = items.find((item) => item.name === "end_crystal");
        if (settings.crystalPlace && crystal) await equipCombatItem(bot, crystal, "hand", current);
      }
      if (revision !== generation || !target) return;
      mode = nextMode;
      if (mode === "melee") {
        const engine = settings.engine === "custom" ? bot.swordpvp : bot.pvp;
        await engine.attack(target);
        if (revision !== generation) {
          if (settings.engine === "custom") engine.stop();
          else engine.forceStop();
        }
      } else if (mode === "ranged") {
        bot.tracker?.trackEntity(target);
      } else if (mode === "crystal") {
        bot.tracker?.trackEntity(target);
        nextCrystalAt = now();
      }
      if (revision === generation) pending = false;
    } finally {
      release();
    }
  }
  function shotPlan() {
    const velocity = settings.bowPredict
      ? bot.tracker?.getEntitySpeed(target)?.clone() || new Vec3(0, 0, 0)
      : new Vec3(0, 0, 0);
    if (settings.bowEngine === "hawkeye") {
      const shot = bot.hawkEye.getMasterGrade(target, velocity, "bow");
      return shot && !shot.blockInTrayect ? shot : null;
    }
    const shot = bot.bowpvp.shotToEntity(target, velocity);
    return shot?.hit ? shot : null;
  }
  async function updateBow() {
    const time = now();
    if (!hasBow()) {
      if (settings.meleeFallback) nextActionAt = 0;
      else {
        stop(true);
        onStatus("bow stopped: no bow or arrows");
      }
      return;
    }
    if (time - lastPlanAt >= 200 || !plan) {
      plan = shotPlan();
      lastPlanAt = time;
    }
    if (!plan || !canSeeTarget(bot, target)) return;
    if (chargeAt === null) {
      if (time < nextShotAt) return;
      const spread = (1 - settings.bowAccuracy / 100) * 0.12;
      aimOffset = [(random() - 0.5) * spread, (random() - 0.5) * spread];
      chargeAt = time;
      bot.activateItem(settings.bowOffhand && !bot.supportFeature("doesntHaveOffHandSlot"));
    }
    const revision = generation;
    const look =
      settings.smoothAim && bot.smoothLook
        ? bot.smoothLook.look.bind(bot.smoothLook)
        : bot.look.bind(bot);
    await look(plan.yaw + aimOffset[0], plan.pitch + aimOffset[1], true);
    if (revision !== generation || mode !== "ranged") return;
    if (time - chargeAt >= 1200) {
      flushBowLook(plan.yaw + aimOffset[0], plan.pitch + aimOffset[1]);
      bot.deactivateItem();
      chargeAt = null;
      nextShotAt = time + Math.max(0, settings.bowIntervalMs - 1200);
      onStatus(`bow shot: ${target.username || target.name}; ${settings.bowEngine}`);
    }
  }
  async function updateCrystal() {
    if (now() < nextCrystalAt) return;
    nextCrystalAt = now() + settings.crystalIntervalMs;
    const rev = generation,
      enemy = target;
    const action = crystals.plan(enemy, now());
    if (!action) {
      if (now() >= nextCrystalStatusAt) {
        onStatus(`crystal waiting: ${crystals.reason}`);
        nextCrystalStatusAt = now() + 2000;
      }
      // Stay still while the server confirms the current build/place/break cycle.
      if (crystals.active || distance(enemy) <= settings.crystalPlaceRange) {
        await bot.pathfinder.stop();
        if (rev === generation && target === enemy) bot.clearControlStates();
      } else {
        const range = Math.max(1, Math.min(3, settings.crystalPlaceRange - 0.5));
        bot.pathfinder.setGoal({ entity: enemy, rangeSq: range * range });
      }
      return;
    }
    await bot.pathfinder.stop();
    if (rev !== generation || target !== enemy) return;
    bot.clearControlStates();
    if (action.type !== "break") {
      const item =
        action.type === "place"
          ? carriedItems(bot).find((item) => item.name === "end_crystal")
          : action.item;
      if (!item) return;
      await equipCombatItem(
        bot,
        item,
        "hand",
        () => rev === generation && target === enemy && !bot.launcherDefendingBow,
      );
    }
    if (rev !== generation || target !== enemy) return;
    await (settings.smoothAim && bot.smoothLook && !settings.crystalFastAim
      ? aimCrystal(action.aim, () => rev === generation && target === enemy)
      : bot.lookAt(action.aim, true));
    if (rev !== generation || target !== enemy) return;
    // Recheck cover, target motion, owner positions and health after asynchronous aiming.
    const verified = crystals.verify(enemy, action, now());
    if (!verified) return;
    flushBowLook(bot.entity.yaw, bot.entity.pitch);
    crystals.commit(verified, now());
    if (verified.type === "break") bot.attack(verified.crystal);
    else if (verified.type === "place")
      await bot._genericPlace(verified.base, verified.face, {
        forceLook: "ignore",
        swingArm: "right",
        delta: verified.aim.minus(verified.base.position),
      });
    else
      await bot._placeBlockWithOptions(verified.reference, verified.face, {
        forceLook: "ignore",
        swingArm: "right",
        delta: verified.aim.minus(verified.reference.position),
      });
    if (rev === generation)
      onStatus(
        `crystal ${verified.type}: damage ${verified.damage.toFixed(1)}; self ${verified.selfDamage.toFixed(1)}`,
      );
  }
  async function aimCrystal(point, current) {
    // SmoothLook can finish synchronously before registering its promise handlers.
    // Never await that promise: allow a short smooth turn, then publish exact aim.
    void bot.smoothLook.lookAt(point, true).catch(onError);
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!current()) return;
    bot.smoothLook._cleanupTasks(true);
    bot.smoothLook._pendingTask = null;
    await bot.lookAt(point, true);
  }
  let bowBusy = false;
  function tick() {
    if (disposed || !settings.enabled || !bot.entity?.position || bot.health <= 0) return;
    try {
      if (defense.tick(true) || suspended) return;
      if (!target && autoEnabled && now() >= nextActionAt) {
        const entity = bot.nearestEntity(
          (entity) =>
            allowed(entity) &&
            !isOwner(entity.username) &&
            HOSTILES.has(entity.name) &&
            distance(entity) <= settings.targetRange &&
            canSeeTarget(bot, entity),
        );
        if (entity) select(entity);
        else nextActionAt = now() + 500;
      }
      if (!target) return;
      const maxRange =
        requestedStyle === "melee"
          ? settings.targetRange
          : Math.max(settings.targetRange, settings.bowRange);
      if (!allowed(target) || distance(target) > maxRange) {
        stop(false);
        return;
      }
      if (pending || bowBusy || now() < nextActionAt) return;
      const nextMode = chooseMode();
      if (!nextMode) {
        stop(true);
        onStatus("bow stopped: no bow or arrows");
        return;
      }
      if (nextMode !== mode) {
        const revision = generation + 1;
        void prepare(nextMode).catch((error) => {
          if (revision === generation) {
            stop(true);
            onError(error);
          }
        });
      } else if ((mode === "ranged" || mode === "crystal") && !bowBusy) {
        bowBusy = true;
        const revision = generation;
        actionTask = (mode === "crystal" ? updateCrystal() : updateBow())
          .catch((error) => {
            if (revision === generation) {
              stop(true);
              onError(error);
            }
          })
          .finally(() => {
            bowBusy = false;
          });
      } else if (
        mode === "melee" &&
        !(settings.engine === "custom" ? bot.swordpvp.target : bot.pvp.target)
      ) {
        stop(false);
      }
    } catch (error) {
      stop(true);
      onError(error);
    }
  }
  function removed(entity) {
    if (entity === target) {
      bot.tracker?.stopTrackingEntity(entity);
      stop(false);
      nextActionAt = now() + settings.reactionMs;
      onStatus("combat target lost");
    }
  }
  bot.on("physicsTick", tick);
  bot.on("entityGone", removed);
  bot.on("entityDead", removed);
  const died = () => stop(true);
  bot.on("death", died);
  return {
    select,
    stop,
    get idleTask() {
      return Promise.all([prepareTask, actionTask, defense.task]);
    },
    findTarget(query) {
      const name = String(query).trim().toLowerCase();
      if (name === bot.username.toLowerCase()) throw new Error("The bot cannot attack itself");
      return bot.nearestEntity(
        (entity) =>
          allowed(entity) &&
          (name === "nearest"
            ? HOSTILES.has(entity.name) &&
              distance(entity) <= Math.max(settings.targetRange, settings.bowRange) &&
              canSeeTarget(bot, entity)
            : (entity.username || entity.name || "").toLowerCase() === name),
      );
    },
    auto(enabled) {
      if (enabled && !settings.enabled) throw new Error("PvP is disabled in extension settings");
      stop(!enabled);
      autoEnabled = enabled;
      nextActionAt = now() + settings.reactionMs;
    },
    get status() {
      return target
        ? `${mode || "preparing"} ${target.username || target.name || target.id}`
        : autoEnabled && !suspended
          ? "hostile mobs"
          : defense.threat
            ? `bow threat ${defense.threat.username || defense.threat.name}`
            : "idle";
    },
    dispose() {
      disposed = true;
      stop(true);
      defense.dispose();
      bot.removeListener("physicsTick", tick);
      bot.removeListener("entityGone", removed);
      bot.removeListener("entityDead", removed);
      bot.removeListener("death", died);
    },
  };
}

module.exports = {
  canSeeTarget,
  installCombatProtocol,
  normalizeCombat,
  configureCombatPlugins,
  installCombatNavigation,
  createCombatController,
};
