import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { installKnockback, expectWindBoost } from "./knockback.cjs";
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
    id: 2,
    type: "player",
    username: "Owner",
    name: "player",
    width: 0.6,
    height: 1.8,
    position: new Vec3(1, 64, 0.5),
    velocity: new Vec3(0, 0, 0),
  };
  bot.entities[neighbor.id] = neighbor;
  return {
    bot,
    world,
    neighbor,
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

for (const version of ["1.8.8", "1.20.4", "1.21.11", "26.1.2"]) {
  test(`a nearby player physically pushes the bot with the default worker settings on ${version}`, () => {
    const f = fixture(version);
    try {
      const config = worker.parseConfig(
        JSON.stringify({ server: { host: "localhost" }, account: { username: "Bot" } }),
      );
      worker.configurePathfinder(f.bot, config.movement, config.behavior);
      const start = f.bot.entity.position.clone();
      for (let tick = 0; tick < 8; tick++) f.tick();
      assert.ok(f.bot.entity.position.x < start.x - 0.2, "body contact moves our actual player");
      assert.equal(f.bot.entity.position.y, start.y, "push does not lift the player");
      assert.equal(f.bot.entity.position.z, start.z);
      assert.deepEqual(
        f.neighbor.velocity,
        new Vec3(0, 0, 0),
        "remote movement remains server controlled",
      );
    } finally {
      f.dispose();
    }
  });

  test(`server hit packets respect both modes and preserve remote entity velocity on ${version}`, () => {
    const f = fixture(version);
    try {
      const controller = installKnockback(f.bot);
      const modern =
        f.bot.registry.protocol.play.toClient.types.packet_entity_velocity[1].find(
          (field) => field.name === "velocity",
        ).type === "lpVec3";
      const hit = (id) =>
        receivedPacket(version, "entity_velocity", {
          entityId: id,
          velocity: modern ? { x: 0.4, y: 0.2, z: -0.1 } : { x: 3200, y: 1600, z: -800 },
        });
      const ownHit = hit(f.bot.entity.id);
      const decodedVelocity = new Vec3(
        ownHit.velocity.x,
        ownHit.velocity.y,
        ownHit.velocity.z,
      ).scaled(modern ? 1 : 1 / 8000);
      assert.ok(
        decodedVelocity.distanceTo(new Vec3(0.4, 0.2, -0.1)) < (modern ? 0.00006 : 0.00003),
        "wire quantization stays within protocol precision",
      );
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
      assert.deepEqual(
        f.bot.entity.velocity,
        decodedVelocity,
        "turning off restores impulse handling",
      );
    } finally {
      f.dispose();
    }
  });

  test(`a serialized survival hit actually moves the bot through physics on ${version}`, () => {
    const f = fixture(version);
    try {
      delete f.bot.entities[f.neighbor.id]; // Isolate damage from body pushing.
      const controller = installKnockback(f.bot);
      const modern =
        f.bot.registry.protocol.play.toClient.types.packet_entity_velocity[1].find(
          (field) => field.name === "velocity",
        ).type === "lpVec3";
      const packet = receivedPacket(version, "entity_velocity", {
        entityId: f.bot.entity.id,
        velocity: modern ? { x: 0.4, y: 0.4, z: 0 } : { x: 3200, y: 3200, z: 0 },
      });
      const start = f.bot.entity.position.clone();
      f.bot._client.emit("entity_velocity", packet);
      for (let tick = 0; tick < 5; tick++) f.tick();
      assert.ok(f.bot.entity.position.x > start.x + 0.8, "hit causes horizontal displacement");
      assert.ok(f.bot.entity.position.y > start.y + 0.5, "hit lifts the player");
      controller.setEnabled(true);
      f.bot.entity.position.update(start);
      f.bot.entity.velocity.set(0, 0, 0);
      f.bot.entity.onGround = true;
      f.bot._client.emit("entity_velocity", packet);
      for (let tick = 0; tick < 5; tick++) f.tick();
      assert.equal(f.bot.entity.position.x, start.x, "anti knockback suppresses the same hit");
    } finally {
      f.dispose();
    }
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
    } finally {
      f.dispose();
    }
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
    } finally {
      f.dispose();
    }
  }
});

test("server position corrections, distant entities, spectators and disabled team collisions remain respected", () => {
  const f = fixture();
  try {
    installKnockback(f.bot, true);
    f.bot._client.emit("position", {
      x: 4,
      y: 65,
      z: 3,
      yaw: 0,
      pitch: 0,
      flags: 0,
      teleportId: 1,
    });
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
  } finally {
    f.dispose();
  }
});

