import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import console from "node:console";

const extension = new URL("../../extensions/mineflayer-bot/", import.meta.url);
const current = createRequire(new URL("package.json", extension));
const before = createRequire(new URL(".pvp-speed-fix-1.15.8.local/before/package.json", extension));
const { Vec3 } = current("vec3");
const oldMovement = before("./crystal-movement.cjs");
const newMovement = current("./crystal-movement.cjs");
const oldFootwork = before("./combat-footwork.cjs");
const newFootwork = current("./combat-footwork.cjs");
let seed = 71829;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const air = { name: "air", boundingBox: "empty", shapes: [] };
const stone = { name: "stone", boundingBox: "block", shapes: [[0, 0, 0, 1, 1, 1]] };
const slab = { name: "stone_slab", boundingBox: "block", shapes: [[0, 0, 0, 1, 0.5, 1]] };
function terrain(kind, point) {
  const x = Math.floor(point.x),
    y = Math.floor(point.y),
    z = Math.floor(point.z);
  if (kind === 3 && x % 4 === 0) return null;
  if (kind === 4 && z % 4 === 0) return air;
  if (kind === 5 && y === 64 && x % 3 === 0) return { ...air, name: "lava" };
  if (kind === 6 && y === 65 && z % 3 === 0) return stone;
  if (kind === 7 && y === 64 && x % 4 === 0) return { ...air, name: "water" };
  const top = kind === 1 ? 63 + (Math.abs(x + z) % 5 < 2 ? 1 : 0) : 63;
  if (kind === 2 && y === top) return slab;
  return y <= top ? stone : air;
}
let corridors = 0,
  walkable = 0;
for (let kind = 0; kind < 8; kind++) {
  for (let i = 0; i < 1000; i++) {
    const start = new Vec3(random() * 16 - 8, 64 + [0, 0.2, 0.5, 1][i % 4], random() * 16 - 8);
    const destination = start.offset(random() * 12 - 6, random() * 3 - 1, random() * 12 - 6);
    const bot = {
      entity: { position: start, width: 0.6 },
      setControlState() {},
      blockAt: (p) => terrain(kind, p),
    };
    const range = i % 3 === 0 ? 1.8 : 0,
      distance = [1.2, 1.5, 4.9, 6, Infinity][i % 5];
    const expected = oldMovement.walkSegment(bot, destination, range, distance);
    assert.deepEqual(
      newMovement.walkSegment(bot, destination, range, distance),
      expected,
      `corridor ${kind}/${i}`,
    );
    if (expected) walkable++;
    corridors++;
  }
}
assert.ok(walkable > 1000);

let time = 0,
  terrainKind = 0,
  blocking = false;
function movingBot() {
  const controls = {};
  const bot = {
    entity: {
      position: new Vec3(0.5, 64, 0.5),
      velocity: new Vec3(0, 0, 0),
      width: 0.6,
      yaw: -Math.PI / 2,
      onGround: true,
    },
    pathfinder: { defaultMoveSettings: { allowSprinting: true, allowJumpSprint: true } },
    swordpvp: { ticksToNextAttack: 5 },
    blockAt: (point) => terrain(terrainKind, point),
    setControlState: (name, value) => {
      controls[name] = value;
    },
    getControlState: (name) => controls[name],
  };
  return { bot, controls, target: { position: new Vec3(10, 64, 0.5), width: 0.6, height: 1.8 } };
}
const left = movingBot(),
  right = movingBot();
