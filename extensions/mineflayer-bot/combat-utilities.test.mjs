import assert from "node:assert/strict";
import test from "node:test";
import {
  fixture,
  flush,
  Vec3,
  createCombatController,
  touchingWebs,
} from "./combat-utility-fixture.mjs";

function setFire(f, value) {
  const keys = f.bot.registry.entitiesByName.player.metadataKeys ?? [];
  const index = keys.findIndex((k) => ["shared_flags", "entity_flags"].includes(k));
  f.bot.entity.metadata[index >= 0 ? index : 0] = value ? 1 : 0;
}

test("automatic escape prefers water for a single web even without a combat target", async () => {
  const f = fixture("26.1.2");
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    f.block(f.bot.entity.position.floored(), f.webName);
    await f.step(0, null);
    assert.equal(f.controller.kind, "water");
    assert.equal(f.uses()[0]?.held, "water_bucket");
    assert.equal(
      f.packets.some((p) => p.name === "block_dig"),
      false,
    );
  } finally {
    f.dispose();
  }
});

test("ground fire is extinguished before delayed burning metadata arrives", async () => {
  const f = fixture("26.1.2", { extinguishDelayMs: 0 });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    f.block(f.bot.entity.position.floored(), "fire");
    assert.equal(f.controller.extinguishNeeded, true);
    await f.step(0, null);
    assert.equal(f.controller.kind, "extinguish");
    assert.equal(f.uses()[0]?.held, "water_bucket");
  } finally {
    f.dispose();
  }
});

test("water counters adjacent hostile lava and stays until server-confirmed conversion", async () => {
  const f = fixture("26.1.2");
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    const lava = new Vec3(1, 64, 0),
      water = new Vec3(0, 64, 0);
    f.block(lava, "lava");
    assert.equal(f.controller.extinguishNeeded, true);
    await f.step(0, null);
    assert.equal(f.controller.kind, "coolLava");
    assert.equal(f.uses()[0]?.held, "water_bucket");
    f.acknowledgeFluid(water, "water");
    await f.step(50, null);
    await f.step(250, null);
    assert.equal(f.uses().length, 1, "do not remove water while lava remains");
    f.block(lava, "obsidian");
    await f.step(300, null);
    await f.step(350, null);
    assert.equal(f.uses()[1]?.held, "bucket");
    assert.ok(f.statuses.includes("PvP: lava neutralization confirmed"));
    f.acknowledgePickup(water, "water");
    await f.step(400, null);
    await f.step(450, null);
    assert.equal(f.controller.busy, false);
  } finally {
    f.dispose();
  }
});

test("lava counter respects its switch and never solidifies the bot's own attack source", async () => {
  const f = fixture("26.1.2", { extinguishLava: false, webTrap: false });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    f.block(new Vec3(1, 64, 0), "lava");
    await f.step(0, null);
    assert.equal(f.uses().length, 0);
  } finally {
    f.dispose();
  }
  const own = fixture("26.1.2", { webTrap: false });
  try {
    own.item(36, "diamond_sword");
    own.item(37, "lava_bucket");
    own.item(38, "water_bucket");
    await own.step(0);
    own.acknowledgeFluid(own.enemy.position.floored(), "lava");
    await own.step(50);
    assert.equal(own.controller.kind, "lava");
    assert.equal(own.uses().length, 1);
    assert.equal(own.controller.extinguishNeeded, false);
  } finally {
    own.dispose();
  }
});

test("web traps can be placed during a critical jump", async () => {
  const f = fixture("26.1.2");
  try {
    f.item(36, "diamond_sword");
    f.item(37, f.webName, 8);
    f.bot.entity.onGround = false;
    f.bot.entity.position.y += 0.4;
    await f.step(0);
    assert.equal(f.placements()[0]?.held, f.webName);
  } finally {
    f.dispose();
  }
});

