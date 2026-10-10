import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { installKnockback } from "./knockback.cjs";
import worker from "./worker.cjs";

const require = createRequire(import.meta.url);
const { Vec3 } = require("vec3");
const mineflayerRequire = createRequire(require.resolve("mineflayer"));
const { PlayerState } = mineflayerRequire("prismarine-physics");
const protocol = mineflayerRequire("minecraft-protocol");
const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");

function fixture(version = "1.20.4") {
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
  // Drive real Mineflayer physics deterministically, without its wall-clock timer.
  rig.stopPassivePhysics();
  const bot = rig.bot;
  bot.supportFeature = bot.registry.supportFeature;
  bot.loadPlugin(require("mineflayer/lib/plugins/entities"));
  bot.entities[bot.entity.id] = bot.entity;
  bot.entity.velocity.set(0, 0, 0);
  const neighbor = {
    id: 2, type: "player", username: "Owner", name: "player",
    width: 0.6, height: 1.8, position: new Vec3(1, 64, 0.5), velocity: new Vec3(0, 0, 0),
  };
  bot.entities[neighbor.id] = neighbor;
  return {
    bot, world, neighbor,
    tick() {
      bot.physics.simulatePlayer(new PlayerState(bot, bot.controlState), world).apply(bot);
      bot.emit("physicsTick");
    },
    dispose: () => rig.stopPassivePhysics(),
  };
}

function receivedPacket(version, name, params) {
  const serializer = protocol.createSerializer({ state: "play", isServer: true, version });
  const parser = protocol.createDeserializer({ state: "play", isServer: false, version });
  return parser.parsePacketBuffer(serializer.createPacketBuffer({ name, params })).data.params;
}

for (const version of ["1.8.8", "1.20.4", "26.1.2"]) {
  test(`a nearby player physically pushes the bot with the default worker settings on ${version}`, () => {
    const f = fixture(version);
    try {
      const config = worker.parseConfig(JSON.stringify({ server: { host: "localhost" }, account: { username: "Bot" } }));
      worker.configurePathfinder(f.bot, config.movement, config.behavior);
      const start = f.bot.entity.position.clone();
      for (let tick = 0; tick < 8; tick++) f.tick();
      assert.ok(f.bot.entity.position.x < start.x - 0.2, "body contact moves our actual player");
      assert.equal(f.bot.entity.position.y, start.y, "push does not lift the player");
      assert.equal(f.bot.entity.position.z, start.z);
      assert.deepEqual(f.neighbor.velocity, new Vec3(0, 0, 0), "remote movement remains server controlled");
    } finally { f.dispose(); }
  });

  test(`server hit packets respect both modes and preserve remote entity velocity on ${version}`, () => {
    const f = fixture(version);
    try {
      const controller = installKnockback(f.bot);
      const hit = (id) => receivedPacket(version, "entity_velocity", {
        entityId: id, velocity: { x: 3200, y: 1600, z: -800 },
      });
      const ownHit = hit(f.bot.entity.id);
      const decodedVelocity = new Vec3(ownHit.velocity.x, ownHit.velocity.y, ownHit.velocity.z).scaled(1 / 8000);
      assert.ok(decodedVelocity.distanceTo(new Vec3(0.4, 0.2, -0.1)) < 0.00003, "wire quantization stays within protocol precision");
      f.bot._client.emit("entity_velocity", ownHit);
      assert.deepEqual(f.bot.entity.velocity, decodedVelocity, "disabled accepts server impulse");
      const ownMotion = new Vec3(0.12, 0.42, -0.08);
      f.bot.entity.velocity.update(ownMotion);
      controller.setEnabled(true);
      f.bot._client.emit("entity_velocity", hit(f.bot.entity.id));
      assert.deepEqual(f.bot.entity.velocity, ownMotion, "enabled preserves jump/own motion");
      f.bot._client.emit("entity_velocity", hit(f.neighbor.id));
      assert.deepEqual(f.neighbor.velocity, decodedVelocity);
      controller.setEnabled(false);
      f.bot._client.emit("entity_velocity", hit(f.bot.entity.id));
      assert.deepEqual(f.bot.entity.velocity, decodedVelocity, "turning off restores impulse handling");
    } finally { f.dispose(); }
  });

  test(`enabled anti knockback stops body pushes while walking and jumping still work on ${version}`, () => {
    const f = fixture(version);
    try {
      const controller = installKnockback(f.bot, true);
      for (let tick = 0; tick < 5; tick++) f.tick();
      assert.equal(f.bot.entity.position.x, 0.5);
      f.bot.setControlState("forward", true);
      f.bot.setControlState("jump", true);
      for (let tick = 0; tick < 3; tick++) f.tick();
      assert.ok(f.bot.entity.position.y > 64.5, "jump retains upward velocity");
      assert.ok(Math.abs(f.bot.entity.position.z - 0.5) > 0.1, "walking retains its acceleration");
      controller.setEnabled(false);
      f.bot.clearControlStates();
      f.bot.entity.position.set(0.5, 64, 0.5);
      f.bot.entity.velocity.set(0, 0, 0);
      f.bot.entity.onGround = true;
      for (let tick = 0; tick < 5; tick++) f.tick();
      assert.ok(f.bot.entity.position.x < 0.4, "disabling restores body pushes");
    } finally { f.dispose(); }
  });
}

