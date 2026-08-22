import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";
import worker from "../src-tauri/resources/mineflayer-bot-worker.cjs";

const require = createRequire(import.meta.url);
const mineflayerRequire = createRequire(require.resolve("mineflayer"));
const minecraftProtocol = mineflayerRequire("minecraft-protocol");

const {
  compatibleTimePlugin,
  describeKickReason,
  formatReason,
  isPermanentConnectionError,
  protocolLongToBigInt,
} = worker;

const fabricKick = {
  type: "compound",
  value: {
    extra: {
      type: "list",
      value: {
        type: "compound",
        value: [
          {
            color: { type: "string", value: "green" },
            text: { type: "string", value: "Fabric Loader and Fabric API" },
          },
          { "": { type: "string", value: " installed on your client!" } },
          {
            extra: {
              type: "list",
              value: {
                type: "compound",
                value: [
                  { text: { type: "string", value: "xaerominimap" } },
                  { text: { type: "string", value: "xaeroworldmap" } },
                ],
              },
            },
            text: {
              type: "string",
              value: " Registry namespaces: ",
            },
          },
        ],
      },
    },
    text: { type: "string", value: "This server requires " },
  },
};

test("formats Fabric NBT kick reasons as readable text", () => {
  assert.equal(
    formatReason(fabricKick),
    "This server requires Fabric Loader and Fabric API installed on your client! Registry namespaces: xaerominimapxaeroworldmap",
  );
});

test("adds an actionable hint and treats Fabric mismatch as permanent", () => {
  const reason = describeKickReason(fabricKick);
  assert.match(reason, /Mineflayer cannot load Fabric client mods/);
  assert.equal(isPermanentConnectionError(reason), true);
});

test("keeps ordinary socket failures reconnectable", () => {
  assert.equal(isPermanentConnectionError("socketClosed"), false);
  assert.equal(isPermanentConnectionError("connect ECONNREFUSED"), false);
});

test("converts protocol i64 values without losing signed low bits", () => {
  assert.equal(protocolLongToBigInt([0, 12345]), 12345n);
  assert.equal(protocolLongToBigInt([-1, -1]), -1n);
  assert.equal(protocolLongToBigInt({ high: 1, low: 2 }), 4294967298n);
  assert.equal(protocolLongToBigInt(undefined, 99n), 99n);
});

test("reads Minecraft 26.1 world clock time packets", () => {
  const client = new EventEmitter();
  const bot = new EventEmitter();
  bot._client = client;
  compatibleTimePlugin(bot);

  let updates = 0;
  bot.on("time", () => updates++);
  client.emit("update_time", {
    age: [0, 12345],
    clockUpdates: [
      { id: 1, totalTicks: 50n, partialTick: 0, rate: 1 },
      { id: 0, totalTicks: 6000n, partialTick: 0.5, rate: 1 },
    ],
  });

  assert.equal(updates, 1);
  assert.equal(bot.time.bigTime, 6000n);
  assert.equal(bot.time.timeOfDay, 6000);
  assert.equal(bot.time.isDay, true);
  assert.equal(bot.time.bigAge, 12345n);
  assert.equal(bot.time.clockId, 0);
  assert.equal(bot.time.partialTick, 0.5);
  assert.equal(bot.time.rate, 1);
});

test("reads the actual protocol 775 update_time wire format", async () => {
  const serializer = minecraftProtocol.createSerializer({
    state: "play",
    isServer: true,
    version: "26.1.2",
  });
  const deserializer = minecraftProtocol.createDeserializer({
    state: "play",
    isServer: false,
    version: "26.1.2",
  });
  serializer.pipe(deserializer);

  const packetPromise = once(deserializer, "data");
  serializer.write({
    name: "update_time",
    params: {
      age: [0, 12345],
      clockUpdates: [
        { id: 0, totalTicks: 6000, partialTick: 0.5, rate: 1 },
      ],
    },
  });
  const [parsed] = await packetPromise;

  const client = new EventEmitter();
  const bot = new EventEmitter();
  bot._client = client;
  compatibleTimePlugin(bot);
  client.emit(parsed.data.name, parsed.data.params);

  assert.equal(protocolLongToBigInt(parsed.data.params.age), 12345n);
  assert.equal(bot.time.bigTime, 6000n);
  assert.equal(bot.time.bigAge, 12345n);
  assert.equal(bot.time.partialTick, 0.5);
});

test("keeps legacy Mineflayer time packets compatible", () => {
  const client = new EventEmitter();
  const bot = new EventEmitter();
  bot._client = client;
  compatibleTimePlugin(bot);

  client.emit("update_time", {
    age: [0, 24001],
    time: [-1, -6000],
    tickDayTime: false,
  });

  assert.equal(bot.time.bigTime, 6000n);
  assert.equal(bot.time.day, 0);
  assert.equal(bot.time.doDaylightCycle, false);
  assert.equal(bot.time.bigAge, 24001n);
  assert.equal(bot.time.clockId, null);
});