test("a moving retreat leaves multiple webs behind instead of aiming only at a distant pursuer", async () => {
  const f = fixture("26.1.2", { retreatWebCooldownMs: 500 });
  try {
    f.bot.health = 10;
    f.enemy.position.x = 4.5;
    f.item(36, "diamond_sword");
    f.item(37, f.webName, 8);
    const options = { offensive: false, retreating: true };
    await f.step(0, f.enemy, options);
    f.block(new Vec3(1, 64, 0), f.webName);
    await f.step(50, f.enemy, options);
    await f.step(100, f.enemy, options);
    f.bot.entity.position.x = -1.5;
    f.enemy.position.x = 2.5;
    await f.step(550, f.enemy, options);
    assert.equal(f.placements().length, 2);
    const packet = f.placements()[1].params;
    assert.ok(packet.location.x < 1, "the next web follows the bot's new position");
    assert.equal(f.bot.blockAt(new Vec3(-2, 64, 0)).name, "air", "the bot's own cell stays clear");
  } finally {
    f.dispose();
  }
});

test("an explicitly selected owner can be webbed", async () => {
  const f = fixture("26.1.2");
  f.controller.dispose();
  let controller;
  try {
    f.enemy.username = "Owner";
    f.item(36, "diamond_sword");
    f.item(37, f.webName, 8);
    controller = createCombatController(
      f.bot,
      { style: "melee", adaptiveCombat: false, bowEnabled: false, maceDefense: false },
      {
        loadPlugins: false,
        isOwner: (name) => name === "Owner",
        now: () => 0,
        onError: (e) => {
          throw e;
        },
      },
    );
    controller.select(f.enemy);
    f.bot.emit("physicsTick");
    await flush();
    await flush();
    assert.equal(f.placements()[0]?.held, f.webName);
  } finally {
    controller?.dispose();
    f.dispose();
  }
});

test("the web escape master disables both tools without disabling independent extinguishing", async () => {
  const f = fixture("1.20.4", { webEscape: false });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    f.block(f.bot.entity.position.floored(), f.webName);
    await f.step(0);
    assert.equal(f.controller.busy, false);
    assert.equal(f.uses().length, 0);
    assert.equal(f.placements().length, 0);
    assert.equal(
      f.packets.some((p) => p.name === "block_dig" && p.params.status === 0),
      false,
    );
    assert.equal(f.equips.length, 0);
    setFire(f, true);
    await f.step(100);
    await f.step(250);
    assert.equal(f.controller.kind, "extinguish");
    assert.equal(f.uses()[0]?.held, "water_bucket");
  } finally {
    f.dispose();
  }
});

test("the custom recovery switch selects standard or configured server confirmation timing", async () => {
  for (const custom of [false, true]) {
    const f = fixture("1.20.4", {
      webTrap: false,
      utilityRecoverySettings: custom,
      utilityConfirmTimeoutMs: 5000,
    });
    try {
      f.item(36, "diamond_sword");
      f.item(37, "lava_bucket");
      await f.step(0);
      await f.step(1600);
      assert.equal(f.controller.busy, custom);
      assert.equal(f.uses().length, 1, "both modes still require server placement confirmation");
    } finally {
      f.dispose();
    }
  }
});

test("self-extinguishing reacts after its configured delay and waits for the fire to clear before pickup", async () => {
  const f = fixture("1.20.4", { extinguishDelayMs: 100 });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    setFire(f, true);
    await f.step(0, null);
    await f.step(99, null);
    assert.equal(f.uses().length, 0);
    await f.step(100, null);
    assert.equal(f.uses()[0]?.held, "water_bucket");
    const cell = f.bot.entity.position.floored();
    f.acknowledgeFluid(cell, "water");
    await f.step(150, null);
    await f.step(300, null);
    assert.equal(
      f.uses().length,
      1,
      "do not collect water while server metadata still reports fire",
    );
    setFire(f, false);
    await f.step(350, null);
    await f.step(400, null);
    assert.equal(f.uses()[1]?.held, "bucket");
    f.acknowledgePickup(cell, "water");
    await f.step(450, null);
    await f.step(500, null);
    assert.equal(f.bot.heldItem.name, "diamond_sword");
    assert.equal(f.controller.busy, false);
  } finally {
    f.dispose();
  }
});

