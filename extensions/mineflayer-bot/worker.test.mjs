import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";
import worker from "./worker.cjs";

const require = createRequire(import.meta.url);
const mineflayerRequire = createRequire(require.resolve("mineflayer"));
const minecraftProtocol = mineflayerRequire("minecraft-protocol");

test('worker preserves separate survival switches and bounds thresholds', () => {
  const config = worker.parseConfig(JSON.stringify({ server: { host: 'localhost' }, account: { username: 'Bot' },
    survival: { autoEat: false, emergencyMlg: false, mlgPickupWater: false, autoEatMinHunger: 21, mlgMinFallHeight: 2 } }));
  assert.equal(config.survival.autoEat, false);
  assert.equal(config.survival.emergencyMlg, false);
  assert.equal(config.survival.mlgPickupWater, false);
  assert.equal(config.survival.autoEatMinHunger, 19);
  assert.equal(config.survival.mlgMinFallHeight, 4);
  assert.equal(config.movement.allowBucketWaterDrop, true);
});

test("preserves independent water drop switches in saved worker config", () => {
  const legacy = worker.parseConfig(
    JSON.stringify({ server: { host: "localhost" }, account: { username: "Bot" } }),
  );
  assert.equal(legacy.movement.allowWaterDrop, true);
  assert.equal(legacy.movement.allowBucketWaterDrop, true);
  const explicit = worker.parseConfig(
    JSON.stringify({
      server: { host: "localhost" },
      account: { username: "Bot" },
      movement: { allowWaterDrop: false, allowBucketWaterDrop: false },
    }),
  );
  assert.equal(explicit.movement.allowWaterDrop, false);
  assert.equal(explicit.movement.allowBucketWaterDrop, false);
});

test("reads config without closing stdin and keeps later chat messages, including split packets", async () => {
  const stream = new PassThrough();
  const lines = worker.createLauncherInput(stream);
  const initial = lines.next();
  stream.write('{"server":{"host":"localhost"},"account":{"username":"Bot"}}\n');
  const config = await initial;
  assert.equal(worker.parseConfig(config.value).server.host, "localhost");
  assert.equal(stream.readableEnded, false);

  const messages = [];
  const events = [];
  const handling = worker.handleLauncherMessages(
    lines,
    () => ({ chat: (message) => messages.push(message) }),
    (type, payload) => events.push({ type, ...payload }),
  );
  stream.write('{"type":"chat","requestId":"enter","message":"Привет');
  stream.write(' от бота"}\n{"type":"chat","requestId":"button","message":"/help"}\n');
  stream.end();
  await handling;
  assert.deepEqual(messages, ["Привет от бота", "/help"]);
  assert.deepEqual(
    events.map((event) => [event.type, event.requestId]),
    [
      ["chat_result", "enter"],
      ["chat_result", "button"],
    ],
  );
  assert.equal(
    events.every((event) => !event.error),
    true,
  );
});

test("keeps legacy config input ending at EOF compatible", async () => {
  const stream = new PassThrough();
  const lines = worker.createLauncherInput(stream);
  const initial = lines.next();
  stream.end('{"server":{"host":"localhost"},"account":{"username":"Bot"}}');
  assert.equal(worker.parseConfig((await initial).value).account.username, "Bot");
  assert.equal((await lines.next()).done, true);
});

test("structured storage requests apply complete groups privately, acknowledge errors and do not use the chat limit", async () => {
  const { normalizeStorageGroups } = require("./gathering-storage.cjs");
  let saved = [], remembered = null;
  const events = [], bot = { chat() { assert.fail("storage settings must never enter server chat"); },
    launcherGathering: { configureStorage(groups) { saved = normalizeStorageGroups(groups); return saved; } },
    launcherConfigureStorage(groups) { remembered = this.launcherGathering.configureStorage(groups); },
  };
  const groups = Array.from({ length: 10 }, (_, index) => ({ id: `group-${index}`, name: `Склад ${index}`, filters: ["#wood"],
    chests: [{ x: index, y: 64, z: 0 }, { x: index, y: 64, z: 2 }] }));
  await worker.handleLauncherMessages([
    JSON.stringify({ type: "storage_config", requestId: "good", groups }),
    JSON.stringify({ type: "storage_config", requestId: "bad", groups: [{ ...groups[0], filters: ["#invalid"] }] }),
  ], () => bot, (type, payload) => events.push({ type, ...payload }));
  assert.equal(saved.length, 10); assert.equal(remembered, saved);
  assert.equal(events[0].requestId, "good"); assert.equal(events[0].error, undefined);
  assert.match(events[1].error, /фильтр/);
});

test("rejects disconnected sends and uses the current bot after reconnection", async () => {
  let bot = null;
  const sent = [];
  const events = [];
  async function* messages() {
    yield JSON.stringify({ type: "chat", requestId: "offline", message: "Привет" });
    bot = { chat: (message) => sent.push(message) };
    yield JSON.stringify({ type: "chat", requestId: "online", message: "Снова здесь" });
  }
  await worker.handleLauncherMessages(
    messages(),
    () => bot,
    (type, payload) => events.push({ type, ...payload }),
  );
  assert.match(events[0].error, /не подключён/);
  assert.equal(events[1].requestId, "online");
  assert.equal(events[1].error, undefined);
  assert.deepEqual(sent, ["Снова здесь"]);
});

test("rejects invalid messages without truncating or sending them and continues after a send failure", async () => {
  const events = [];
  const sent = [];
  const inputs = [
    " ",
    "x".repeat(241),
    "first\nsecond",
    "§color",
    "😀".repeat(121),
    "failure",
    "  Привет  ",
  ];
  const bot = {
    chat(message) {
      if (message === "failure") throw new Error("connection closed");
      sent.push(message);
    },
  };
  const lines = inputs.map((message, index) =>
    JSON.stringify({ type: "chat", requestId: String(index), message }),
  );
  await worker.handleLauncherMessages(
    lines,
    () => bot,
    (type, payload) => events.push({ type, ...payload }),
  );
  assert.equal(
    events.slice(0, -1).every((event) => Boolean(event.error)),
    true,
  );
  assert.match(events[5].error, /connection closed/);
  assert.equal(events[6].error, undefined);
  assert.deepEqual(sent, ["Привет"]);
});

test("anti knockback is disabled for legacy configs and accepts only explicit true", () => {
  for (const [input, expected] of [
    [undefined, false],
    [false, false],
    [true, true],
    ["false", false],
  ]) {
    const config = worker.parseConfig(
      JSON.stringify({
        server: { host: "localhost" },
        account: { username: "Bot" },
        behavior: { antiKnockback: input },
      }),
    );
    assert.equal(config.behavior.antiKnockback, expected);
  }
});

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
      clockUpdates: [{ id: 0, totalTicks: 6000, partialTick: 0.5, rate: 1 }],
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
