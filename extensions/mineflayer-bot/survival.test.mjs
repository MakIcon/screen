import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { AutoEat } = require('./auto-eat.cjs');
const { normalizeSurvival, createSurvivalController } = require('./survival.cjs');
const { predictFall, createEmergencyMlg } = require('./emergency-mlg.cjs');
const { equipCombatItem } = require('./combat-inventory.cjs');
const { installSurfaceSwimming, createPlugin, goals } = require('./pathfinder.cjs');
const { Vec3 } = require('vec3');
const rigRequire = createRequire(new URL('./pathfinding/package.json', import.meta.url));
rigRequire('ts-node').register({ project: fileURLToPath(new URL('./pathfinding/tsconfig.json', import.meta.url)), transpileOnly: true });
const { createCacheWorld } = rigRequire('./tests/setup.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));

function foodFixture() {
  const bot = new EventEmitter();
  const sword = { name: 'diamond_sword', type: 1, slot: 36 }, bread = { name: 'bread', type: 2, slot: 9 };
  bot.entity = { id: 1 };
  bot.health = 20; bot.food = 14; bot.heldItem = sword;
  bot.registry = { foodsByName: { bread: { foodPoints: 5, saturation: 6 }, rotten_flesh: { foodPoints: 4, saturation: .8 },
    cooked_beef: { foodPoints: 8, saturation: 12.8 }, golden_apple: { foodPoints: 4, saturation: 9.6 } } };
  bot.inventory = { items: () => [sword, bread] };
  bot._client = new EventEmitter();
  bot.equip = async item => { bot.heldItem = item; };
  bot.activateItem = () => { bot.usingHeldItem = true; };
  bot.deactivateItem = () => { bot.usingHeldItem = false; };
  return { bot, sword, bread };
}

test('auto-eat acknowledges fast server completion and restores the weapon without leaking listeners', async () => {
  const { bot, sword } = foodFixture();
  const eat = new AutoEat(bot);
  bot.activateItem = () => bot._client.emit('entity_status', { entityId: 1, entityStatus: 9 });
  assert.equal(await eat.eat(), true);
  assert.equal(bot.heldItem, sword);
  assert.equal(eat.isEating, false);
  assert.equal(bot._client.listenerCount('entity_status'), 0);
  assert.equal(bot.listenerCount('death'), 0);
});
test('timeout and equip failure recover eating state and remove completion handlers', async () => {
  const { bot } = foodFixture();
  const eat = new AutoEat(bot, { eatingTimeout: 10 });
  await assert.rejects(eat.eat(), /confirm eating/);
  assert.equal(eat.isEating, false);
  assert.equal(bot._client.listenerCount('entity_status'), 0);
  bot.equip = async () => { throw new Error('inventory refused'); };
  await assert.rejects(eat.eat(), /inventory refused/);
  assert.equal(eat.isEating, false);
  assert.equal(bot.listenerCount('end'), 0);
});
test('MLG cancellation never restores a weapon over the emergency bucket', async () => {
  const { bot } = foodFixture();
  const eat = new AutoEat(bot);
  let current = true;
  const eating = eat.eat({ current: () => current });
  await flush();
  current = false; eat.cancelEat();
  bot.heldItem = { name: 'water_bucket' };
  await assert.rejects(eating, /cancelled/);
  assert.equal(bot.heldItem.name, 'water_bucket');
  assert.equal(bot._client.listenerCount('entity_status'), 0);
});
test('safe food ranking excludes special apples and does not consume at full hunger', () => {
  const { bot } = foodFixture();
  bot.inventory.items = () => ['rotten_flesh', 'golden_apple', 'bread', 'cooked_beef'].map(name => ({ name }));
  const eat = new AutoEat(bot);
  assert.equal(eat.bestFood().name, 'cooked_beef');
  bot.food = 20; bot.health = 5;
  assert.equal(eat.needsFood(), false);
  bot.food = 19;
  assert.equal(eat.needsFood(), true);
});
for (const event of ['death', 'end']) test(`eating cancels and cleans up on ${event}`, async () => {
  const { bot } = foodFixture();
  const eat = new AutoEat(bot);
  const operation = eat.eat();
  await flush(); bot.emit(event);
  await assert.rejects(operation, /interrupted/);
  assert.equal(eat.isEating, false);
  assert.equal(bot._client.listenerCount('entity_status'), 0);
});
test('combat inventory queues yield while survival owns the hand', async () => {
  const { bot, bread, sword } = foodFixture();
  bot.launcherSurvival = { busy: true }; bot.heldItem = bread;
  await equipCombatItem(bot, sword, 'hand');
  assert.equal(bot.heldItem, bread);
});
test('survival defaults and bounds preserve explicitly disabled features', () => {
  assert.equal(normalizeSurvival(null).autoEat, true);
  assert.deepEqual(normalizeSurvival({ autoEat: false, emergencyMlg: false, mlgPickupWater: false,
    autoEatMinHunger: 100, autoEatMinHealth: -5, autoEatPriority: 'wrong', mlgMinFallHeight: 0 }), {
    autoEat: false, emergencyMlg: false, mlgPickupWater: false, autoEatMinHunger: 19,
    autoEatMinHealth: 1, autoEatPriority: 'saturation', mlgMinFallHeight: 4,
  });
});

function fallingFixture(version = '26.1.2', velocity = new Vec3(0, -.2, 0)) {
  const f = createCacheWorld(version, 64, new Vec3(.5, 84, .5), { renderDistance: 2 });
  const bot = f.rig.bot;
  bot.physicsEnabled = false;
  bot.entity.onGround = false; bot.entity.velocity = velocity;
  bot.health = 20; bot.food = 20;
  bot.deactivateItem = () => { bot.usingHeldItem = false; };
  const Item = require('prismarine-item')(bot.registry);
  const bucket = new Item(bot.registry.itemsByName.water_bucket.id, 1);
  bucket.slot = 36; bot.inventory.slots[36] = bucket;
  bot.pathfinder = { world: f.cacheWorld, interrupt: async () => {}, stop: async () => {} };
  return { ...f, bot, dispose: () => { f.cacheWorld.dispose(); f.rig.stopPassivePhysics(); } };
}

for (const [version, eating] of ['1.20.4', '26.1.2'].flatMap(version => [[version, false], [version, true]])) {
  test(`unplanned MLG ${eating ? 'interrupts eating and ' : ''}recovers water with real falling physics on ${version}`, { timeout: 5000 }, async t => {
    const f = fallingFixture(version, new Vec3(.15, -.2, 0));
    t.after(f.dispose);
    const { bot, world } = f;
    bot.supportFeature = bot.registry.supportFeature;
    bot.loadPlugin(require('mineflayer/lib/plugins/inventory'), { hideErrors: false });
    bot.loadPlugin(require('mineflayer/lib/plugins/simple_inventory'));
    bot.setQuickBarSlot(0);
    const protocol = createRequire(require.resolve('mineflayer'))('minecraft-protocol');
    const serializer = protocol.createSerializer({ state: 'play', isServer: false, version });
    const packets = [];
    bot._client.state = 'play';
    bot._client.write = (name, params) => {
      serializer.createPacketBuffer({ name, params });
      packets.push({ name, params });
    };
    let clock = 10000;
    const calls = [], errors = [];
    let placedAt;
    installSurfaceSwimming(bot, true);
    const Item = require('prismarine-item')(bot.registry);
    const initialBucket = new Item(bot.registry.itemsByName.water_bucket.id, 1);
    initialBucket.slot = 36; bot.inventory.slots[36] = initialBucket;
    if (eating) {
      const bucket = bot.inventory.slots[36];
      bucket.slot = 37; bot.inventory.slots[37] = bucket;
      bot.inventory.slots[36] = new Item(bot.registry.itemsByName.diamond_sword.id, 1);
      bot.inventory.slots[36].slot = 36;
      bot.inventory.slots[38] = new Item(bot.registry.itemsByName.bread.id, 3);
      bot.inventory.slots[38].slot = 38;
      bot.food = 14; bot.entity.onGround = true;
      world.setBlock(new Vec3(0, 83, 0), 'stone');
    }
    const controller = createSurvivalController(bot, {}, { now: () => clock, onError: error => errors.push(error) });
    bot.launcherCombat = { pauseForSurvival: () => calls.push('combat pause'), resumeAfterSurvival: () => calls.push('combat resume') };
    bot.launcherTravel = { pauseForSurvival: () => calls.push('travel pause'), resumeAfterSurvival: () => calls.push('travel resume') };
    const activateItem = bot.activateItem.bind(bot);
    const consumptionListeners = bot._client.listenerCount('entity_status');
    bot.activateItem = () => {
      activateItem();
      const slot = bot.heldItem.slot;
      if (bot.heldItem.name === 'water_bucket') {
        assert.equal(packets.at(-1).name, 'use_item');
        assert.equal(packets.at(-2).name, 'look', 'aim is sent before bucket use');
        const eye = bot.entity.position.offset(0, 1.62, 0);
        const { yaw, pitch } = bot.entity;
        const hit = world.raycast(eye, new Vec3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)), 4.5);
        assert.ok(hit, 'crosshair must reach solid support');
        assert.equal(hit.face, 1, 'bucket hits the top face');
        placedAt = hit.position.offset(0, 1, 0);
        world.setBlock(placedAt, 'water');
        bot.inventory.slots[slot] = new Item(bot.registry.itemsByName.bucket.id, 1);
        bot.inventory.slots[slot].slot = slot;
        calls.push('place');
      } else if (bot.heldItem.name === 'bucket') {
        assert.equal(bot.entity.onGround, true, 'pickup waits for landing');
        assert.equal(world.getBlock(placedAt).name, 'water');
        world.setBlock(placedAt, 'air');
        bot.inventory.slots[slot] = new Item(bot.registry.itemsByName.water_bucket.id, 1);
        bot.inventory.slots[slot].slot = slot;
        calls.push('pickup');
      } else if (bot.heldItem.name === 'bread') {
        bot.usingHeldItem = true;
      }
    };
    try {
      if (eating) {
        bot.emit('physicsTick'); await flush();
        assert.equal(bot.autoEat.isEating, true, `kind=${controller.kind}; food=${bot.food}; held=${bot.heldItem?.name}; errors=${errors.map(error => error.message)}`);
        assert.equal(bot.heldItem.name, 'bread');
        world.setBlock(new Vec3(0, 83, 0), 'air');
        bot.entity.onGround = false;
      }
      for (let tick = 0; tick < 160; tick++) {
        bot.emit('physicsTick'); await flush();
        const state = new (require('prismarine-physics').PlayerState)(bot, bot.controlState);
        bot.physics.simulatePlayer(state, world).apply(bot);
        clock += 50;
        if (calls.includes('pickup') && !controller.busy) break;
      }
      assert.deepEqual(errors, []);
      assert.ok(calls.includes('place')); assert.ok(calls.includes('pickup'));
      assert.equal(bot.heldItem.name, eating ? 'diamond_sword' : 'water_bucket');
      assert.equal(bot.autoEat.isEating, false);
      assert.equal(bot._client.listenerCount('entity_status'), consumptionListeners);
      assert.equal(bot.entity.onGround, true);
      assert.equal(controller.busy, false);
      assert.ok(calls.includes('combat resume') && calls.includes('travel resume'));
    } finally { controller.dispose(); f.dispose(); }
  });
}

