import assert from "node:assert/strict";
import test from "node:test";
import { fixture, flush, runtime } from "./combat-utility-fixture.mjs";
const { createAutoTotem } = runtime("./auto-totem.cjs");
const { normalizeCombat } = runtime("./combat.cjs");
const { equipCombatItem, queueInventoryTask } = runtime("./combat-inventory.cjs");

function setup(version = "1.20.4", settings = {}) {
  const f = fixture(version);
  f.controller.dispose();
  let time = 0;
  const controller = createAutoTotem(f.bot, normalizeCombat(settings), {
    now: () => time,
    onStatus: (s) => f.statuses.push(s),
  });
  return {
    ...f,
    totem: controller,
    tick: async (at = time + 50) => {
      time = at;
      controller.tick();
      await controller.task;
      await flush();
    },
    dispose() {
      controller.dispose();
      f.dispose();
    },
  };
}

for (const version of ["1.20.4", "26.1.2"]) {
  test(`${version}: threshold, hysteresis and hold time protect a totem from shield replacement`, async () => {
    const f = setup(version, { totemHealth: 8, totemReleaseHealth: 14, totemHoldMs: 1000 });
    try {
      f.item(36, "diamond_sword");
      const shield = f.item(45, "shield");
      f.item(37, "totem_of_undying");
      f.bot.health = 8;
      await f.tick(0);
      assert.equal(f.bot.inventory.slots[45].name, "totem_of_undying");
      await equipCombatItem(f.bot, shield, "off-hand");
      assert.equal(
        f.bot.inventory.slots[45].name,
        "totem_of_undying",
        "combat cannot overwrite an active totem",
      );
      f.bot.health = 12;
      await f.tick(1500);
      assert.equal(f.totem.protected, true, "restore threshold is distinct from equip threshold");
      f.bot.health = 20;
      await f.tick(1600);
      assert.equal(f.bot.inventory.slots[45].name, "shield");
      assert.equal(f.totem.protected, false);
      assert.equal(f.bot.heldItem.name, "diamond_sword");
    } finally {
      f.dispose();
    }
  });

  test(`${version}: activation refills a consumed offhand totem using the next carried one`, async () => {
    const f = setup(version);
    try {
      f.item(45, "shield");
      f.item(37, "totem_of_undying");
      f.item(38, "totem_of_undying");
      f.bot.health = 6;
      await f.tick(0);
      const old = f.bot.inventory.slots[45];
      f.bot.inventory.slots[45] = null;
      f.bot.inventory.emit("updateSlot", 45, old, null);
      f.bot._client.emit("entity_status", { entityId: f.bot.entity.id, entityStatus: 35 });
      await f.totem.task;
      assert.equal(f.bot.inventory.slots[45]?.name, "totem_of_undying");
      assert.ok(f.statuses.some((s) => s.includes("activation confirmed")));
    } finally {
      f.dispose();
    }
  });
}

test("always mode keeps a totem at full health; disabled restore retains the owned totem", async () => {
  for (const settings of [{ totemMode: "always" }, { totemRestoreOffhand: false }]) {
    const f = setup("1.20.4", settings);
    try {
      f.item(45, "shield");
      f.item(37, "totem_of_undying");
      f.bot.health = 5;
      await f.tick(0);
      f.bot.health = 20;
      await f.tick(5000);
      assert.equal(f.bot.inventory.slots[45].name, "totem_of_undying");
      assert.equal(f.totem.protected, true);
    } finally {
      f.dispose();
    }
  }
});

test("crystal proximity equips at full health and respects its switch and distance", async () => {
  for (const [on, distance, expected] of [
    [true, 4, true],
    [true, 10, false],
    [false, 4, false],
  ]) {
    const f = setup("1.20.4", { totemOnCrystal: on, totemDangerRange: 6 });
    try {
      f.item(45, "shield");
      f.item(37, "totem_of_undying");
      f.bot.entities[3] = {
        id: 3,
        name: "end_crystal",
        position: f.bot.entity.position.offset(distance, 0, 0),
      };
      await f.tick(0);
      assert.equal(f.bot.inventory.slots[45].name === "totem_of_undying", expected);
    } finally {
      f.dispose();
    }
  }
});

test("only observed absorption can postpone the health threshold", async () => {
  for (const use of [true, false]) {
    const f = setup("26.1.2", { totemUseAbsorption: use, totemOnCrystal: false });
    try {
      f.item(45, "shield");
      f.item(37, "totem_of_undying");
      f.bot.health = 6;
      const keys = f.bot.registry.entitiesByName.player.metadataKeys;
      const index = keys.findIndex((k) =>
        ["player_absorption", "absorption", "absorption_amount"].includes(k),
      );
      assert.ok(index >= 0);
      f.bot.entity.metadata[index] = 8;
      await f.tick(0);
      assert.equal(f.bot.inventory.slots[45].name === "totem_of_undying", !use);
    } finally {
      f.dispose();
    }
  }
});

test("foreign container/cursor ownership defers a totem swap until the inventory is available", async () => {
  const f = setup();
  try {
    f.item(45, "shield");
    f.item(37, "totem_of_undying");
    f.bot.health = 5;
    f.bot.currentWindow = { id: 1 };
    await f.tick(0);
    assert.equal(f.bot.inventory.slots[45].name, "shield");
    f.bot.currentWindow = null;
    await f.tick(50);
    assert.equal(f.bot.inventory.slots[45].name, "totem_of_undying");
  } finally {
    f.dispose();
  }
});

test("disabled and legacy configurations never equip or lock the offhand", async () => {
  for (const [version, settings] of [
    ["1.8.9", {}],
    ["1.20.4", { autoTotem: false }],
    ["1.20.4", { enabled: false }],
  ]) {
    const f = setup(version, settings);
    try {
      if (version !== "1.8.9") {
        f.item(45, "shield");
        f.item(37, "totem_of_undying");
      }
      f.bot.health = 1;
      await f.tick(0);
      assert.equal(f.totem.protected, false);
      assert.equal(f.equips.length, 0);
    } finally {
      f.dispose();
    }
  }
});

test("dispose invalidates a queued totem equip and removes all added listeners", async () => {
  const f = setup();
  let release;
  try {
    f.item(45, "shield");
    f.item(37, "totem_of_undying");
    f.bot.health = 2;
    const gate = queueInventoryTask(
      f.bot,
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    await flush();
    f.totem.tick();
    const pending = f.totem.task;
    f.totem.dispose();
    release();
    await gate;
    await pending;
    assert.equal(f.bot.inventory.slots[45].name, "shield");
    assert.equal(f.bot.launcherAutoTotem, undefined);
    assert.equal(f.bot.listeners("physicsTick").includes(f.totem.tick), false);
  } finally {
    release?.();
    f.dispose();
  }
});

test("health events respond without waiting for the next physics tick", async () => {
  const f = setup();
  try {
    f.item(45, "shield");
    f.item(37, "totem_of_undying");
    f.bot.health = 4;
    f.bot.emit("health");
    await f.totem.task;
    assert.equal(f.bot.inventory.slots[45].name, "totem_of_undying");
  } finally {
    f.dispose();
  }
});