const settings = current("./combat-defaults.json");
const options = { now: () => time, blocking: () => blocking };
const original = oldFootwork.createCombatFootwork(left.bot, settings, options);
const optimized = newFootwork.createCombatFootwork(right.bot, settings, options);
let controlTicks = 0;
for (let tick = 0; tick < 4000; tick++) {
  time = tick * 50;
  terrainKind = Math.floor(tick / 250) % 8;
  blocking = tick % 40 < 5;
  if (tick % 250 === 0) {
    original.reset();
    optimized.reset();
  }
  const position = new Vec3(
    Math.sin(tick / 50) * 4,
    64 + Math.max(0, Math.sin(tick / 4)) * 1.2,
    0.5,
  );
  const target = new Vec3(
    position.x + 1.1 + 8 * (1 + Math.sin(tick / 27)),
    64 + Math.max(0, Math.sin(tick / 8)) * 1.4,
    0.5 + Math.sin(tick / 14),
  );
  const velocity = position.minus(left.bot.entity.position);
  for (const f of [left, right]) {
    f.bot.entity.position = position.clone();
    f.bot.entity.velocity = velocity.clone();
    f.bot.entity.onGround = position.y === 64;
    f.bot.entity.yaw = -Math.PI / 2 + Math.sin(tick / 17) * 0.4;
    f.bot.swordpvp.ticksToNextAttack = 11 - (tick % 13);
    f.target.position = target.clone();
  }
  const decision = {
    visible: tick % 43 !== 0,
    facing: tick % 31 > 2,
    action: tick % 19 === 0 ? "punish" : "pressure",
  };
  const expected = original.tick(left.target, decision);
  assert.equal(optimized.tick(right.target, decision), expected, `direct routing ${tick}`);
  assert.deepEqual(right.controls, left.controls, `controls ${tick}`);
  assert.deepEqual(optimized.lead, original.lead, `lead ${tick}`);
  if (tick % 13 === 0) {
    original.attacked();
    optimized.attacked();
  }
  controlTicks++;
}

const rigRequire = createRequire(new URL("pathfinding/package.json", extension));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("pathfinding/tsconfig.json", extension)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const oldPearls = before("./pearls.cjs"),
  newPearls = current("./pearls.cjs");
let pearlFlights = 0,
  pearlPlans = 0;
for (const version of ["1.20.4", "26.1.2"]) {
  for (const kind of ["flat", "wall", "water", "lava", "slabs", "entity"]) {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(-0.5, 64, -0.5), {
      renderDistance: 4,
    });
    rig.stopPassivePhysics();
    const bot = rig.bot;
    bot.physicsEnabled = false;
    bot.entity.onGround = true;
    if (kind === "wall")
      for (let z = -4; z <= 4; z++)
        for (let y = 64; y <= 69; y++) world.setBlock(new Vec3(8, y, z), "stone");
    if (kind === "water" || kind === "lava" || kind === "slabs")
      for (let x = 5; x <= 10; x++)
        for (let z = -3; z <= 3; z++)
          world.setBlock(new Vec3(x, 64, z), kind === "slabs" ? "stone_slab" : kind);
    if (kind === "entity")
      bot.entities[200] = {
        id: 200,
        name: "player",
        position: new Vec3(10, 65, -0.5),
        width: 0.6,
        height: 1.8,
      };
    try {
      for (const turn of [-0.1, 0, 0.1])
        for (let degrees = -24; degrees <= 72; degrees += 3) {
          const yaw = -Math.PI / 2 + turn,
            pitch = (degrees * Math.PI) / 180;
          assert.deepEqual(
            newPearls.simulatePearl(bot, yaw, pitch),
            oldPearls.simulatePearl(bot, yaw, pitch),
            `${version}/${kind}/${yaw}/${pitch}`,
          );
          pearlFlights++;
        }
      for (const exact of [false, true]) {
        const destination = new Vec3(exact ? 24.5 : 60.5, 64, -0.5);
        assert.deepEqual(
          newPearls.planPearl(bot, destination, settings, 2.5, exact),
          oldPearls.planPearl(bot, destination, settings, 2.5, exact),
          `${version}/${kind}/plan/${exact}`,
        );
        pearlPlans++;
      }
    } finally {
      rig.stopPassivePhysics();
    }
  }
}
const results = {
  corridors,
  walkable,
  controlTicks,
  pearlFlights,
  pearlPlans,
  allEquivalent: true,
};
writeFileSync(
  new URL("equivalence-results.json", import.meta.url),
  JSON.stringify(results, null, 2) + "\n",
);
console.log(results);