test("extinguishing respects HP, resistance, Nether and disabled settings", async () => {
  for (const reason of ["health", "resistance", "nether", "disabled"]) {
    const f = fixture("1.20.4", {
      autoExtinguish: reason !== "disabled",
      extinguishHealth: reason === "health" ? 8 : 20,
    });
    try {
      f.item(36, "diamond_sword");
      f.item(37, "water_bucket");
      setFire(f, true);
      if (reason === "nether") f.bot.game.dimension = "the_nether";
      if (reason === "resistance") {
        const id =
          f.bot.registry.effectsByName.FireResistance?.id ??
          f.bot.registry.effectsByName.fire_resistance?.id;
        assert.ok(Number.isInteger(id));
        f.bot.entity.effects[id] = { id, amplifier: 0, duration: 100 };
      }
      await f.step(0, null);
      await f.step(1000, null);
      assert.equal(f.uses().length, 0, reason);
    } finally {
      f.dispose();
    }
  }
});

test("a ground fire outline places extinguishing water above the fire instead of predicting the floor cell", async () => {
  const f = fixture("1.20.4", { extinguishDelayMs: 0 });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    setFire(f, true);
    const feet = f.bot.entity.position.floored();
    f.block(feet, "fire");
    await f.step(0, null);
    f.acknowledgeFluid(feet.offset(0, 1, 0), "water");
    f.block(feet, "air");
    await f.step(50, null);
    assert.ok(f.statuses.includes("PvP: water placement confirmed"));
    setFire(f, false);
    await f.step(200, null);
    await f.step(250, null);
    assert.equal(f.uses()[1]?.held, "bucket");
  } finally {
    f.dispose();
  }
});

test("water stays until a fire block touching the body is washed away, even if entity fire metadata already cleared", async () => {
  const f = fixture("1.20.4", { extinguishDelayMs: 0 });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    setFire(f, true);
    const feet = f.bot.entity.position.floored();
    f.block(feet, "fire");
    await f.step(0, null);
    f.acknowledgeFluid(feet.offset(0, 1, 0), "water");
    await f.step(50, null);
    setFire(f, false);
    await f.step(200, null);
    await f.step(250, null);
    assert.equal(f.uses().length, 1);
    f.block(feet, "air");
    await f.step(300, null);
    await f.step(350, null);
    assert.equal(f.uses()[1]?.held, "bucket");
  } finally {
    f.dispose();
  }
});

test("water can deliberately be left after confirmed extinguishing", async () => {
  const f = fixture("1.20.4", { extinguishDelayMs: 0, extinguishPickupWater: false });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    setFire(f, true);
    await f.step(0, null);
    const cell = f.bot.entity.position.floored();
    f.acknowledgeFluid(cell, "water");
    await f.step(50, null);
    setFire(f, false);
    await f.step(200, null);
    await f.step(250, null);
    assert.equal(f.uses().length, 1);
    assert.equal(f.bot.blockAt(cell).name, "water");
    assert.equal(f.bot.heldItem.name, "diamond_sword");
    assert.equal(f.controller.busy, false);
  } finally {
    f.dispose();
  }
});

test("a vanished water source while still burning never reports successful extinguishing", async () => {
  const f = fixture("1.20.4", { extinguishDelayMs: 0 });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    setFire(f, true);
    await f.step(0, null);
    const cell = f.bot.entity.position.floored();
    f.acknowledgeFluid(cell, "water");
    await f.step(50, null);
    f.block(cell, "air");
    await f.step(250, null);
    assert.ok(!f.statuses.includes("PvP: extinguishing confirmed"));
  } finally {
    f.dispose();
  }
});

test("retreat webs occupy the clear path behind the bot and never chain offensive lava", async () => {
  const f = fixture("1.20.4");
  try {
    f.bot.health = 10;
    f.item(36, "diamond_sword");
    f.item(37, f.webName, 8);
    f.item(38, "lava_bucket");
    await f.step(0, f.enemy, { offensive: false, retreating: true });
    assert.equal(f.placements()[0]?.held, f.webName);
    assert.equal(f.controller.kind, "retreatWeb");
    f.block(new Vec3(1, 64, 0), f.webName);
    await f.step(50, f.enemy, { offensive: false, retreating: true });
    await f.step(100, f.enemy, { offensive: false, retreating: true });
    assert.ok(f.statuses.includes("PvP: retreat cobweb confirmed; resuming retreat"));
    assert.equal(f.uses().length, 0);
    assert.equal(f.bot.heldItem.name, "diamond_sword");
  } finally {
    f.dispose();
  }
});

