import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import worker from "./worker.cjs";
import pathfinder from "./pathfinder.cjs";

const require = createRequire(new URL("./pathfinding/package.json", import.meta.url));
require("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
});
const { createCacheWorld, createFlatWorld } = require("./tests/setup.ts");
const { Vec3 } = require("vec3");

test(
  "bundled worker swims to shore before building to a floating platform",
  { timeout: 26000 },
  async (t) => {
    const world = createFlatWorld("26.1.2", 56, { renderDistance: 2 });
    for (let x = -16; x <= 20; x++)
      for (let z = -6; z <= 6; z++)
        for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
    for (let x = 8; x <= 13; x++)
      for (let z = -2; z <= 2; z++) world.setBlock(new Vec3(x, 63, z), "stone");
    for (let x = 0; x <= 2; x++) world.setBlock(new Vec3(x, 71, 0), "stone");
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 62, 0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    let shore = false;
    rig.bot.on("physicsTick", () => {
      if (
        rig.bot.entity.onGround &&
        rig.bot.entity.position.x >= 7.7 &&
        rig.bot.entity.position.y >= 64
      )
        shore = true;
    });
    const place = rig.bot._placeBlockWithOptions;
    rig.bot._placeBlockWithOptions = (...args) => {
      assert.ok(shore);
      return place(...args);
    };
    try {
      const navigator = worker.configurePathfinder(rig.bot, { allowParkour: false, canDig: false });
      t.signal.addEventListener(
        "abort",
        () => {
          void navigator.stop();
        },
        { once: true },
      );
      await navigator.goto(new pathfinder.goals.GoalFollowEntity(new Vec3(1.5, 72, 0.5), 0.7));
      assert.equal(shore, true);
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(rig.bot.entity.position.distanceTo(new Vec3(1.5, 72, 0.5)) < 0.8);
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "bundled worker preserves ice momentum instead of extending a five-block gap",
  { timeout: 7000 },
  async () => {
    const world = createFlatWorld("26.1.2", -64, { renderDistance: 1 });
    for (let x = 0; x <= 6; x++) world.setBlock(new Vec3(x, 63, 0), x >= 5 ? "blue_ice" : "stone");
    for (let x = 12; x <= 15; x++) world.setBlock(new Vec3(x, 63, 0), "stone");
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(5.5, 64, 0.5), { world });
    rig.bot.entity.velocity = new Vec3(0.38, -0.0784, 0);
    rig.bot.entity.onGround = true;
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    const routes = [];
    rig.bot.on("pathGenerated", (result) => routes.push(...result.path));
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowParkour: true,
        allowSprinting: true,
        canDig: false,
      });
      await navigator.goto(new pathfinder.goals.GoalBlock(13, 64, 0));
      assert.ok(routes.some((move) => move.moveType.constructor.name === "MomentumJump"));
      assert.ok(routes.every((move) => move.toPlace.length === 0));
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(13, 64, 0)));
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "bundled worker leaves water and builds up to the owner on a bridge with parkour and digging off",
  { timeout: 15000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 56, { renderDistance: 1 });
    for (let x = -3; x <= 12; x++)
      for (let z = -3; z <= 3; z++)
        for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
    for (let y = 56; y <= 67; y++) world.setBlock(new Vec3(5, y, 0), "stone");
    for (let x = 3; x <= 8; x++) world.setBlock(new Vec3(x, 67, 0), "stone");
    const { rig } = createCacheWorld(version, 64, new Vec3(3.5, 62, 0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    const placed = [];
    const place = rig.bot._placeBlockWithOptions;
    rig.bot._placeBlockWithOptions = (reference, face, ...args) => {
      assert.ok(reference.shapes.length > 0, "Placement must have a real solid anchor");
      placed.push(reference.position.plus(face));
      return place(reference, face, ...args);
    };
    const routes = [];
    rig.bot.on("pathGenerated", (result) => routes.push(...result.path));
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowSprinting: true,
        allowParkour: false,
        canDig: false,
        maxDropDown: 3,
      });
      t.signal.addEventListener(
        "abort",
        () => {
          void navigator.stop();
        },
        { once: true },
      );
      const owner = { position: new Vec3(5.5, 68, 0.5) };
      await navigator.goto(
        pathfinder.goals.GoalFollowEntity.fromEntity(owner, 0.8, { neverfinish: false }),
      );
      assert.ok(
        rig.bot.entity.position.distanceTo(owner.position) <= 0.85,
        String(rig.bot.entity.position),
      );
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(placed.length > 0);
      assert.ok(
        routes.some(
          (move) => move.moveType.constructor.name === "ForwardJump" && move.toPlace.length > 0,
        ),
      );
      assert.ok(routes.every((move) => move.toBreak.length === 0));
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "worker defaults to floating after a high water drop from an existing bridge with digging off",
  { timeout: 14000 },
  async (t) => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 56, { renderDistance: 1 });
    for (let x = -3; x <= 12; x++)
      for (let z = -3; z <= 3; z++) {
        for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), "water");
      }
    for (let x = 0; x <= 4; x++) world.setBlock(new Vec3(x, 83, 0), "stone");
    const { rig } = createCacheWorld(version, 84, new Vec3(3.5, 84, 0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64);
    rig.bot.inventory.slots[9].slot = 9;
    const routes = [];
    rig.bot.on("pathGenerated", (result) =>
      routes.push(
        result.path.map((m) => ({
          waterLanding: m.metadata?.waterLanding === true,
          breaks: m.toBreak.length,
          places: m.toPlace.length,
        })),
      ),
    );
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: false,
        maxDropDown: 3,
      });
      t.signal.addEventListener(
        "abort",
        () => {
          void navigator.stop();
        },
        { once: true },
      );
      await navigator.goto(
        new pathfinder.goals.GoalFollowEntity(new Vec3(8.5, 63, 0.5), 1, { neverfinish: false }),
      );
      assert.ok(routes.flat().some((m) => m.waterLanding));
      assert.ok(
        routes.flat().every((m) => m.breaks === 0 && m.places === 0),
        "Use the ocean instead of extending the bridge",
      );
      await rig.bot.waitForTicks(20);
      assert.equal(world.getBlock(rig.bot.entity.position.offset(0, 1.62, 0))?.name, "air");
      assert.ok(rig.bot.entity.position.y > 62.7, String(rig.bot.entity.position));
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "worker honors disabled STAY ON WATER and disconnect removes the overlay",
  { timeout: 2500 },
  async () => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 56, { renderDistance: 1 });
    for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(0, y, 0), "water");
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 61, 0.5), { world });
    const originalSet = rig.bot.setControlState;
    try {
      worker.configurePathfinder(
        rig.bot,
        {
          allowSprinting: false,
          allowParkour: false,
          canDig: false,
          maxDropDown: 3,
        },
        { stayOnWater: false },
      );
      assert.equal(rig.bot.setControlState, originalSet);
      await rig.bot.waitForTicks(20);
      assert.equal(rig.bot.getControlState("jump"), false);
      assert.ok(rig.bot.entity.position.y < 61);
      pathfinder.installSurfaceSwimming(rig.bot);
      assert.notEqual(rig.bot.setControlState, originalSet);
      rig.bot.emit("end");
      assert.equal(rig.bot.setControlState, originalSet);
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "bundled worker climbs a short ladder beside azalea with digging and building enabled",
  { timeout: 10000 },
  async () => {
    const version = "26.1.2";
    const world = createFlatWorld(version, 64, { renderDistance: 1 });
    const { mcData, Block } = require("./tests/setup/mc-data.ts").loadMcData(version);
    const data = mcData.blocksByName.ladder;
    let state;
    for (let id = data.minStateId; id <= data.maxStateId; id++) {
      const props = Block.fromStateId(id, 0).getProperties();
      if (props.facing === "west" && !props.waterlogged) {
        state = id;
        break;
      }
    }
    assert.ok(state != null);
    for (let y = 64; y <= 67; y++) {
      world.setBlock(new Vec3(2, y, 0), "cobblestone");
      if (y === 65 || y === 66) world.setBlock(new Vec3(1, y, 0), state);
    }
    world.setBlock(new Vec3(0, 64, 1), "azalea");
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 64, -0.5), { world });
    const Item = require("prismarine-item")(rig.mcData);
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 32);
    rig.bot.inventory.slots[9].slot = 9;
    const routes = [];
    rig.bot.on("pathGenerated", (result) =>
      routes.push(
        result.path.map((m) => ({
          provider: m.moveType.constructor.name,
          breaks: m.toBreak.length,
          places: m.toPlace.length,
        })),
      ),
    );
    const digs = [];
    const dig = rig.bot.dig;
    rig.bot.dig = (block, ...args) => {
      digs.push(block.position.clone());
      return dig(block, ...args);
    };
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: true,
        maxDropDown: 3,
      });
      await navigator.goto(new pathfinder.goals.GoalBlock(2, 68, 0));
      assert.ok(
        rig.bot.entity.position.floored().equals(new Vec3(2, 68, 0)),
        String(rig.bot.entity.position),
      );
      assert.equal(rig.bot.entity.onGround, true);
      assert.ok(routes.flat().some((m) => m.provider === "Climb"));
      assert.ok(routes.flat().every((m) => m.breaks === 0 && m.places === 0));
      assert.deepEqual(digs, []);
      assert.equal(world.getBlock(new Vec3(0, 64, 1))?.name, "azalea");
      assert.equal(world.getBlock(new Vec3(1, 66, 0))?.name, "ladder");
      assert.equal(world.getBlock(new Vec3(2, 67, 0))?.name, "cobblestone");
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

