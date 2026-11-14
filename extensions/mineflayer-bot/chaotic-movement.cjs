const { Vec3 } = require("vec3");

const HAZARD =
  /^(?:lava|water|bubble_column|fire|soul_fire|campfire|soul_campfire|cactus|magma_block|powder_snow|sweet_berry_bush|wither_rose)$/;
const CONTROLS = ["forward", "back", "left", "right", "sprint"];

// Check the next step, including both sides of the player's footprint. Unknown
// chunks, drops and hazardous blocks are treated as blocked terrain.
function safeStep(bot, yaw) {
  const position = bot.entity?.position;
  if (!position || !bot.entity.onGround) return false;
  const dx = -Math.sin(yaw),
    dz = -Math.cos(yaw);
  for (const distance of [0.4, 1.1]) {
    for (const side of [-0.3, 0.3]) {
      const x = position.x + dx * distance + dz * side;
      const z = position.z + dz * distance - dx * side;
      const y = Math.floor(position.y + 0.05);
      const ground = bot.blockAt(new Vec3(x, y - 1, z));
      if (!ground || ground.boundingBox !== "block" || HAZARD.test(ground.name)) return false;
      for (const height of [0, 1]) {
        const block = bot.blockAt(new Vec3(x, y + height, z));
        if (!block || block.boundingBox !== "empty" || HAZARD.test(block.name)) return false;
      }
    }
  }
  return true;
}

function createChaoticMovementController(
  bot,
  settings = {},
  { now = Date.now, random = Math.random, onChange = () => {}, onError = () => {} } = {},
) {
  let active = false,
    disposed = false,
    generation = 0,
    nextTurnAt = 0;
  let moving = false,
    anchor = null,
    direction = 0;
  const occupied = () =>
    bot.launcherSurvival?.busy || bot.launcherDefendingBow || bot.launcherPearling;
  function clear() {
    moving = false;
    for (const control of CONTROLS) bot.setControlState(control, false);
  }
  function stop() {
    if (!active) return;
    active = false;
    generation++;
    clear();
    onChange(false);
  }
  function tick() {
    if (!active || disposed) return;
    if (!bot.entity || bot.health <= 0 || bot.isAlive === false) {
      stop();
      return;
    }
    // Survival owns the controls while eating or rescuing a fall. It clears
    // controls when acquiring/releasing ownership; do not overwrite its input.
    if (occupied()) {
      moving = false;
      nextTurnAt = 0;
      generation++;
      return;
    }
    const time = now();
    if (moving && !safeStep(bot, direction)) {
      clear();
      nextTurnAt = 0;
    }
    if (time < nextTurnAt) return;
    clear();
    const position = bot.entity.position;
    const distance = Math.hypot(position.x - anchor.x, position.z - anchor.z);
    const angle =
      distance > 12
        ? Math.atan2(position.x - anchor.x, position.z - anchor.z) +
          ((random() - 0.5) * Math.PI) / 2
        : random() * Math.PI * 2;
    let yaw = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = angle + (attempt * Math.PI) / 4;
      if (safeStep(bot, candidate)) {
        yaw = candidate;
        break;
      }
    }
    nextTurnAt = time + 600 + random() * 800;
    if (yaw === null) return;
    const token = ++generation;
    direction = yaw;
    try {
      Promise.resolve(bot.look(yaw, 0, true))
        .then(() => {
          if (!active || disposed || token !== generation || occupied() || !safeStep(bot, yaw))
            return;
          moving = true;
          bot.setControlState("forward", true);
          bot.setControlState("sprint", settings.allowSprinting === true);
        })
        .catch(fail);
    } catch (error) {
      fail(error);
    }
    function fail(error) {
      if (!active || disposed || token !== generation) return;
      stop();
      onError(error);
    }
  }
  function start() {
    if (disposed) throw new Error("Режим движения уже завершён");
    if (!bot.entity?.position) throw new Error("Бот ещё не появился в мире");
    if (active) return;
    anchor = bot.entity.position.clone();
    active = true;
    nextTurnAt = 0;
    onChange(true);
    tick();
  }
  function dispose() {
    stop();
    disposed = true;
    bot.off("physicsTick", tick);
    bot.off("death", stop);
    bot.off("end", dispose);
  }
  bot.on("physicsTick", tick);
  bot.on("death", stop);
  bot.on("end", dispose);
  return {
    start,
    stop,
    dispose,
    get active() {
      return active;
    },
  };
}

module.exports = { createChaoticMovementController, safeStep };