test("retreat traps respect health, pursuer range, reserve and their own enable switch", async () => {
  for (const reason of ["health", "distance", "reserve", "disabled"]) {
    const f = fixture("1.20.4", {
      retreatWeb: reason !== "disabled",
      retreatWebHealth: 10,
      retreatWebDistance: reason === "distance" ? 1 : 4.5,
      retreatWebReserve: reason === "reserve" ? 2 : 0,
    });
    try {
      f.item(36, "diamond_sword");
      f.item(37, f.webName, 2);
      f.bot.health = reason === "health" ? 20 : 8;
      await f.step(0, f.enemy, { offensive: false, retreating: true });
      assert.equal(f.placements().length, 0, reason);
    } finally {
      f.dispose();
    }
  }
});

test("the adaptive combat director places a defensive web before starting its healing retreat", async () => {
  const f = fixture();
  f.controller.dispose();
  let time = 0,
    controller;
  try {
    f.bot.health = 8;
    f.item(36, "diamond_sword");
    f.item(37, "golden_apple");
    f.item(38, f.webName, 4);
    f.bot.launcherSurvival = { busy: false, requestCombatHeal: () => false };
    f.bot.swordpvp = {
      target: null,
      attack: async (e) => {
        f.bot.swordpvp.target = e;
      },
      stop: () => {
        f.bot.swordpvp.target = null;
      },
    };
    f.bot.pvp = { target: null, forceStop: () => {} };
    controller = createCombatController(
      f.bot,
      { style: "melee", maceDefense: false, bowEnabled: false },
      {
        loadPlugins: false,
        now: () => time,
        onError: (e) => {
          throw e;
        },
      },
    );
    controller.select(f.enemy);
    f.bot.emit("physicsTick");
    await controller.idleTask;
    await flush();
    assert.equal(controller.decision.action, "retreat");
    assert.equal(f.placements()[0]?.held, f.webName);
    f.block(new Vec3(1, 64, 0), f.webName);
    time = 50;
    f.bot.emit("physicsTick");
    await controller.idleTask;
    await flush();
    assert.equal(f.bot.heldItem.name, "diamond_sword");
  } finally {
    controller?.dispose();
    f.dispose();
  }
});

test("escape preference selects water for one web or a sword for several webs", async () => {
  for (const mode of ["sword", "water"]) {
    const f = fixture("1.20.4", { webEscapeMode: mode });
    try {
      f.item(36, "diamond_sword");
      f.item(37, "water_bucket");
      const cell = f.bot.entity.position.floored();
      f.block(cell, f.webName);
      if (mode === "sword") f.block(cell.offset(0, 1, 0), f.webName);
      await f.step(0);
      assert.equal(f.uses().length, mode === "water" ? 1 : 0);
      assert.equal(
        f.packets.some((p) => p.name === "block_dig" && p.params.status === 0),
        mode === "sword",
      );
    } finally {
      f.dispose();
    }
  }
});

test("lava HP, distance and contact-time settings affect actual bucket actions", async () => {
  for (const reason of ["health", "distance", "hold"]) {
    const f = fixture("1.20.4", {
      webTrap: false,
      lavaMinHealth: reason === "health" ? 20 : 8,
      lavaMaxDistance: reason === "distance" ? 1 : 4,
      lavaHoldMs: 1000,
    });
    try {
      f.bot.health = 19;
      f.item(36, "diamond_sword");
      f.item(37, "lava_bucket");
      await f.step(0);
      assert.equal(f.uses().length, reason === "hold" ? 1 : 0);
      if (reason === "hold") {
        f.acknowledgeFluid(f.enemy.position.floored(), "lava");
        await f.step(50);
        await f.step(500);
        assert.equal(f.uses().length, 1);
        await f.step(1050);
        await f.step(1100);
        assert.equal(f.uses().length, 2);
      }
    } finally {
      f.dispose();
    }
  }
});