test('MLG rejects disabled, short, wet, unloaded and Nether falls', () => {
  const f = fallingFixture();
  try {
    const defaults = normalizeSurvival();
    assert.ok(createEmergencyMlg(f.bot, defaults).plan(84));
    assert.equal(createEmergencyMlg(f.bot, { ...defaults, emergencyMlg: false }).plan(84), undefined);
    assert.equal(createEmergencyMlg(f.bot, { ...defaults, mlgMinFallHeight: 32 }).plan(84), undefined);
    f.bot.game.dimension = 'minecraft:the_nether';
    assert.equal(createEmergencyMlg(f.bot, defaults).plan(84), undefined);
    f.bot.game.dimension = 'minecraft:overworld';
    f.world.setBlock(new Vec3(0, 64, 0), 'water');
    assert.equal(predictFall(f.bot)?.wet, true);
    assert.equal(createEmergencyMlg(f.bot, defaults).plan(84), undefined);
    const blockAt = f.bot.blockAt;
    f.bot.blockAt = () => null;
    assert.equal(predictFall(f.bot), undefined);
    f.bot.blockAt = blockAt;
  } finally { f.dispose(); }
});

test('navigation waits for survival ownership and can cancel the waiting goal', async () => {
  const f = fallingFixture();
  const { bot } = f;
  bot.entity.position = new Vec3(.5, 64, .5); bot.entity.onGround = true;
  bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false } }));
  let busy = true;
  bot.launcherSurvival = { get busy() { return busy; } };
  const movement = [];
  bot.on('goalSet', goal => movement.push(goal));
  try {
    const waiting = bot.pathfinder.goto(new goals.GoalBlock(2, 64, 0));
    await flush();
    assert.equal(movement.length, 0);
    await bot.pathfinder.stop(); await waiting;
    busy = false; bot.emit('physicsTick'); await flush();
    assert.equal(movement.length, 0, 'a cancelled goal does not restart after survival');
  } finally { await bot.pathfinder.destroy(); f.dispose(); }
});
test('MLG sees a solid roof before water below it', () => {
  const f = fallingFixture();
  try {
    f.world.setBlock(new Vec3(0, 74, 0), 'stone');
    f.world.setBlock(new Vec3(0, 64, 0), 'water');
    const landing = predictFall(f.bot);
    assert.equal(landing.height, 75);
    assert.equal(landing.target.y, 75);
  } finally { f.dispose(); }
});

