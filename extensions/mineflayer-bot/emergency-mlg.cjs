const { PlayerState } = require('prismarine-physics');
const { Vec3 } = require('vec3');
const { toNotchianYaw, toNotchianPitch } = require('mineflayer/lib/conversions');
const { waterDrop } = require('./pathfinder.cjs');
const { carriedItems, queueInventoryTask } = require('./combat-inventory.cjs');

// Predict the first actual collision, with current velocity, effects and loaded
// blocks. A roof is a landing; water beneath it is never considered reachable.
function predictFall(bot) {
  const state = new PlayerState(bot, {});
  state.control = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false };
  let invalid = false;
  const world = { getBlock: pos => {
    const block = bot.blockAt(pos);
    if (!block) invalid = true;
    return block;
  } };
  for (let ticks = 1; ticks <= 100; ticks++) {
    bot.physics.simulatePlayer(state, world);
    if (invalid || state.isInLava) return;
    const feet = bot.blockAt(state.pos.offset(0, 0.1, 0));
    if (state.isInWater || feet?.name === 'water') return { wet: true };
    if (state.onGround) {
      const support = bot.blockAt(state.pos.offset(0, -0.01, 0));
      const source = support?.position.offset(0, 1, 0);
      if (!source || !support.shapes?.some(shape => shape.every((v, i) => v === [0, 0, 0, 1, 1, 1][i]))) return;
      if (!['air', 'cave_air', 'void_air'].includes(bot.blockAt(source)?.name)) return;
      return { target: source.offset(0.5, 0, 0.5), ticks, height: state.pos.y };
    }
  }
}

function createEmergencyMlg(bot, settings, { now = Date.now, onStatus = () => {} } = {}) {
  let rescue = null, generation = 0, useTask = null;
  function plan(peakY) {
    if (!settings.emergencyMlg || !waterDrop.permitsWater(bot) || !bot.physics || !bot.pathfinder?.world) return;
    const bucket = carriedItems(bot).find(item => item.name === 'water_bucket');
    if (!bucket) return;
    const landing = predictFall(bot);
    if (!landing?.target || peakY - landing.height < settings.mlgMinFallHeight) return;
    if (!waterDrop.predictWaterDrop(bot, bot.pathfinder.world, bot.entity.position, bot.entity.velocity,
      landing.target, true, false, true)) return;
    return { ...landing, bucket };
  }
  async function start(plan, current, previous = bot.heldItem) {
    const revision = ++generation;
    rescue = { ...plan, previous, started: now(), placed: false, wet: false,
      collected: false, tries: 0, lastUse: 0, ready: false, current };
    const task = rescue;
    await queueInventoryTask(bot, async () => {
      if (rescue !== task || revision !== generation || !current()) return;
      const item = carriedItems(bot).find(item => item.name === 'water_bucket');
      if (!item) throw new Error('No water bucket for MLG');
      if (bot.heldItem?.name !== 'water_bucket') await bot.equip(item, 'hand');
    });
    if (rescue !== task || !current()) return;
    task.ready = true;
    onStatus('MLG: emergency water bucket ready');
  }
  async function use(point, task) {
    const revision = generation;
    await bot.lookAt(point, true);
    if (revision !== generation || rescue !== task || !task.current()) return;
    bot._client.write('look', {
      yaw: Math.fround(toNotchianYaw(bot.entity.yaw)), pitch: Math.fround(toNotchianPitch(bot.entity.pitch)),
      onGround: Boolean(bot.entity.onGround),
      flags: { onGround: Boolean(bot.entity.onGround), hasHorizontalCollision: Boolean(bot.entity.isCollidedHorizontally) },
    });
    bot.activateItem();
  }
  function launchUse(point, task) {
    useTask = use(point, task).finally(() => { useTask = null; });
    return useTask;
  }
  async function tick() {
    const task = rescue;
    if (!task || !task.current()) return true;
    const { position: pos, velocity: vel } = bot.entity;
    const feet = bot.blockAt(pos.offset(0, 0.1, 0));
    task.wet ||= bot.entity.isInWater || (bot.entity.onGround && feet?.name === 'water');
    const input = waterDrop.flightControls(pos, vel, task.target, false, false);
    bot.entity.yaw = input.yaw;
    for (const [control, value] of Object.entries(input.controls)) bot.setControlState(control, value);
    if (now() - task.started > 8000) throw new Error('Emergency MLG timed out');
    if (!task.ready || useTask) return false;
    if (!task.placed && !task.wet && vel.y < -0.1 && pos.y - task.target.y < 3.1 &&
      bot.heldItem?.name === 'water_bucket' && waterDrop.supportHit(bot.pathfinder.world, pos, task.target) &&
      now() - task.lastUse >= 100) {
      // Retry placement until the server confirms a source and an empty bucket.
      task.lastUse = now();
      await launchUse(task.target.offset(0, -0.01, 0), task);
    }
    const source = bot.blockAt(task.target.floored());
    task.placed ||= source?.name === 'water' && Number(source.getProperties().level) === 0 &&
      bot.heldItem?.name === 'bucket';
    if (bot.entity.onGround && !task.wet) throw new Error('MLG landing was not confirmed in water');
    if (task.wet && bot.entity.onGround && Math.abs(vel.y) < 0.12 && pos.xzDistanceTo(task.target) < 0.45) {
      if (!task.placed || !settings.mlgPickupWater) return true;
      if (task.tries > 0 && bot.heldItem?.name === 'water_bucket') {
        task.collected = true;
        onStatus('MLG: landed safely and recovered water');
        return true;
      }
      if (source?.name !== 'water' || Number(source.getProperties().level) !== 0) return true;
      if (bot.heldItem?.name === 'bucket' && now() - task.lastUse >= 300) {
        if (task.tries >= 3) throw new Error('Server did not confirm MLG water collection');
        task.tries++; task.lastUse = now();
        await launchUse(task.target.offset(0, 0.5, 0), task);
      }
    }
    return false;
  }
  async function finish(current) {
    const previous = rescue?.previous;
    rescue = null; generation++;
    if (current() && bot.usingHeldItem) bot.deactivateItem();
    if (previous && current()) await queueInventoryTask(bot, async () => {
      if (!current()) return;
      const item = carriedItems(bot).find(item => item === previous) ??
        carriedItems(bot).find(item => item.name === previous.name);
      if (item) await bot.equip(item, 'hand');
    });
  }
  function cancel() { rescue = null; generation++; }
  return { plan, start, tick, finish, cancel, get active() { return Boolean(rescue); } };
}

module.exports = { createEmergencyMlg, predictFall };