function windExplosion(bot, position = bot.entity.position, patch = {}) {
  const center = { x: position.x, y: position.y - 0.32, z: position.z };
  const particle = { type: "gust_emitter_small" };
  return receivedPacket(bot.version, "explosion", {
    ...center, center, radius: 1.2, affectedBlockOffsets: [],
    playerMotionX: 0, playerMotionY: 0.9, playerMotionZ: 0,
    playerKnockback: { x: 0, y: 0.9, z: 0 }, block_interaction_type: 3,
    small_explosion_particle: particle, large_explosion_particle: particle,
    explosionParticle: particle, blockCount: 0, blockParticles: [],
    sound: { soundId: bot.registry.soundsByName["entity.wind_charge.wind_burst"].id },
    ...patch,
  });
}

for (const version of ["1.21.1", "1.21.11", "26.1.2"]) {
  test(`anti-knockback accepts one planned wind lift but still blocks hits and other explosions on ${version}`, () => {
    const f = fixture(version);
    try {
      installKnockback(f.bot, true);
      f.bot.entity.position.y = 64.42;
      f.bot.entity.onGround = false;
      f.bot.entity.velocity.set(0, 0.33, 0);
      const burst = windExplosion(f.bot);
      f.bot._client.emit("explosion", burst);
      assert.equal(f.bot.entity.velocity.y, 0.33, "unsolicited wind remains blocked");
      expectWindBoost(f.bot, f.bot.entity.position, () => true);
      const velocityType = f.bot.registry.protocol.play.toClient.types.packet_entity_velocity[1]
        .find(field => field.name === "velocity").type;
      f.bot._client.emit("entity_velocity", receivedPacket(version, "entity_velocity", {
        entityId: f.bot.entity.id,
        velocity: velocityType === "lpVec3" ? { x: 0.5, y: 0.5, z: 0 } : { x: 4000, y: 4000, z: 0 },
      }));
      assert.deepEqual(f.bot.entity.velocity, new Vec3(0, 0.33, 0), "melee hit cannot borrow the wind exception");
      for (const rejected of [
        { ...burst, explosionParticle: { type: "explosion_emitter" },
          small_explosion_particle: { type: "explosion_emitter" }, large_explosion_particle: { type: "explosion_emitter" } },
        { ...burst, x: 5, center: { ...burst.center, x: 5 } },
        { ...burst, playerMotionY: -0.9, playerKnockback: { x: 0, y: -0.9, z: 0 } },
        { ...burst, playerMotionX: 1.5, playerKnockback: { x: 1.5, y: 0.9, z: 0 } },
      ]) {
        f.bot._client.emit("explosion", rejected);
        assert.deepEqual(f.bot.entity.velocity, new Vec3(0, 0.33, 0));
      }
      f.bot._client.emit("explosion", burst);
      assert.ok(Math.abs(f.bot.entity.velocity.y - 1.23) < 1e-6, "server wind impulse survives filtering");
      f.bot._client.emit("explosion", burst);
      assert.ok(Math.abs(f.bot.entity.velocity.y - 1.23) < 1e-6, "the exception is consumed by one burst");
      for (let tick = 0; tick < 5; tick++) f.tick();
      assert.ok(f.bot.entity.position.y > 67, "the accepted packet actually lifts the player through physics");
    } finally { f.dispose(); }
  });
}

test("a wind exception expires, cancels, follows ownership and is removed on disconnect", () => {
  const f = fixture("26.1.2");
  let time = 0, current = true;
  try {
    installKnockback(f.bot, true);
    const burst = windExplosion(f.bot);
    const arm = () => expectWindBoost(f.bot, f.bot.entity.position, () => current, { now: () => time });
    arm(); time = 1001;
    f.bot._client.emit("explosion", burst);
    assert.equal(f.bot.entity.velocity.y, 0);
    arm(); current = false;
    f.bot._client.emit("explosion", burst);
    assert.equal(f.bot.entity.velocity.y, 0);
    current = true;
    arm()();
    f.bot._client.emit("explosion", burst);
    assert.equal(f.bot.entity.velocity.y, 0);
    const oldCancel = arm();
    arm(); oldCancel();
    f.bot._client.emit("explosion", burst);
    assert.equal(f.bot.entity.velocity.y, 0.9, "an old cancellation cannot revoke a newer launch");
    arm();
    f.bot.emit("end");
    installKnockback(f.bot, true);
    // Physics also disconnects on end; the filter must still reject the packet.
    const before = f.bot.entity.velocity.clone();
    f.bot._client.emit("explosion", burst);
    assert.deepEqual(f.bot.entity.velocity, before);
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
  } finally {
    f.dispose();
  }
});
