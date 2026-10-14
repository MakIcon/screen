import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createGatheringController } from "./gathering.cjs";
import { installCombatProtocol } from "./combat.cjs";

const require = createRequire(import.meta.url);
const rigRequire = createRequire(new URL("./pathfinding/package.json", import.meta.url));
rigRequire("ts-node").register({
  project: fileURLToPath(new URL("./pathfinding/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const { createCacheWorld } = rigRequire("./tests/setup.ts");
const { Vec3 } = require("vec3");
const native = createRequire(require.resolve("mineflayer"));
const protocol = native("minecraft-protocol");

for (const version of ["1.8.8", "1.20.4", "26.1.2"]) {
  test(
    `deposit opens the visible chest face without sneaking and transfers real window slots on ${version}`,
    { timeout: 5000 },
    async (t) => {
      const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5));
      const bot = rig.bot;
      bot.physicsEnabled = false;
      bot.health = 20;
      bot.supportFeature = bot.registry.supportFeature;
      for (const plugin of ["entities", "inventory", "simple_inventory", "chest"])
        bot.loadPlugin(require(`mineflayer/lib/plugins/${plugin}`), { hideErrors: false });
      const Item = native("prismarine-item")(bot.registry);
      for (const [slot, name, count] of [
        [36, "iron_pickaxe", 1],
        [37, "bread", 8],
        [38, "diamond", 12],
        [39, "cobblestone", 64],
      ]) {
        const item = new Item(bot.registry.itemsByName[name].id, count);
        item.slot = slot;
        bot.inventory.slots[slot] = item;
      }
      bot.setQuickBarSlot(0);
      const chest = world.setBlock(new Vec3(5, 64, 0), "chest");
      bot.pathfinder = {
        world,
        defaultMoveSettings: { canDig: true, canPlace: true, maxDropDown: 3 },
        setMoveOptions(value) {
          Object.assign(this.defaultMoveSettings, value);
        },
        stop: async () => {},
        goto: async (goal) => {
          assert.equal(
            goal.isEnd({ exitPos: bot.entity.position }),
            false,
            "cannot interact through distance",
          );
          bot.entity.position = new Vec3(2.5, 64, 0.5);
          assert.equal(
            goal.isEnd({ exitPos: bot.entity.position }),
            true,
            "inset chest surface is reachable",
          );
          bot.setControlState("sneak", true); // Navigator arrives holding sneak.
        },
      };
      let tickFlushed = false;
      bot.waitForTicks = async () => {
        assert.equal(bot.getControlState("sneak"), false);
        tickFlushed = true;
      };
      const packets = [],
        deposited = [];
      const serializer = protocol.createSerializer({ state: "play", isServer: false, version });
      bot._client.state = "play";
      bot._client.write = (name, params) => {
        serializer.createPacketBuffer({ name, params });
        packets.push({ name, params });
        if (name === "block_place" && params.location.equals(chest.position)) {
          assert.equal(tickFlushed, true);
          assert.equal(bot.getControlState("sneak"), false);
          assert.equal(
            params.direction,
            4,
            "clicks the visible west face instead of the hidden top",
          );
          assert.ok((params.cursorX >= 0 && params.cursorX <= 1) || version === "1.8.8");
          setImmediate(() => {
            bot._client.emit("open_window", {
              windowId: 1,
              inventoryType: version === "1.8.8" ? "minecraft:chest" : 2,
              windowTitle: "Chest",
              slotCount: 27,
            });
            const items = Array(63).fill(null);
            for (let slot = 9; slot < 45; slot++)
              items[slot + 18] = Item.toNotch(bot.inventory.slots[slot]);
            bot._client.emit("window_items", {
              windowId: 1,
              stateId: 1,
              items: items.map((item) => item ?? Item.toNotch(null)),
              carriedItem: Item.toNotch(null),
            });
          });
        } else if (name === "window_click" && bot.supportFeature("transactionPacketExists")) {
          setImmediate(() =>
            bot._client.emit("transaction", {
              windowId: params.windowId,
              action: params.action,
              accepted: true,
            }),
          );
        } else if (name === "close_window") {
          deposited.push(
            ...bot.currentWindow.containerItems().map((item) => [item.name, item.count]),
          );
        }
      };
      installCombatProtocol(bot);
      const work = createGatheringController(bot, { operationTimeoutMs: 1500 });
      t.after(async () => {
        await work.dispose();
        rig.stopPassivePhysics();
      });
      work.setChest(chest.position);
      if (version !== "1.8.8") work.configureStorage([{ id: "native", name: "Склад", filters: ["#all"], chests: [chest.position] }]);
      work.enqueue({ kind: "deposit" });
      const until = Date.now() + 2500;
      while (!work.snapshot.history.length && Date.now() < until) {
        bot.emit("physicsTick");
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.equal(work.snapshot.history[0]?.outcome, "готово", JSON.stringify(work.snapshot));
      assert.equal(work.snapshot.history[0].deposited, 76);
      assert.deepEqual(deposited, [
        ["diamond", 12],
        ["cobblestone", 64],
      ]);
      assert.deepEqual(
        bot.inventory.items().map((item) => item.name),
        ["iron_pickaxe", "bread"],
      );
      assert.equal(bot.currentWindow, null);
      assert.equal(
        packets.some((packet) => packet.name === "window_click"),
        true,
      );
    },
  );
}
