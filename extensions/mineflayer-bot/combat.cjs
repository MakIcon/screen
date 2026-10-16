const defaults = require("./combat-defaults.json");
const { Vec3 } = require("vec3");
const { toNotchianYaw, toNotchianPitch } = require("mineflayer/lib/conversions");
const { goals } = require("./pathfinder.cjs");
const { createCrystalPlanner, isCrystal } = require("./crystals.cjs");
const { createCrystalMovement, groundAt, walkSegment } = require("./crystal-movement.cjs");
const { createCombatBrain, crystalOpportunity, observedHealth } = require("./combat-brain.cjs");
const { createCombatFootwork } = require("./combat-footwork.cjs");
const { createBowDefense } = require("./bow-defense.cjs");
const {
  carriedItems,
  bestMeleeWeapon,
  equipCombatItem,
  meleeCooldownTicks,
} = require("./combat-inventory.cjs");
const { installArmorManager } = require("./armor-manager.cjs");
const { installShieldBreak, targetBlocking } = require("./melee-shield.cjs");
const { createMaceCombat } = require("./mace.cjs");
const { pearlOrigin, simulatePearlFlight } = require("./pearls.cjs");

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
    weapon: ["sword", "axe", "mace"],
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
function installCombatNavigation(bot, onError, now = Date.now) {
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
    let updatedAt = now();
    nativeGoal.hasChanged = (_event, entity) => {
      if (entity !== goal.entity) return false;
      const drift = entity.position.distanceTo(new Vec3(nativeGoal.x, nativeGoal.y, nativeGoal.z));
      const remaining = bot.entity.position.distanceTo(entity.position);
      // Preserve useful route segments while a distant opponent runs. Near the
      // attack radius (or after a teleport), retarget immediately.
      const close = remaining <= range + 2;
      if (drift < (close ? 0.5 : Math.min(4, Math.max(2, remaining / 4)))) return false;
      if (!close && drift < 8 && now() - updatedAt < 600) return false;
      updatedAt = now();
      return true;
    };
    void pathfinder.goto(nativeGoal, { preferExistingTerrain: true }).catch((error) => {
      if (revision === generation) {
        follow = null;
        pathfinder.goal = null;
        if (bot.swordpvp) bot.swordpvp.targetGoal = undefined;
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
  installArmorManager(bot, onError);
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

  function rotateTowardTarget(target, exact = false) {
    if (bot.launcherDefendingBow || !target || !canSeeTarget(bot, target)) return Promise.resolve();
    const eyes = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0);
    const point = target.position.offset(
      0,
      Math.max(0.15, Math.min((target.height ?? 1.8) - 0.15, eyes.y - target.position.y)),
      0,
    );
    const delta = point.minus(eyes);
    const horizontal = Math.hypot(delta.x, delta.z);
    const yaw = horizontal < 0.05 ? bot.entity.yaw : Math.atan2(-delta.x, -delta.z);
    const turn = Math.atan2(Math.sin(yaw - bot.entity.yaw), Math.cos(yaw - bot.entity.yaw));
    const pitch = Math.atan2(delta.y, horizontal);
    const limit =
      settings.smoothAim && !exact ? (0.65 * settings.smoothAimSpeed) / 100 : Math.PI * 2;
    const clamp = (angle) => Math.max(-limit, Math.min(limit, angle));
    // Melee updates from the live view once per tick. No queued tween may
    // continue from an old angle after navigation, shield use or a target turn.
    bot.smoothLook._cleanupTasks(true);
    bot.smoothLook._pendingTask = null;
    const rotation = bot.look(
      bot.entity.yaw + clamp(turn),
      bot.entity.pitch + clamp(pitch - bot.entity.pitch),
      true,
    );
    void rotation.catch(onError);
    return rotation;
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
  const viewDistance = Math.max(
    settings.targetRange,
    settings.bowRange,
    settings.pearlChase ? settings.pearlMaxDistance : 0,
  );
  options.genericConfig.viewDistance = viewDistance;
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
    !settings.adaptiveCombat &&
    settings.meleeSkill >= 70 &&
    !bot.supportFeature("doesntHaveOffHandSlot");
  if (settings.adaptiveCombat) {
    options.onHitConfig.enabled = false;
    options.onHitConfig.kbCancel.enabled = false;
  }
  options.tapConfig.enabled = settings.sprintTap !== "off";
  options.tapConfig.mode = settings.sprintTap === "off" ? "wtap" : settings.sprintTap;
  options.shieldConfig.enabled = settings.shield && !bot.supportFeature("doesntHaveOffHandSlot");
  options.shieldDisableConfig.enabled =
    settings.shieldBreak && !bot.supportFeature("doesntHaveOffHandSlot");
  options.rotateConfig.smooth = settings.smoothAim;
  options.rotateConfig.lookAtHidden = false;
  // These upstream callbacks were registered as function references. Replace
  // the listeners too, so their normal shield/rotation logic yields to defense.
  for (const name of ["update"]) {
    const update = bot.swordpvp[name];
    bot.off("physicsTick", update);
    bot.swordpvp[name] = (...args) => {
      if (!bot.launcherDefendingBow && !bot.launcherSurvival?.busy) return update(...args);
    };
    bot.on("physicsTick", bot.swordpvp[name]);
  }
  bot.swordpvp.weaponOfChoice = settings.weapon === "mace" ? "sword" : settings.weapon;
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
    Math.max(customTiming(...args), meleeCooldownTicks(bot, args[0]), Math.ceil(20 / settings.cps));
  const customAttempt = bot.swordpvp.attemptAttack.bind(bot.swordpvp);
  bot.swordpvp.attemptAttack = (reason) => {
    if (bot.launcherDefendingBow || bot.launcherSurvival?.busy) return Promise.resolve();
    if (bot.launcherAxeAttacking && !["disableshield", "axecritical"].includes(reason))
      return Promise.resolve();
    if (reason === "normal" && targetBlocking(bot, bot.swordpvp.target)) return Promise.resolve();
    if (!aimedAt(bot.swordpvp.target)) return Promise.resolve();
    if (settings.adaptiveCombat && bot.swordpvp.ticksToNextAttack > 0) return Promise.resolve();
    if (Math.random() * 100 >= settings.meleeSkill) {
      bot.swordpvp.ticksToNextAttack = 1;
      return Promise.resolve();
    }
    return customAttempt(reason);
  };
  installShieldBreak(bot, settings, aimedAt, onError, rotateTowardTarget);
  bot.pvp.attackRange = settings.attackRange;
  bot.pvp.followRange = Math.max(1, settings.attackRange - 0.5);
  bot.pvp.viewDistance = viewDistance;
  bot.pvp.movements = undefined;
  // The old plugin waits for classic path_stop for five seconds. Our planner
  // has a different lifecycle; forceStop cancels its goal immediately.
  bot.pvp.stop = async () => bot.pvp.forceStop();
  const hasShield = bot.pvp.hasShield.bind(bot.pvp);
  bot.pvp.hasShield = () => settings.shield && hasShield();
  const attempt = bot.pvp.attemptAttack.bind(bot.pvp);
  const update = bot.pvp.update.bind(bot.pvp);
  bot.pvp.update = () => {
    if (bot.launcherDefendingBow || bot.launcherSurvival?.busy) return;
    rotateTowardTarget(bot.pvp.target);
    update();
  };
  bot.pvp.attemptAttack = () => {
    if (bot.launcherSurvival?.busy) return;
    if (!bot.pvp.target || Math.random() * 100 >= settings.meleeSkill || !aimedAt(bot.pvp.target)) {
      bot.pvp.timeToNextAttack = 1;
      return;
    }
    attempt();
  };
  const timing = bot.pvp.meleeAttackRate.getTicks.bind(bot.pvp.meleeAttackRate);
  bot.pvp.meleeAttackRate.getTicks = (...args) =>
    Math.max(timing(...args), meleeCooldownTicks(bot), Math.ceil(20 / settings.cps));
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
  "warden",
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
  installCombatNavigation(bot, onError, now);
  if (loadPlugins) configureCombatPlugins(bot, settings, onError);
  let target = null;
  let workTarget = false;
  let workSuspended = false;
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
  let pursuit = null;
  let pearlIntent = null;
  let lastEnemyPosition = null;
  let nextPursuitPlanAt = 0;
  let nextClosingPlanAt = 0;
  let recovery = null,
    decision = null,
    recoveryMoving = false;
  const brain = createCombatBrain(bot, settings, { now });
  const footwork = createCombatFootwork(bot, settings, { now, onError });
  const recoveryMovement = createCrystalMovement(bot, { now });
  const nativeMove = bot.swordpvp?.doMove?.bind(bot.swordpvp);
  const nativeStrafe = bot.swordpvp?.doStrafe?.bind(bot.swordpvp);
  const nativeTap = bot.swordpvp?.sprintTap?.bind(bot.swordpvp);
  const nativeCritical = bot.swordpvp?.causeCritical?.bind(bot.swordpvp);
  const nativeRotate = bot.swordpvp?.rotate?.bind(bot.swordpvp);
  let directFootwork = false;
  if (settings.adaptiveCombat && nativeMove) {
    bot.swordpvp.doMove = () => {
      if (!bot.swordpvp.target) return nativeMove();
      directFootwork = footwork.tick(bot.swordpvp.target, decision);
      if (!directFootwork) {
        const routing = Boolean(bot.pathfinder.goal);
        // Even at melee distance a wall or ledge still needs a terrain route.
        bot.pathfinder.setGoal({ entity: bot.swordpvp.target, rangeSq: 2 ** 2 });
        if (!routing) {
          bot.smoothLook?._cleanupTasks(true);
          if (bot.smoothLook) bot.smoothLook._pendingTask = null;
        }
      }
    };
    bot.swordpvp.doStrafe = () => {
      // Navigation owns all movement outside a checked combat corridor.
      if (!directFootwork && !bot.pathfinder.goal) return nativeStrafe();
    };
    bot.swordpvp.sprintTap = () =>
      directFootwork || bot.pathfinder.goal ? Promise.resolve() : nativeTap();
    bot.swordpvp.causeCritical = () =>
      decision?.action === "finish" || bot.pathfinder.goal
        ? Promise.resolve(false)
        : nativeCritical();
    if (nativeRotate)
      bot.swordpvp.rotate = () => {
        if (!bot.pathfinder.goal) return nativeRotate();
      };
    bot.swordpvp.on("attackedTarget", footwork.attacked);
  }
  const mace = createMaceCombat(bot, settings, { now, random, onStatus, onError });
  let crystalProbeAt = -Infinity,
    crystalProbe = null,
    crystalStalledAt = null;
  const crystals = createCrystalPlanner(bot, settings, isOwner, {
    scoreAction: (action) =>
      settings.adaptiveCombat && requestedStyle === "auto" && decision
        ? crystalOpportunity(decision, action, settings).score
        : 0,
  });
  const crystalMovement = createCrystalMovement(bot, { now });
  const defense = createBowDefense(bot, settings, {
    now,
    onStatus,
    onError,
    enabled: () =>
      (settings.enabled && (settings.bowDefense || settings.maceDefense)) ||
      Boolean(bot.launcherGathering?.protecting && bot.launcherGathering.settings.defendArrows),
    bowEnabled: () =>
      (settings.enabled && settings.bowDefense) ||
      Boolean(bot.launcherGathering?.protecting && bot.launcherGathering.settings.defendArrows),
    beforeDefend() {
      generation++;
      pending = false;
      stopEngines();
      recoveryMovement.cancel();
      recovery = null;
      bot.launcherPauseTravelForDefense?.();
      bot.launcherGathering?.pauseForDefense();
      bot.clearControlStates();
      return Promise.all([
        bot.pathfinder.stop(),
        crystalMovement.task,
        bot.launcherGathering?.task,
      ]);
    },
    afterDefend() {
      bot.launcherResumeTravelAfterDefense?.();
      bot.launcherGathering?.resumeAfterSurvival();
    },
  });
  let nextCrystalAt = 0;
  let nextCrystalStatusAt = 0;
  let nextCrystalPlanAt = 0;
  let crystalReposition = null;
  let crystalPressureUntil = 0;

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
    directFootwork = false;
    footwork.reset();
    mace.stop();
    crystalMovement.cancel();
    crystalReposition = null;
    nextCrystalPlanAt = 0;
    if (bot.swordpvp?.target) bot.swordpvp.stop();
    if (bot.pvp?.target) bot.pvp.forceStop();
    // The locked smooth-look package exposes task cleanup; stop its tween too
    // so a cancelled combat turn cannot override navigation or item cancellation.
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
    suspended = suspendAuto || (workTarget && workSuspended);
    workTarget = false;
    generation++;
    recovery = null;
    decision = null;
    crystalProbe = null;
    crystalProbeAt = -Infinity;
    crystalStalledAt = null;
    brain.reset();
    recoveryMovement.cancel();
    bot.launcherSurvival?.cancelCombatHeal?.();
    defense.stop();
    crystals.clear();
    pursuit = null;
    pearlIntent = null;
    lastEnemyPosition = null;
    nextClosingPlanAt = 0;
    bot.launcherTravel?.stopChase();
    if (target) bot.tracker?.stopTrackingEntity(target);
    target = null;
    pending = false;
    stopEngines();
    void bot.pathfinder.stop();
    bot.clearControlStates();
  }
  function select(entity, style = settings.style, forWork = false) {
    if (!settings.enabled && !forWork) throw new Error("PvP is disabled in extension settings");
    if (!allowed(entity)) throw new Error("Target is missing or is the bot itself");
    if (style === "crystal" && !settings.crystalEnabled)
      throw new Error("Auto Crystal is disabled in extension settings");
    const maxRange = combatRange(style, forWork);
    if (distance(entity) > maxRange) throw new Error("Target is too far away");
    const previousSuspended = suspended;
    stop(false);
    suspended = false;
    workTarget = forWork;
    workSuspended = previousSuspended;
    target = entity;
    lastEnemyPosition = entity.position.clone();
    observePearlHand(entity);
    requestedStyle = style;
    nextActionAt = now() + settings.reactionMs;
    nextShotAt = now();
    onStatus(`combat target: ${entity.username || entity.name || entity.id}; ${style}`);
  }
  function combatRange(style = requestedStyle, forWork = workTarget) {
    const range = forWork
      ? Math.max(12, settings.targetRange)
      : style === "melee"
        ? settings.targetRange
        : Math.max(settings.targetRange, settings.bowRange);
    return !forWork && settings.pearlChase ? Math.max(range, settings.pearlMaxDistance) : range;
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
    // Finish an airborne sequence before distance-based bow/crystal selection.
    if (mode === "mace" && mace.airborne) return "mace";
    if (mode === "melee" && bot.launcherAxeAttacking) return "melee";
    const meleeMode = () => {
      if (workTarget) return "melee";
      const autoMace =
        settings.adaptiveCombat &&
        requestedStyle === "auto" &&
        decision?.mace &&
        decision.wind &&
        decision.health >= 12 &&
        decision.distance <= 8 &&
        mace.canLaunch() &&
        !["finish", "punish", "break_shield"].includes(decision.action);
      if ((!autoMace && settings.weapon !== "mace") || !mace.available()) return "melee";
      const axe = carriedItems(bot).some((item) => item.name.endsWith("_axe"));
      return settings.engine === "custom" &&
        settings.shieldBreak &&
        axe &&
        (bot.entity.onGround || mode === "melee") &&
        targetBlocking(bot, target)
        ? "melee"
        : "mace";
    };
    const hasCrystals =
      settings.crystalPlace && carriedItems(bot).some((item) => item.name === "end_crystal");
    const crystalAvailable = settings.crystalEnabled && (settings.crystalBreak || hasCrystals);
    if (requestedStyle === "crystal")
      return crystalAvailable ? "crystal" : settings.meleeFallback ? meleeMode() : null;
    if (settings.adaptiveCombat && requestedStyle === "auto" && crystalAvailable) {
      const action = probeCrystal();
      const opportunity = crystalOpportunity(decision, action, settings);
      if (decision)
        decision.crystal = {
          ...opportunity,
          action: action?.type,
          damage: action?.damage,
          selfDamage: action?.selfDamage,
        };
      if (opportunity.use || crystals.waiting) {
        crystalStalledAt = null;
        if (decision) {
          decision.action = crystals.waiting
            ? "crystal_confirm"
            : action.finish
              ? "crystal_finish"
              : "crystal_burst";
          decision.reason = crystals.waiting ? "wait for server confirmation" : opportunity.reason;
        }
        return "crystal";
      }
      if (crystals.finishing) {
        crystalStalledAt ??= now();
        if (now() - crystalStalledAt < 1200) return "crystal";
      } else crystalStalledAt = null;
    }
    // Approach with the crystal controller from the start. Starting melee while
    // a base is out of reach adds strafing/criticals before the first placement.
    if (
      !settings.adaptiveCombat &&
      requestedStyle === "auto" &&
      crystalAvailable &&
      (hasCrystals || crystals.active)
    )
      return "crystal";
    if (
      requestedStyle === "auto" &&
      !settings.adaptiveCombat &&
      crystalAvailable &&
      distance(target) <= 10 &&
      crystals.plan(target, now())
    )
      return "crystal";
    const ranged = hasBow() && distance(target) <= settings.bowRange;
    if (requestedStyle === "melee") return meleeMode();
    if (requestedStyle === "ranged")
      return ranged ? "ranged" : settings.meleeFallback ? meleeMode() : null;
    if (meleeMode() === "mace" && distance(target) <= 8) return "mace";
    if (settings.adaptiveCombat) {
      // Keep pressure through short retreats and punish item use. Separate enter
      // and exit distances avoid resetting equips/attack strength at the boundary.
      const bowDistance = mode === "ranged" ? 10 : 14;
      const push = ["finish", "punish"].includes(decision?.action) && distance(target) <= 18;
      return ranged && !push && distance(target) > bowDistance ? "ranged" : meleeMode();
    }
    return ranged && distance(target) > settings.attackRange + 2 ? "ranged" : meleeMode();
  }

  function probeCrystal() {
    if (now() < crystalProbeAt && !crystals.waiting && !crystals.finishing) return crystalProbe;
    const near = distance(target) <= 3.5 || now() < crystalPressureUntil;
    crystalProbeAt = now() + (near ? 150 : 300);
    crystalProbe = distance(target) <= 12 || crystals.active ? crystals.plan(target, now()) : null;
    return crystalProbe;
  }
  function invalidateCrystal() {
    crystalProbeAt = -Infinity;
    crystalProbe = null;
  }

  function recoveryPoint(range, pearl = false) {
    const from = bot.entity.position,
      away = from.minus(target.position);
    const length = Math.hypot(away.x, away.z) || 1;
    for (const angle of [0, 0.65, -0.65, 1.2, -1.2]) {
      const x = (away.x * Math.cos(angle) - away.z * Math.sin(angle)) / length;
      const z = (away.z * Math.cos(angle) + away.x * Math.sin(angle)) / length;
      const point = groundAt(bot, from.offset(x * range, 0, z * range));
      if (
        point &&
        point.distanceTo(target.position) >= distance(target) + range * 0.5 &&
        (pearl || walkSegment(bot, point, 0, range))
      )
        return point;
    }
    return null;
  }
  function recover() {
    if (!recovery && !["heal", "retreat", "escape"].includes(decision?.action)) return false;
    if (!recovery) {
      generation++;
      pending = false;
      stopEngines();
      crystals.clear();
      recovery = { target, until: now() + 2200, nextPlanAt: 0, waypoint: null, pearlTried: false };
      onStatus(`combat ${decision.action}: ${decision.reason}; hp ${bot.health}`);
    }
    const state = recovery;
    if (bot.launcherPearling) return true;
    if (!decision.heal || (bot.health > 14 && !decision.needsFood)) {
      recovery = null;
      recoveryMovement.cancel();
      brain.deferRecovery();
      return false;
    }
    if (decision.action === "escape" && !state.pearlTried) {
      state.pearlTried = true;
      const point = recoveryPoint(
        Math.min(settings.pearlMaxDistance, Math.max(12, settings.pearlMinDistance + 2)),
        true,
      );
      if (
        point &&
        bot.launcherTravel?.escape?.(
          () => point,
          () => target === state.target && recovery === state && !disposed,
          () => {
            state.until = now() + 1800;
            queueMicrotask(tick);
          },
        )
      ) {
        recoveryMovement.cancel();
        return true;
      }
    }
    if (decision.distance >= 6 || !decision.visible || (now() >= state.until && bot.health <= 7)) {
      const item = decision.heal;
      if (
        bot.launcherSurvival?.requestCombatHeal(
          item,
          () => target === state.target && !disposed,
          (succeeded) => brain.recovered(item, succeeded),
        )
      ) {
        recovery = null;
        recoveryMovement.cancel();
        return true;
      }
    }
    if (now() >= state.until) {
      recovery = null;
      recoveryMovement.cancel();
      brain.deferRecovery();
      return false;
    }
    if (now() >= state.nextPlanAt) {
      state.nextPlanAt = now() + 400;
      const point = recoveryPoint(4);
      if (point) state.waypoint = { position: point };
    }
    if (!state.waypoint) {
      recovery = null;
      recoveryMovement.cancel();
      brain.deferRecovery();
      return false;
    }
    if (state.waypoint && !recoveryMoving) {
      recoveryMoving = true;
      void recoveryMovement
        .setGoal(state.waypoint, 0.5, "heal retreat")
        .catch(onError)
        .finally(() => {
          recoveryMoving = false;
        });
    }
    return true;
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
      await Promise.all([bot.pathfinder.stop(), crystalMovement.task]);
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
      } else if (nextMode === "melee" || nextMode === "mace") {
        const weapon = bestMeleeWeapon(
          bot,
          nextMode === "melee" && settings.weapon === "mace" ? "sword" : settings.weapon,
        );
        if (weapon && nextMode !== "mace") await equipCombatItem(bot, weapon, "hand", current);
        const shield = items.find((item) => item.name === "shield");
        if (settings.shield && shield && !bot.supportFeature("doesntHaveOffHandSlot"))
          await equipCombatItem(bot, shield, "off-hand", current);
      }
      if (revision !== generation || !target) return;
      mode = nextMode;
      if (mode === "mace") {
        bot.tracker?.trackEntity(target);
        mace.start(target);
      } else if (mode === "melee") {
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
      // Start the selected sequence immediately; the action itself still waits
      // for item swaps, cooldowns and server confirmation.
      if (revision === generation && mode === "crystal") {
        bowBusy = true;
        actionTask = updateCrystal().finally(() => {
          bowBusy = false;
        });
        await actionTask;
      } else if (revision === generation && mode === "mace") mace.tick();
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
    if (now() < nextCrystalPlanAt && !crystals.waiting && !crystals.finishing)
      return crystalMovement.tick();
    const rev = generation,
      enemy = target;
    const pressure = distance(enemy) <= 3.2 || now() < crystalPressureUntil;
    nextCrystalPlanAt = now() + (pressure ? 100 : 250);
    const action =
      settings.adaptiveCombat && requestedStyle === "auto"
        ? probeCrystal()
        : crystals.plan(enemy, now());
    if (!action) {
      if (now() >= nextCrystalStatusAt) {
        onStatus(`crystal waiting: ${crystals.reason}`);
        nextCrystalStatusAt = now() + 2000;
      }
      const range = Math.max(1, Math.min(3, settings.crystalPlaceRange - 0.5));
      const focusId = crystals.focus?.id ?? null;
      const continuingReposition =
        crystalReposition &&
        crystalReposition.focusId === focusId &&
        now() < crystalReposition.until &&
        bot.entity.position.distanceTo(crystalReposition.entity.position) > 0.45;
      if (crystals.waiting) {
        await crystalMovement.stop();
      } else if (continuingReposition) {
        // Finish the useful waypoint before choosing another approach. Crossing
        // a distance/pressure threshold halfway there must not reverse the walk.
        await crystalMovement.setGoal(crystalReposition.entity, 0.4, crystalReposition.reason);
      } else if (!crystals.finishing && distance(enemy) > range + 0.6 && !pressure) {
        crystalReposition = null;
        await crystalMovement.setGoal(enemy, range);
      } else {
        if (
          !crystalReposition ||
          crystalReposition.focusId !== focusId ||
          now() >= crystalReposition.until ||
          bot.entity.position.distanceTo(crystalReposition.entity.position) <= 0.45
        ) {
          const move = crystals.reposition(enemy, now(), pressure);
          crystalReposition = move
            ? {
                entity: { position: move.position },
                focusId,
                reason: move.reason,
                until: now() + 3000,
              }
            : null;
          if (move) onStatus(`crystal reposition: ${move.reason}`);
        }
        if (crystalReposition)
          await crystalMovement.setGoal(crystalReposition.entity, 0.4, crystalReposition.reason);
        else await crystalMovement.stop();
      }
      return;
    }
    crystalReposition = null;
    await crystalMovement.stop();
    if (rev !== generation || target !== enemy) return;
    // A valid layout is already reachable. Hold this position through cooldown,
    // equip, aim and server confirmation instead of resuming an old walk goal.
    if (now() < nextCrystalAt && !action.finish) return;
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
    if (
      settings.adaptiveCombat &&
      requestedStyle === "auto" &&
      !crystalOpportunity(
        {
          ...decision,
          health: bot.health,
          enemyHealth: observedHealth(bot, enemy).effective,
          distance: distance(enemy),
        },
        verified,
        settings,
      ).use
    ) {
      invalidateCrystal();
      return;
    }
    flushBowLook(bot.entity.yaw, bot.entity.pitch);
    nextCrystalAt = now() + settings.crystalIntervalMs;
    crystals.commit(verified, now());
    invalidateCrystal();
    try {
      if (verified.type === "break") bot.attack(verified.crystal);
      else {
        const reference = verified.type === "place" ? verified.base : verified.reference;
        // Send once; the planner checks actual world/entity confirmations on
        // subsequent ticks. Mineflayer's block helper awaits a fixed 5s timeout.
        await bot._genericPlace(reference, verified.face, {
          forceLook: "ignore",
          swingArm: "right",
          delta: verified.aim.minus(reference.position),
        });
      }
    } catch (error) {
      if (rev === generation && target === enemy) {
        crystals.fail(verified, now());
        onError(error);
      }
      return;
    }
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
  function recentPearlHand() {
    return pearlIntent && pearlIntent.enemy === target && now() - pearlIntent.at <= 9000;
  }
  function observePearlHand(entity = target) {
    if (!settings.pearlChase || !settings.enabled || !entity?.username || entity !== target) return;
    const hand = [
      entity.heldItem,
      entity.equipment?.[0],
      !bot.supportFeature("doesntHaveOffHandSlot") && entity.equipment?.[1],
    ].find((item) => item?.name === "ender_pearl");
    if (hand) {
      pearlIntent = { enemy: entity, at: now() };
    }
  }
  function packetVelocity(packet, type) {
    if (!packet.velocity) return null;
    const fields = bot.registry?.protocol?.play?.toClient?.types?.[type]?.[1];
    const scale =
      fields?.find?.((field) => field.name === "velocity")?.type === "lpVec3" ? 1 : 1 / 8000;
    const { x, y, z } = packet.velocity;
    if (![x, y, z].every(Number.isFinite)) return null;
    return new Vec3(x, y, z).scaled(scale);
  }
  function enemyPearl(packet) {
    if (
      disposed ||
      !settings.enabled ||
      !settings.pearlChase ||
      !target?.username ||
      !allowed(target) ||
      bot.health <= 0 ||
      bot.launcherTravel?.chasing
    )
      return;
    const data = bot.registry?.entitiesArray?.find((entry) => entry.internalId === packet.type);
    const entity = bot.entities?.[packet.entityId];
    if (!/pearl/i.test(data?.name ?? entity?.name ?? "")) return;
    const fixed = bot.supportFeature("fixedPointPosition") ? 1 / 32 : 1;
    const origin = new Vec3(packet.x, packet.y, packet.z).scaled(fixed);
    if (packet.objectData > 0) {
      if (packet.objectData !== target.id) return;
    } else {
      // Legacy servers omit the owner. Associate only an unambiguous nearby
      // thrower; this excludes the bot's and other players' pearls.
      const players = [bot.entity, ...Object.values(bot.entities ?? {})]
        .filter((player) => (player.username || player.type === "player") && allowed(player))
        .concat(bot.entity)
        .map((player) => ({
          player,
          distance: pearlOrigin(player, bot.registry).distanceTo(origin),
        }))
        .sort((a, b) => a.distance - b.distance);
      if (
        players[0]?.player.id !== target.id ||
        players[0].distance > 2.25 ||
        (players[1] && players[1].distance - players[0].distance < 0.5)
      )
        return;
    }
    // Ignore duplicate packets for the same throw.
    if (pursuit?.id === packet.entityId) return;
    const velocity = packetVelocity(packet, "packet_spawn_entity");
    const shot = velocity && simulatePearlFlight(bot, origin, velocity, undefined, target.id);
    pursuit = {
      id: packet.entityId,
      enemy: target,
      origin,
      velocity,
      sampledAt: now(),
      landing: shot?.landing ?? null,
      until: now() + (shot?.ticks ?? 120) * 50 + 3000,
      attempted: false,
      teleported: false,
    };
    nextPursuitPlanAt = now();
    onStatus(`enemy pearl: ${target.username}`);
  }
  function pearlVelocity(packet) {
    if (!pursuit || pursuit.id !== packet.entityId) return;
    pursuit.velocity = packetVelocity(packet, "packet_entity_velocity");
    updatePursuitLanding();
  }
  function updatePursuitLanding() {
    if (!pursuit?.velocity || pursuit.attempted || pursuit.teleported) return;
    const shot = simulatePearlFlight(
      bot,
      pursuit.origin,
      pursuit.velocity,
      undefined,
      pursuit.enemy.id,
    );
    if (shot) pursuit.landing = shot.landing;
  }
  function moved(entity) {
    if (entity === target) {
      sampleEnemyTeleport();
      return;
    }
    if (!pursuit) return;
    if (entity.id === pursuit.id && !entity.position.equals(pursuit.origin)) {
      pursuit.velocity = entity.position
        .minus(pursuit.origin)
        .scaled(1 / Math.max(1, (now() - pursuit.sampledAt) / 50));
      pursuit.origin = entity.position.clone();
      pursuit.sampledAt = now();
      updatePursuitLanding();
    }
  }
  function sampleEnemyTeleport() {
    if (!target?.position) return;
    if (
      lastEnemyPosition &&
      target.position.distanceTo(lastEnemyPosition) > 4 &&
      settings.pearlChase &&
      (pursuit || recentPearlHand())
    ) {
      if (!pursuit) {
        pursuit = { id: null, enemy: target, attempted: false, until: now() + 9000 };
        onStatus(`enemy pearl teleport: ${target.username}`);
      }
      pursuit.teleported = true;
      if (!pursuit.attempted) pursuit.landing = target.position.clone();
    }
    lastEnemyPosition = target.position.clone();
  }
  function pursuePearl() {
    if (!pursuit) return false;
    if (now() >= pursuit.until) {
      pursuit = null;
      bot.launcherTravel?.stopChase();
      return false;
    }
    if (!allowed(target)) {
      const enemy = pursuit.enemy;
      const replacement = Object.values(bot.entities ?? {}).find(
        (entity) =>
          allowed(entity) &&
          (enemy.uuid ? entity.uuid === enemy.uuid : entity.username === enemy.username),
      );
      if (!replacement) return true;
      target = replacement;
      pursuit.enemy = replacement;
      if (pearlIntent) pearlIntent.enemy = replacement;
      pursuit.teleported = true;
      pursuit.landing = replacement.position.clone();
    }
    sampleEnemyTeleport();
    if (bot.launcherTravel?.chasing) return true;
    if (pursuit.attempted) {
      // Keep the selected enemy while either pearl is still flying.
      if (!pursuit.teleported) return true;
      pursuit = null;
      return false;
    }
    if (pursuit.teleported && pursuit.landing && now() >= nextPursuitPlanAt) {
      nextPursuitPlanAt = now() + 250;
      const flight = pursuit;
      if (
        bot.launcherTravel?.chase(
          () => flight.landing,
          () => pursuit === flight && target === flight.enemy,
          ({ thrown }) => {
            if (pursuit !== flight) return;
            flight.attempted = thrown;
            nextPursuitPlanAt = now() + 250;
            queueMicrotask(tick);
          },
        )
      ) {
        flight.until = Math.max(flight.until, now() + 9000);
        generation++;
        pending = false;
        stopEngines();
        crystals.clear();
        bot.clearControlStates();
        return true;
      }
    }
    // Continue ordinary combat until there is a reachable, safe landing.
    return false;
  }
  function closeWithPearl() {
    if (
      workTarget ||
      !settings.pearlChase ||
      requestedStyle === "ranged" ||
      pursuit ||
      recovery ||
      mace.airborne ||
      (mode === "crystal" && crystals.active) ||
      now() < nextActionAt ||
      now() < nextClosingPlanAt ||
      distance(target) < Math.max(8, settings.pearlMinDistance) ||
      distance(target) > settings.pearlMaxDistance
    )
      return false;
    nextClosingPlanAt = now() + 750;
    const enemy = target;
    const flight = { enemy, teleported: true, attempted: false, until: now() + 9000 };
    if (
      !bot.launcherTravel?.chase(
        () => enemy.position,
        () => pursuit === flight && target === enemy && allowed(enemy),
        ({ thrown }) => {
          if (pursuit !== flight) return;
          flight.attempted = thrown;
          // An unsuccessful plan must resume foot pursuit, not wait in place.
          if (!thrown) pursuit = null;
          queueMicrotask(tick);
        },
      )
    )
      return false;
    pursuit = flight;
    generation++;
    pending = false;
    stopEngines();
    bot.clearControlStates();
    onStatus(`pearl close: ${enemy.username || enemy.name}`);
    return true;
  }
  function tick() {
    if (
      disposed ||
      !bot.entity?.position ||
      bot.health <= 0 ||
      bot.launcherSurvival?.busy ||
      bot.launcherProduction?.busy
    )
      return;
    try {
      if (defense.tick(true) || (suspended && !workTarget) || (!settings.enabled && !workTarget))
        return;
      if (!target && autoEnabled && !bot.launcherGathering?.busy && now() >= nextActionAt) {
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
      if (!workTarget) {
        sampleEnemyTeleport();
        observePearlHand();
        const finishingCrystal = mode === "crystal" && (crystals.waiting || crystals.finishing);
        if (!mace.airborne && !finishingCrystal && pursuePearl()) return;
      }
      const maxRange = combatRange();
      if (!allowed(target) || (distance(target) > maxRange && !pursuit)) {
        stop(false);
        return;
      }
      if (settings.adaptiveCombat && !workTarget) {
        decision = brain.evaluate(target, {
          visible: canSeeTarget(bot, target),
          airborne: mace.airborne,
        });
        // Healing preempts slow aim/equip work, but not a live airborne smash.
        if (recover()) return;
      }
      if (closeWithPearl()) return;
      if (bot.launcherPearling || pending || bowBusy || now() < nextActionAt) return;
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
      } else if (mode === "mace") {
        mace.tick();
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
        if (pursuit) mode = null;
        else stop(false);
      }
    } catch (error) {
      stop(true);
      onError(error);
    }
  }
  function removed(entity) {
    if (isCrystal(entity)) invalidateCrystal();
    if (entity === target) {
      bot.tracker?.stopTrackingEntity(entity);
      if ((pursuit && now() < pursuit.until) || recentPearlHand()) {
        if (!pursuit) pursuit = { id: null, enemy: target, attempted: false, until: now() + 9000 };
        generation++;
        pending = false;
        stopEngines();
        return;
      }
      stop(false);
      nextActionAt = now() + settings.reactionMs;
      onStatus("combat target lost");
    }
  }
  // Decide before the attack plugins, so a health emergency cancels their
  // outgoing strike/equip in this physics tick instead of the next one.
  bot.prependListener("physicsTick", tick);
  bot.on("entityGone", removed);
  const dead = (entity) => {
    if (entity === target) {
      pursuit = null;
      pearlIntent = null;
      removed(entity);
    }
  };
  bot.on("entityDead", dead);
  bot.on("entityMoved", moved);
  bot.on("entityEquip", observePearlHand);
  bot.on("entityUpdate", observePearlHand);
  const crystalSpawned = (entity) => {
    if (isCrystal(entity)) {
      nextCrystalPlanAt = 0;
      invalidateCrystal();
    }
  };
  const hurt = (entity) => {
    if (entity?.id !== bot.entity.id || !target) return;
    crystalPressureUntil = now() + 1500;
    nextCrystalPlanAt = 0;
    invalidateCrystal();
  };
  bot.on("blockUpdate", invalidateCrystal);
  bot.on("entitySpawn", crystalSpawned);
  bot.on("entityHurt", hurt);
  bot._client?.on?.("spawn_entity", enemyPearl);
  bot._client?.on?.("entity_velocity", pearlVelocity);
  const died = () => stop(true);
  bot.on("death", died);
  return {
    select,
    stop,
    defend(entity) {
      // Gathering owns threat selection and uses the existing melee engine.
      // Crystal placement and pursuit do not belong in a temporary work defense.
      if (entity?.username && isOwner(entity.username))
        throw new Error("Owners are protected during gathering");
      select(entity, "melee", true);
    },
    stopWorkDefense() {
      if (workTarget) stop(false);
    },
    get workTarget() {
      return workTarget ? target : null;
    },
    get bowThreat() {
      return defense.threat;
    },
    get imminentMaceSmash() {
      return mace.imminentSmash;
    },
    get decision() {
      return decision;
    },
    get managesHealing() {
      return Boolean(target && !workTarget && settings.adaptiveCombat && settings.combatHealing);
    },
    pauseForSurvival() {
      generation++;
      pending = false;
      defense.stop();
      crystals.clear();
      stopEngines();
      recoveryMovement.cancel();
      recovery = null;
    },
    resumeAfterSurvival() {
      if (!disposed && bot.health > 0) nextActionAt = now();
    },
    get idleTask() {
      return Promise.all([
        prepareTask,
        actionTask,
        defense.task,
        mace.task,
        crystalMovement.task,
        bot.swordpvp?.launcherShieldBreak?.task,
      ]);
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
      suspended = !enabled;
      autoEnabled = enabled;
      nextActionAt = now() + settings.reactionMs;
    },
    get status() {
      return target
        ? `${mode || "preparing"} ${target.username || target.name || target.id}${decision ? `; ${decision.action}; hp ${decision.health}; enemy hp ${decision.enemyHealth ?? "unknown"}` : ""}`
        : autoEnabled && !suspended
          ? "hostile mobs"
          : defense.threat
            ? `${(defense.threat.heldItem ?? defense.threat.equipment?.[0])?.name === "mace" ? "mace" : "bow"} threat ${defense.threat.username || defense.threat.name}`
            : "idle";
    },
    dispose() {
      disposed = true;
      stop(true);
      defense.dispose();
      mace.dispose();
      brain.dispose();
      if (settings.adaptiveCombat && nativeMove) {
        bot.swordpvp.doMove = nativeMove;
        bot.swordpvp.doStrafe = nativeStrafe;
        bot.swordpvp.sprintTap = nativeTap;
        bot.swordpvp.causeCritical = nativeCritical;
        if (nativeRotate) bot.swordpvp.rotate = nativeRotate;
        bot.swordpvp.off("attackedTarget", footwork.attacked);
      }
      bot.removeListener("physicsTick", tick);
      bot.removeListener("entityGone", removed);
      bot.removeListener("entityDead", dead);
      bot.removeListener("entityMoved", moved);
      bot.removeListener("entityEquip", observePearlHand);
      bot.removeListener("entityUpdate", observePearlHand);
      bot.removeListener("entitySpawn", crystalSpawned);
      bot.removeListener("entityHurt", hurt);
      bot.removeListener("blockUpdate", invalidateCrystal);
      bot._client?.off?.("spawn_entity", enemyPearl);
      bot._client?.off?.("entity_velocity", pearlVelocity);
      bot.removeListener("death", died);
    },
  };
}

module.exports = {
  HOSTILES,
  canSeeTarget,
  installCombatProtocol,
  normalizeCombat,
  configureCombatPlugins,
  installCombatNavigation,
  createCombatController,
};