test("explosions respect the setting for both packet formats without losing current motion", () => {
  for (const explosion of [
    { playerMotionX: 0.4, playerMotionY: 0.2, playerMotionZ: -0.1 },
    { playerKnockback: { x: 0.4, y: 0.2, z: -0.1 } },
  ]) {
    const f = fixture();
    try {
      const controller = installKnockback(f.bot);
      f.bot.entity.velocity.set(0.1, 0.3, 0.2);
      f.bot._client.emit("explosion", explosion);
      assert.deepEqual(f.bot.entity.velocity, new Vec3(0.5, 0.5, 0.1));
      controller.setEnabled(true);
      f.bot._client.emit("explosion", explosion);
      assert.deepEqual(f.bot.entity.velocity, new Vec3(0.5, 0.5, 0.1));
    } finally { f.dispose(); }
  }
});

test("server position corrections, distant entities, spectators and disabled team collisions remain respected", () => {
  const f = fixture();
  try {
    installKnockback(f.bot, true);
    f.bot._client.emit("position", { x: 4, y: 65, z: 3, yaw: 0, pitch: 0, flags: 0, teleportId: 1 });
    assert.deepEqual(f.bot.entity.position, new Vec3(4, 65, 3));
    installKnockback(f.bot, false);
    f.bot.entity.position.set(0.5, 64, 0.5);
    for (const patch of [
      { position: new Vec3(2, 64, 0.5) },
      { position: new Vec3(1, 66, 0.5) },
      { position: new Vec3(1, 64, 0.5), type: "projectile" },
      { type: "player", isValid: false },
    ]) {
      Object.assign(f.neighbor, patch);
      f.bot.entity.velocity.set(0, 0, 0);
      f.bot.emit("physicsTick");
      assert.equal(f.bot.entity.velocity.x, 0);
    }
    f.neighbor.isValid = true;
    f.bot.players.Owner = { gamemode: 3 };
    f.bot.emit("physicsTick");
    assert.equal(f.bot.entity.velocity.x, 0);
    f.bot.players.Owner.gamemode = 0;
    f.bot.teamMap = { Owner: { collisionRule: "never" } };
    f.bot.emit("physicsTick");
    assert.equal(f.bot.entity.velocity.x, 0);
  } finally { f.dispose(); }
});

test("reinstall updates the setting once and disconnect removes all controller listeners", () => {
  const f = fixture();
  try {
    const tickCount = f.bot.listenerCount("physicsTick");
    const velocityCount = f.bot._client.listenerCount("entity_velocity");
    const explosionCount = f.bot._client.listenerCount("explosion");
    const controller = installKnockback(f.bot);
    assert.equal(installKnockback(f.bot, true), controller);
    assert.equal(controller.enabled, true);
    assert.equal(f.bot.listenerCount("physicsTick"), tickCount + 1);
    f.bot.emit("end");
    assert.equal(f.bot.listenerCount("physicsTick"), tickCount);
    assert.equal(f.bot._client.listenerCount("entity_velocity"), velocityCount);
    assert.equal(f.bot._client.listenerCount("explosion"), explosionCount);
  } finally { f.dispose(); }
});