for (const version of ["1.8.9", "1.20.4", "26.1.2"]) {
  test(`${version}: lava is placed, acknowledged, briefly held, collected and the sword restored`, async () => {
    const f = fixture(version, { webTrap: false });
    try {
      f.item(36, "diamond_sword");
      f.item(37, "lava_bucket");
      await f.step(0);
      assert.equal(f.uses().length, 1);
      assert.equal(f.uses()[0].held, "lava_bucket");
      assert.equal(
        f.packets[f.packets.indexOf(f.uses()[0]) - 1].name,
        "look",
        "publish aim before use",
      );
      await f.step(200);
      assert.equal(
        f.uses().length,
        1,
        "no pickup before server confirms placement and empty bucket",
      );
      f.acknowledgeFluid(f.enemy.position.floored(), "lava");
      await f.step(250);
      await f.step(450);
      assert.equal(
        f.uses().length,
        1,
        "allow contact ignition instead of immediately undoing placement",
      );
      await f.step(500);
      await f.step(550);
      assert.equal(f.uses().length, 2);
      assert.equal(f.uses()[1].held, "bucket");
      f.acknowledgePickup(f.enemy.position.floored(), "lava");
      await f.step(600);
      await f.step(650);
      assert.equal(f.bot.heldItem.name, "diamond_sword");
      assert.equal(f.controller.busy, false);
      assert.ok(f.statuses.includes("PvP: recovered lava bucket"));
      await f.step(1000);
      assert.equal(f.uses().length, 2, "cooldown prevents bucket spam");
    } finally {
      f.dispose();
    }
  });

  test(`${version}: web trap is confirmed before a web/lava combination`, async () => {
    const f = fixture(version);
    try {
      f.item(36, "diamond_sword");
      f.item(37, f.webName, 16);
      f.item(38, "lava_bucket");
      await f.step(0);
      assert.equal(f.placements().length, 1);
      assert.equal(f.placements()[0].held, f.webName);
      await f.step(50);
      assert.equal(f.uses().length, 0);
      f.block(f.enemy.position.floored(), f.webName);
      await f.step(100);
      await f.step(150);
      assert.equal(f.uses().length, 1);
      assert.equal(f.uses()[0].held, "lava_bucket");
      assert.ok(f.statuses.includes("PvP: cobweb placement confirmed"));
    } finally {
      f.dispose();
    }
  });

  test(`${version}: a sword mines the web intersecting the player's bounding box`, async () => {
    const f = fixture(version, { lavaBucket: false, webTrap: false });
    try {
      f.item(36, "diamond_axe");
      f.item(37, "diamond_sword");
      f.bot.entity.position.x = 0.85;
      const web = new Vec3(1, 64, 0);
      f.block(web, f.webName);
      assert.equal(
        touchingWebs(f.bot).length,
        1,
        "detect a web touching the body outside the feet block",
      );
      await f.step(0);
      const dig = f.packets.find((p) => p.name === "block_dig" && p.params.status === 0);
      assert.ok(dig);
      assert.equal(dig.held, "diamond_sword");
      assert.ok(dig.params.location.equals(web));
      f.block(web, "air");
      await flush();
      await f.step(100);
      assert.equal(f.controller.busy, false);
      assert.equal(f.bot.heldItem.name, "diamond_axe");
    } finally {
      f.dispose();
    }
  });

  test(`${version}: water escape confirms fluid, clears the web and retrieves its source`, async () => {
    const f = fixture(version, { lavaBucket: false, webTrap: false });
    try {
      f.item(36, "diamond_axe");
      f.item(37, "water_bucket");
      const cell = f.bot.entity.position.floored();
      f.block(cell, f.webName);
      await f.step(0);
      assert.equal(f.uses()[0]?.held, "water_bucket");
      const source = cell.offset(0, 1, 0);
      f.acknowledgeFluid(source, "water");
      f.block(cell, "air"); // server flow washes away the web below the source
      await f.step(50);
      await f.step(100);
      await f.step(150);
      assert.equal(f.uses()[1]?.held, "bucket");
      f.acknowledgePickup(source, "water");
      await f.step(200);
      await f.step(250);
      assert.equal(touchingWebs(f.bot).length, 0);
      assert.equal(f.bot.heldItem.name, "diamond_axe");
      assert.equal(f.controller.busy, false);
    } finally {
      f.dispose();
    }
  });
}