test('auto-eat pauses and resumes movement and releases every controller listener', async () => {
  const f = fallingFixture();
  const { bot } = f;
  bot.entity.position = new Vec3(.5, 64, .5); bot.entity.onGround = true;
  bot.food = 10;
  const Item = require('prismarine-item')(bot.registry), bread = new Item(bot.registry.itemsByName.bread.id, 2);
  bread.slot = 37; bot.inventory.slots[37] = bread;
  const calls = [];
  bot.launcherTravel = { pauseForSurvival: () => calls.push('pause'), resumeAfterSurvival: () => calls.push('resume') };
  bot.activateItem = () => { bot.food = 15; bot._client.emit('entity_status', { entityId: bot.entity.id, entityStatus: 9 }); };
  const baseline = bot.listenerCount('physicsTick');
  const controller = createSurvivalController(bot, {});
  try {
    bot.emit('physicsTick'); await flush(); await controller.task;
    assert.equal(bot.heldItem.name, 'water_bucket');
    assert.equal(bot.food, 15);
    assert.deepEqual(calls, ['pause', 'resume']);
    assert.equal(controller.busy, false);
    controller.dispose();
    assert.equal(bot.listenerCount('physicsTick'), baseline);
    assert.equal(bot._client.listenerCount('entity_status'), 0);
  } finally { controller.dispose(); f.dispose(); }
});