for (const version of ["1.20.4", "26.1.2"]) {
  test(
    `worker uses the bundled rewrite and honors movement settings on ${version}`,
    { timeout: 6000 },
    async () => {
      const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
      const sprintRequests = [];
      const setControl = rig.bot.setControlState;
      rig.bot.setControlState = (name, value) => {
        if (name === "sprint" && value) sprintRequests.push(value);
        setControl(name, value);
      };
      try {
        const navigator = worker.configurePathfinder(rig.bot, {
          allowSprinting: false,
          allowParkour: false,
          canDig: false,
          maxDropDown: 2,
        });
        assert.equal(navigator.movements.has(pathfinder.movementProviders.ParkourForward), false);
        assert.equal(navigator.movements.has(pathfinder.movementProviders.ParkourDiagonal), false);
        for (const name of [
          "NeoProvider",
          "MomentumJump",
          "LadderForward",
          "LadderDiagonal",
          "LadderLandingForward",
          "LadderLandingDiagonal",
          "AroundCornerDiagonal",
        ]) {
          assert.equal(navigator.movements.has(pathfinder.movementProviders[name]), false, name);
        }
        assert.equal(navigator.defaultMoveSettings.canDig, false);
        assert.equal(navigator.defaultMoveSettings.canPlace, true);
        assert.equal(navigator.defaultMoveSettings.allow1by1towers, true);
        assert.equal(navigator.defaultMoveSettings.maxDropDown, 2);
        await navigator.goto(new pathfinder.goals.GoalNear(5, 64, 0, 1));
        assert.ok(rig.bot.entity.position.distanceTo(new Vec3(5, 64, 0)) <= 1.1);
        assert.equal(navigator.currentGoal, undefined);
        assert.deepEqual(sprintRequests, []);
      } finally {
        await rig.bot.pathfinder?.destroy();
        rig.stopPassivePhysics();
      }
    },
  );
}