test("several webs prefer water and maintain escape movement until the remaining web clears", async () => {
  const f = fixture("1.20.4", { lavaBucket: false, webTrap: false });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    const cell = f.bot.entity.position.floored();
    f.block(cell, f.webName);
    f.block(cell.offset(0, 1, 0), f.webName);
    await f.step(0);
    assert.equal(f.uses()[0]?.held, "water_bucket");
    f.acknowledgeFluid(cell.offset(0, 2, 0), "water");
    f.block(cell, "air");
    f.bot.entity.isInWater = true;
    await f.step(50);
    await f.step(100);
    assert.equal(f.bot.getControlState("forward"), true);
    assert.equal(f.bot.getControlState("sprint"), true);
    assert.equal(f.uses().length, 1, "keep water while still trapped");
    f.block(cell.offset(0, 1, 0), "air");
    await f.step(150);
    await f.step(200);
    assert.equal(f.uses()[1]?.held, "bucket");
  } finally {
    f.dispose();
  }
});

test("a server retaining a head web after water placement permits sword rescue before source cleanup", async () => {
  const f = fixture("1.20.4", { lavaBucket: false, webTrap: false });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    const cell = f.bot.entity.position.floored();
    f.block(cell, f.webName);
    f.block(cell.offset(0, 1, 0), f.webName);
    await f.step(0);
    f.acknowledgeFluid(cell.offset(0, 2, 0), "water");
    await f.step(50);
    await f.step(5100); // the server has not washed away either web
    await f.step(5150);
    assert.ok(
      f.packets.some(
        (p) => p.name === "block_dig" && p.params.status === 0 && p.held === "diamond_sword",
      ),
    );
    assert.equal(f.uses().length, 1, "do not try picking up fluid through the remaining web");
  } finally {
    f.dispose();
  }
});

test("Nether water is skipped and escape falls back to the available sword", async () => {
  const f = fixture();
  try {
    f.bot.game.dimension = "the_nether";
    f.item(36, "water_bucket");
    const cell = f.bot.entity.position.floored();
    f.block(cell, f.webName);
    assert.equal(await f.step(0), false);
    assert.equal(f.uses().length, 0);
    f.item(37, "iron_sword");
    await f.step(50);
    assert.ok(
      f.packets.some(
        (p) => p.name === "block_dig" && p.params.status === 0 && p.held === "iron_sword",
      ),
    );
  } finally {
    f.dispose();
  }
});

test("no lava is poured next to the bot, an owner, water, a wall or an unsupported edge", async () => {
  for (const hazard of ["self", "owner", "water", "wall", "edge"]) {
    const f = fixture("1.20.4", { webTrap: false });
    try {
      f.item(36, "diamond_sword");
      f.item(37, "lava_bucket");
      if (hazard === "self") f.enemy.position.x = 1.5;
      if (hazard === "owner")
        f.bot.entities[3] = { id: 3, username: "Owner", position: new Vec3(3.5, 64, 0.5) };
      if (hazard === "water") f.block(new Vec3(3, 64, 0), "water");
      if (hazard === "wall") {
        f.block(new Vec3(1, 64, 0), "stone");
        f.block(new Vec3(1, 65, 0), "stone");
      }
      if (hazard === "edge") f.block(new Vec3(3, 63, 0), "air");
      await f.step(0);
      assert.equal(f.uses().length, 0, hazard);
    } finally {
      f.dispose();
    }
  }
});

test("cancelled delayed aim never places lava or restores an item over emergency water", async () => {
  const f = fixture("1.20.4", { webTrap: false });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "lava_bucket");
    let release;
    f.bot.lookAt = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    await f.step(0);
    assert.ok(release);
    f.controller.cancel();
    f.bot.launcherSurvival = { busy: true };
    f.item(36, "water_bucket");
    release();
    await f.controller.task;
    assert.equal(f.uses().length, 0);
    assert.equal(f.bot.heldItem.name, "water_bucket");
    assert.equal(f.bot.launcherCombatUtility, false);
  } finally {
    f.dispose();
  }
});

test("an owner entering the source square during aim cancels lava placement", async () => {
  const f = fixture("1.20.4", { webTrap: false });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "lava_bucket");
    const look = f.bot.lookAt;
    f.bot.lookAt = async (...args) => {
      await look(...args);
      f.bot.entities[3] = { id: 3, username: "Owner", position: f.enemy.position.clone() };
    };
    await f.step(0);
    await f.step(50);
    assert.equal(f.uses().length, 0);
    assert.equal(f.bot.heldItem.name, "diamond_sword");
  } finally {
    f.dispose();
  }
});

test("target loss still collects a committed lava source, including a delayed placement acknowledgement", async () => {
  const f = fixture("1.20.4", { webTrap: false });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "lava_bucket");
    await f.step(0);
    f.controller.cancel();
    await f.step(50, null);
    assert.equal(f.uses().length, 1);
    f.acknowledgeFluid(f.enemy.position.floored(), "lava");
    await f.step(100, null);
    await f.step(150, null);
    assert.equal(f.uses().length, 2);
    assert.equal(f.uses()[1].held, "bucket");
  } finally {
    f.dispose();
  }
});

test("denied bucket placement backs off without pretending to have collected lava", async () => {
  const f = fixture("1.20.4", { webTrap: false });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "lava_bucket");
    await f.step(0);
    for (let at = 50; at < 4000; at += 50) await f.step(at);
    assert.equal(f.uses().length, 1);
    assert.ok(!f.statuses.includes("PvP: recovered lava bucket"));
    assert.equal(f.bot.heldItem.name, "diamond_sword");
  } finally {
    f.dispose();
  }
});

test("a failed sword attempt falls back to water without repeatedly restarting digging", async () => {
  const f = fixture("1.20.4", { lavaBucket: false, webTrap: false, webEscapeMode: "sword" });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    f.block(f.bot.entity.position.floored(), f.webName);
    f.bot.dig = async () => {
      throw new Error("server refused digging");
    };
    await f.step(0);
    assert.equal(f.uses().length, 0, "try the explicitly preferred sword first");
    await f.step(600);
    assert.equal(f.uses()[0]?.held, "water_bucket");
  } finally {
    f.dispose();
  }
});

test("disabled utility settings preserve ordinary combat with carried buckets and webs", async () => {
  const f = fixture("1.20.4", {
    lavaBucket: false,
    webTrap: false,
    webEscapeSword: false,
    webEscapeWater: false,
  });
  try {
    f.item(36, "diamond_sword");
    f.item(37, "water_bucket");
    f.item(38, "lava_bucket");
    f.item(39, f.webName, 16);
    f.block(f.bot.entity.position.floored(), f.webName);
    assert.equal(await f.step(0), false);
    assert.equal(f.packets.length, 0);
    assert.equal(f.bot.launcherCombatUtility, undefined);
  } finally {
    f.dispose();
  }
});

for (const engine of ["custom", "basic"]) {
  test(`combat controller pauses ${engine} melee for utility actions and resumes the same target`, async () => {
    const f = fixture();
    f.controller.dispose();
    let controller;
    try {
      f.item(36, "diamond_sword");
      f.item(37, "lava_bucket");
      const attacks = [];
      f.bot.swordpvp = {
        target: null,
        attack: async (e) => {
          f.bot.swordpvp.target = e;
          attacks.push(e);
        },
        stop: () => {
          f.bot.swordpvp.target = null;
        },
      };
      f.bot.pvp = {
        target: null,
        attack: async (e) => {
          f.bot.pvp.target = e;
          attacks.push(e);
        },
        forceStop: () => {
          f.bot.pvp.target = null;
        },
      };
      controller = createCombatController(
        f.bot,
        {
          engine,
          style: "melee",
          webTrap: false,
          adaptiveCombat: false,
          bowEnabled: false,
          maceDefense: false,
        },
        {
          loadPlugins: false,
          now: () => time,
          onError: (error) => {
            throw error;
          },
        },
      );
      let time = 0;
      const step = async (at) => {
        time = at;
        f.setTime(at);
        f.bot.emit("physicsTick");
        await flush();
        await flush();
      };
      controller.select(f.enemy);
      await step(0);
      assert.equal(f.uses()[0]?.held, "lava_bucket");
      assert.equal(attacks.length, 0);
      f.acknowledgeFluid(f.enemy.position.floored(), "lava");
      await step(50);
      await step(300);
      await step(350);
      f.acknowledgePickup(f.enemy.position.floored(), "lava");
      await step(400);
      await step(450);
      await step(500);
      assert.equal(f.bot.heldItem.name, "diamond_sword");
      assert.equal(attacks.at(-1), f.enemy);
      assert.equal(f.bot.launcherCombatUtility, false);
    } finally {
      controller?.dispose();
      f.dispose();
    }
  });
}