test(
  "bundled worker executes a Neo facing the landing on Minecraft 26.1.2",
  { timeout: 8000 },
  async () => {
    const world = createFlatWorld("26.1.2", -64, { renderDistance: 1 });
    for (let x = 0; x < 10; x++) world.setBlock(new Vec3(x, 63, 0), "stone");
    for (let y = 64; y <= 65; y++) world.setBlock(new Vec3(3, y, 0), "stone");
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { world });
    const used = [];
    const facing = [];
    const pitches = [];
    rig.bot.on("physicsTick", () => {
      const move = rig.bot.pathfinder?.currentMove;
      if (move?.moveType.constructor.name !== "NeoProvider" || rig.bot.entity.onGround) return;
      const delta = move.exitPos.minus(rig.bot.entity.position);
      delta.y = 0;
      const yaw = rig.bot.entity.yaw;
      facing.push(new Vec3(-Math.sin(yaw), 0, -Math.cos(yaw)).dot(delta.normalize()));
      pitches.push(rig.bot.entity.pitch);
    });
    rig.bot.on("pathGenerated", (result) =>
      used.push(...result.path.map((move) => move.moveType.constructor.name)),
    );
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: false,
        maxDropDown: 3,
      });
      await navigator.goto(new pathfinder.goals.GoalBlock(7, 64, 0));
      assert.ok(used.includes("NeoProvider"));
      assert.ok(
        facing.length > 5 && facing.every((dot) => dot > 0.45),
        `Look direction: ${facing}`,
      );
      assert.ok(
        pitches.every((pitch) => pitch < 0),
        "Look down at the landing floor",
      );
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(7, 64, 0)));
      assert.ok(rig.bot.listenerCount("blockUpdate") <= 3);
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);

test(
  "bundled worker climbs twisting vines with parkour disabled on 26.1.2",
  { timeout: 9000 },
  async () => {
    const world = createFlatWorld("26.1.2", 64, { renderDistance: 1 });
    for (let y = 64; y <= 67; y++) {
      world.setBlock(new Vec3(2, y, 0), "stone");
      world.setBlock(new Vec3(1, y, 0), y === 67 ? "twisting_vines" : "twisting_vines_plant");
    }
    const { rig } = createCacheWorld("26.1.2", 64, new Vec3(0.5, 64, 0.5), { world });
    const used = [];
    rig.bot.on("pathGenerated", (result) =>
      used.push(...result.path.map((move) => move.moveType.constructor.name)),
    );
    try {
      const navigator = worker.configurePathfinder(rig.bot, {
        allowSprinting: false,
        allowParkour: false,
        canDig: false,
        maxDropDown: 2,
      });
      assert.ok(navigator.movements.has(pathfinder.movementProviders.Climb));
      await navigator.goto(new pathfinder.goals.GoalBlock(2, 68, 0));
      assert.ok(used.includes("Climb"), used.join(","));
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(2, 68, 0)));
      assert.equal(rig.bot.entity.onGround, true);
    } finally {
      await rig.bot.pathfinder?.destroy();
      rig.stopPassivePhysics();
    }
  },
);
