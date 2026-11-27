import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import worker from './worker.cjs';
import fabricSupport from './fabric.cjs';

const require = createRequire(import.meta.url);
const { startServer, openMenu } = require('./vendor/mineflayer-fabric/test/server.js');
const { moddedRegistries } = require('./vendor/mineflayer-fabric/test/fixtures.js');
const { CHANNELS } = require('./mineflayer-fabric.cjs');
const fixtureFeatures = { features: ['minecraft:vanilla'] };
const fixtureTags = { tags: [{ tagType: 'minecraft:block', tags: [{ tagName: 'minecraft:infiniburn_overworld', entries: [1] }] }] };

function launchWorker(t, port, connection = {}, version, settings = {}) {
  const child = spawn(process.execPath, ['--no-deprecation', process.env.SCREEN_MINEFLAYER_WORKER || fileURLToPath(new URL('./worker.cjs', import.meta.url))], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const events = [], output = new EventEmitter();
  let pending = '', stderr = '', closed = false;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => { stderr += data; });
  child.stdout.on('data', data => {
    pending += data;
    let end;
    while ((end = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      if (!line.trim()) continue;
      try { events.push(JSON.parse(line)); } catch { stderr += line; }
      output.emit('update');
    }
  });
  child.on('error', error => { stderr += error.message; closed = true; output.emit('update'); });
  child.on('close', () => { closed = true; output.emit('update'); });
  t.after(async () => {
    if (!closed) { const stopped = once(child, 'close'); child.kill(); await stopped; }
  });
  child.stdin.write(JSON.stringify({
    server: { host: '127.0.0.1', port, version }, ownerName: 'Owner',
    account: { mode: 'offline', username: 'FabricBot' },
    connection: { autoReconnect: false, ...connection }, combat: { enabled: false },
    survival: { autoEat: false, emergencyMlg: false },
    ...settings,
  }) + '\n');
  async function waitFor(predicate) {
    while (!predicate(events)) {
      assert.equal(closed, false, `worker exited: ${JSON.stringify(events)} ${stderr}`);
      await once(output, 'update', { signal: t.signal });
    }
  }
  return { child, events, waitFor, get stderr() { return stderr; } };
}

for (const [version, era] of [
  ['1.16.5', 'play-nbt'], ['1.20.1', 'play-direct-only'],
  ['1.21.4', 'config-direct-attributes'], ['26.1', 'config-sync'],
]) {
  test(`launcher worker spawns with mod registries on Fabric ${version}`, { timeout: 20000 }, async t => {
    const { port, seen } = await startServer(t, { version, era, registries: moddedRegistries(version), splitSize: 4096 });
    const running = launchWorker(t, port);
    await running.waitFor(events => events.some(e => e.type === 'ready') && events.some(e => e.message?.includes('Fabric registry sync complete')));
    assert.deepEqual(running.events.filter(e => e.type === 'error'), []);
    assert.ok(running.events.some(e => e.message?.includes('Fabric mod data adapted')));
    assert.deepEqual(seen.errors, []);
    assert.equal(seen.acks, era.startsWith('play') ? 0 : 1);
    assert.doesNotMatch(running.stderr, /(?:TypeError|ReferenceError|RangeError|Error:)/);
  });
}

for (const version of ['1.8.8', '1.20.4', '26.1']) {
  test(`launcher worker keeps ordinary ${version} servers free of Fabric announcements`, { timeout: 20000 }, async t => {
    const { port, seen } = await startServer(t, { version });
    const running = launchWorker(t, port);
    await running.waitFor(events => events.some(e => e.type === 'ready'));
    assert.deepEqual(running.events.filter(e => e.type === 'error'), []);
    assert.equal(seen.payloads.some(p => p.channel.startsWith('fabric:') || p.channel === CHANNELS.register), false);
    assert.equal(running.events.some(e => e.message?.startsWith('Fabric ')), false);
    assert.deepEqual(seen.errors, []);
  });
}

async function startJava263(t, onJoin) {
    const require263 = createRequire(require.resolve('@wp2508/mineflayer'));
    const protocol = require263('minecraft-protocol');
    const data = require263('minecraft-data')('26.3');
    const Chunk = require263('prismarine-chunk')('26.3');
    const Item = require263('prismarine-item')(require263('prismarine-registry')('26.3'));
    const chunk = new Chunk({ minY: -64, worldHeight: 384 });
    const { Vec3 } = require('vec3');
    chunk.setBlockStateId(new Vec3(0, 63, 0), data.blocksByName.stone.minStateId);
    const server = protocol.createServer({
      'online-mode': false, version: '26.3', port: 0, host: '127.0.0.1',
      beforeLogin(client) {
        const write = client.write.bind(client);
        client.write = (name, packet) => {
          if (name === 'finish_configuration') {
            write('feature_flags', fixtureFeatures);
            write('tags', fixtureTags);
          }
          return write(name, name === 'success' ? { ...packet, sessionId: client.uuid } : packet);
        };
      },
    });
    t.after(() => server.close());
    await once(server, 'listening');
    const errors = [];
    server.on('connection', client => client.on('error', error => errors.push(error)));
    server.on('playerJoin', client => {
      client.write('login', { ...data.loginPacket, entityId: client.id, onlineMode: false });
      onJoin(client, { Item, data, chunk, Vec3 });
      client.write('update_health', { health: 20, food: 20, foodSaturation: 5 });
      client.write('position', { x: 0.5, y: 64, z: 0.5, yaw: 0, pitch: 0, flags: 0, teleportId: 1, dx: 0, dy: 0, dz: 0 });
      const items = Array.from({ length: 46 }, () => Item.toNotch(null));
      items[36] = Item.toNotch(new Item(data.itemsByName.stone.id, 4));
      client.write('window_items', { windowId: 0, stateId: 3, items, carriedItem: Item.toNotch(null) });
      client.write('map_chunk', {
        x: 0, z: 0, heightmaps: [], chunkData: chunk.dump(), blockEntities: [],
        skyLightMask: Buffer.alloc(0), blockLightMask: Buffer.alloc(0),
        emptySkyLightMask: Buffer.alloc(0), emptyBlockLightMask: Buffer.alloc(0), skyLight: [], blockLight: [],
      });
    });
    return { server, protocol, require263, errors, port: server.socketServer.address().port };
}

for (const configuredVersion of ['26.3', undefined]) {
  test(`launcher worker spawns and acknowledges world ticks on 26.3 (${configuredVersion ? 'explicit' : 'automatic'})`, { timeout: 20000 }, async t => {
    const updates = new EventEmitter();
    let gameClient, loaded = false, ticks = 0, jumped = false;
    const { port, errors } = await startJava263(t, client => {
      gameClient = client;
      client.on('player_loaded', () => { loaded = true; updates.emit('change'); });
      client.on('tick_end', () => { ticks++; updates.emit('change'); });
      client.on('player_input', ({ inputs }) => {
        if (inputs.jump) { jumped = true; updates.emit('change'); }
      });
    });
    const running = launchWorker(t, port, {}, configuredVersion);
    await running.waitFor(events => events.some(e => e.type === 'ready') && events.some(e => e.type === 'inventory'));
    while (!loaded || ticks < 3) await once(updates, 'change', { signal: t.signal });
    running.child.stdin.write(JSON.stringify({ type: 'command', requestId: 'jump-26.3', message: 'jump' }) + '\n');
    while (!jumped) await once(updates, 'change', { signal: t.signal });
    assert.equal(gameClient.protocolVersion, 777);
    assert.equal(gameClient.username, 'FabricBot');
    assert.ok(running.events.some(e => e.type === 'minecraft_catalog' && e.catalog.version === '26.3'));
    assert.deepEqual(running.events.filter(e => e.type === 'error'), []);
    assert.deepEqual(errors, []);
  });
}

test('the Java 26.3 worker equips a mixed set and drops every slot with modern item hashes', { timeout: 20000 }, async t => {
  let game, makeItem;
  const clicks = [];
  const { port, errors } = await startJava263(t, (client, { Item, data }) => {
    game = client;
    makeItem = (name, damage) => {
      const item = new Item(data.itemsByName[name].id, 1);
      if (damage) item.components.push({ type: 'damage', data: damage });
      return Item.toNotch(item);
    };
    client.on('window_click', packet => clicks.push(packet));
  });
  const running = launchWorker(t, port, {}, '26.3');
  const slots = () => running.events.findLast(e => e.type === 'bot_inventory')?.inventory.slots;
  await running.waitFor(events => events.some(e => e.type === 'ready') && slots()?.[36]?.name === 'stone');
  const set = ['copper_helmet', 'iron_chestplate', 'chainmail_leggings', 'diamond_boots'];
  for (const [index, name] of set.entries())
    game.write('set_player_inventory', { slotId: index + 9, contents: makeItem(name, index === 3 ? 13 : 0) });
  game.write('set_player_inventory', { slotId: 14, contents: makeItem('iron_axe') });
  game.write('set_player_inventory', { slotId: 40, contents: makeItem('shield') });
  await running.waitFor(() => set.every((name, index) => slots()?.[index + 5]?.name === name) &&
    slots()?.[14]?.name === 'iron_axe' && slots()?.[45]?.name === 'shield');
  assert.equal(slots()[8].maxDurability - slots()[8].durability, 13);
  assert.ok(clicks.some(packet => packet.cursorItem?.components?.some(component => component.type === 'damage')),
    'durability from the server stays in the hashed component patch while equipping');

  const items = slots().filter(Boolean).map(({ slot, count, fingerprint }) => ({ slot, count, fingerprint }));
  running.child.stdin.write(JSON.stringify({ type: 'inventory_drop', requestId: 'drop-26.3', items }) + '\n');
  await running.waitFor(events => events.some(e => e.type === 'chat_result' && e.requestId === 'drop-26.3'));
  const result = running.events.find(e => e.type === 'chat_result' && e.requestId === 'drop-26.3');
  assert.equal(result.error, undefined, JSON.stringify(result));
  await running.waitFor(() => slots().every(item => item === null));
  assert.deepEqual(clicks.filter(packet => packet.mode === 4).map(packet => packet.slot), items.map(item => item.slot));
  assert.deepEqual(running.events.filter(e => e.type === 'error'), []);
  assert.deepEqual(errors, []);
});

test('the Java 26.3 worker uses the iron axe on the nearby trunk instead of crossing the forest', { timeout: 18000 }, async t => {
  let game, makeItem;
  const digs = [], yawBeforeDig = new Set();
  const { port, errors } = await startJava263(t, (client, { Item, data, chunk, Vec3 }) => {
    game = client;
    makeItem = name => Item.toNotch(new Item(data.itemsByName[name].id, 1));
    for (let x = 0; x <= 12; x++) for (let z = 0; z <= 6; z++)
      chunk.setBlockStateId(new Vec3(x, 63, z), data.blocksByName.stone.defaultState);
    for (const [x, z] of [[2, 1], [10, 3]]) for (let y = 64; y <= 66; y++)
      chunk.setBlockStateId(new Vec3(x, y, z), data.blocksByName.oak_log.defaultState);
    client.on('block_dig', packet => {
      digs.push(packet);
      client.write('acknowledge_player_digging', { sequenceId: packet.sequence });
      if (packet.status === 3) client.write('block_change', { location: packet.location, type: data.blocksByName.air.defaultState });
    });
    client.on('look', packet => {
      if (!digs.length) yawBeforeDig.add(Math.round(packet.yaw));
    });
  });
  const running = launchWorker(t, port, {}, '26.3', { movement: { allowParkour: true, allowSprinting: true } });
  const inventory = () => running.events.findLast(e => e.type === 'bot_inventory')?.inventory;
  await running.waitFor(events => events.some(e => e.type === 'ready') && inventory()?.slots[36]?.name === 'stone');
  game.write('set_player_inventory', { slotId: 0, contents: makeItem('stick') });
  game.write('set_player_inventory', { slotId: 14, contents: makeItem('iron_axe') });
  await running.waitFor(() => inventory()?.slots[36]?.name === 'stick' && inventory()?.slots[14]?.name === 'iron_axe');
  running.child.stdin.write(JSON.stringify({ type: 'command', requestId: 'aim-26.3', message: 'work aim on 100' }) + '\n');
  await running.waitFor(events => events.some(e => e.type === 'chat_result' && e.requestId === 'aim-26.3'));
  assert.equal(running.events.find(e => e.type === 'chat_result' && e.requestId === 'aim-26.3').error, undefined);
  running.child.stdin.write(JSON.stringify({ type: 'command', requestId: 'wood-26.3', message: 'forest 14 2 logs plain' }) + '\n');
  await running.waitFor(events => events.some(e => e.type === 'gathering' && e.gathering.history?.at(-1)?.mined === 2));
  assert.equal(inventory().slots[inventory().selectedSlot].name, 'iron_axe');
  assert.ok(yawBeforeDig.size >= 4, '26.3 receives intermediate rotations before the first dig');
  assert.deepEqual(digs.filter(packet => packet.status === 0).map(p => p.location), [
    { x: 2, y: 64, z: 1 },
    { x: 2, y: 65, z: 1 },
  ]);
  assert.deepEqual(running.events.filter(e => e.type === 'error'), []);
  assert.deepEqual(errors, []);
});

test('the Java 26.3 worker sends punch when attacking with Custom PvP', { timeout: 15000 }, async t => {
  let game, data;
  const { port, errors } = await startJava263(t, (client, setup) => {
    game = client;
    data = setup.data;
  });
  const running = launchWorker(t, port, {}, '26.3', { combat: { enabled: true, engine: 'custom', style: 'melee' } });
  await running.waitFor(events => events.some(e => e.type === 'ready'));
  game.write('spawn_entity', { entityId: 42, objectUUID: '7a924d83-7d88-4e00-a41c-bdfd9c9d6417',
    type: data.entitiesByName.zombie.id, x: 2.2, y: 64, z: 0.5, velocity: { x: 0, y: 0, z: 0 },
    pitch: 0, yaw: 0, headPitch: 0, objectData: 0 });
  const strike = once(game, 'attack', { signal: t.signal });
  const swing = once(game, 'punch', { signal: t.signal });
  running.child.stdin.write(JSON.stringify({ type: 'command', requestId: 'attack-26.3', message: 'attack zombie' }) + '\n');
  await running.waitFor(events => events.some(e => e.type === 'chat_result' && e.requestId === 'attack-26.3'));
  const result = running.events.find(e => e.type === 'chat_result' && e.requestId === 'attack-26.3');
  assert.equal(result.error, undefined, JSON.stringify(result));
  await swing;
  const [packet] = await strike;
  assert.equal(packet.entityId, 42);
  assert.deepEqual(running.events.filter(e => e.type === 'error'), []);
  assert.deepEqual(errors, []);
});

test('a Java 26.3 viewer can take and return control without reconnecting the bot', { timeout: 15000 }, async t => {
  const changes = new EventEmitter();
  const modeChanges = [], receivedPositions = [], relayErrors = [], joins = [];
  const operatorCommands = Buffer.from([
    0x10, 3,                                 // declare_commands, three nodes
    0, 1, 1,                                 // root with child 1
    1, 1, 2, 4, ...Buffer.from('test'),       // literal with child 2
    6, 0, 3, ...Buffer.from('arg'), 59,       // executable argument with an unmapped 26.3 parser
    0,                                       // root index
  ]);
  let gameSequence;
  const { protocol, require263, port, errors } = await startJava263(t, client => {
    joins.push(client);
    client.writeRaw(operatorCommands);
    client.on('position', position => { receivedPositions.push(position); changes.emit('update'); });
    client.on('block_dig', packet => {
      gameSequence = packet.sequence;
      client.write('acknowledge_player_digging', { sequenceId: gameSequence });
    });
  });
  const mineflayer = require('@wp2508/mineflayer');
  const { createPlayerControl } = require('./player-control.cjs');
  const { nameToMcOfflineUUID } = require263('minecraft-protocol/src/datatypes/uuid');
  const ownerId = nameToMcOfflineUUID('TestOwner').replaceAll('-', '');
  const otherId = nameToMcOfflineUUID('NotTheOwner').replaceAll('-', '');
  const profiles = new Map([[ownerId, 'TestOwner'], [otherId, 'NotTheOwner']]);
  const joined = new Map();
  const sessionService = createServer(async (request, response) => {
    if (request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const { accessToken, selectedProfile, serverId } = JSON.parse(Buffer.concat(chunks));
      if (accessToken !== `test-token-${selectedProfile}` || !profiles.has(selectedProfile)) {
        response.writeHead(403).end();
        return;
      }
      joined.set(serverId, selectedProfile);
      response.writeHead(204).end();
      return;
    }
    const query = new URL(request.url, 'http://127.0.0.1').searchParams;
    const id = joined.get(query.get('serverId'));
    const name = profiles.get(id);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(name === query.get('username') ? { id, name, properties: [] } : {}));
  });
  sessionService.listen(0, '127.0.0.1');
  t.after(() => sessionService.close());
  await once(sessionService, 'listening');
  const yggdrasil = createRequire(require263.resolve('minecraft-protocol'))('yggdrasil');
  const realSessionService = yggdrasil.server;
  yggdrasil.server = options => realSessionService({ ...options, host: `http://127.0.0.1:${sessionService.address().port}` });
  t.after(() => { yggdrasil.server = realSessionService; });
  const bot = mineflayer.createBot({ host: '127.0.0.1', port, version: '26.3', username: 'TestOwner' });
  t.after(() => bot.end());
  const initialCommands = once(bot._client, 'declare_commands', { signal: t.signal });
  let resumed = 0;
  const relay = createPlayerControl(bot, {
    accountUuid: ownerId,
    prepare: async () => () => { resumed++; },
    onStatus: status => { modeChanges.push(status); changes.emit('update'); },
    onError: error => { relayErrors.push(error); changes.emit('update'); },
  });
  t.after(() => relay.close());
  await Promise.all([initialCommands, once(bot, 'spawn', { signal: t.signal })]);
  relay.start();
  async function waitFor(predicate) {
    while (!predicate()) {
      assert.deepEqual(relayErrors, []);
      await once(changes, 'update', { signal: t.signal });
    }
  }
  await waitFor(() => modeChanges.at(-1)?.address);
  const localPort = Number(modeChanges.at(-1).address.split(':')[1]);
  const connect = uuid => protocol.createClient(worker.createBotOptions({
    server: { host: '127.0.0.1', port: localPort, version: '26.3' },
    connection: {},
    account: { mode: 'microsoft', username: profiles.get(uuid), uuid, accessToken: `test-token-${uuid}` },
  }));
  const stranger = connect(otherId);
  await once(stranger, 'end', { signal: t.signal });
  assert.equal(modeChanges.at(-1).mode, 'bot');

  const client = connect(ownerId);
  t.after(() => client.end());
  client.on('error', error => { relayErrors.push(error); changes.emit('update'); });
  const handshake = [], receivedCommands = [];
  client.on('packet', (packet, { state, name }, _raw, fullBuffer) => {
    if (state === 'configuration') handshake.push({ name, packet });
    if (state === 'play' && name === 'declare_commands') {
      receivedCommands.push(fullBuffer);
      changes.emit('update');
    }
  });
  let teleports = 0, avatar = false, loadedChunks = 0, inventory, localSequence;
  client.on('spawn_entity', packet => { avatar = Boolean(packet.objectUUID); changes.emit('update'); });
  client.on('map_chunk', () => { loadedChunks++; changes.emit('update'); });
  client.on('window_items', packet => { inventory = packet; changes.emit('update'); });
  client.on('acknowledge_player_digging', packet => { localSequence = packet.sequenceId; changes.emit('update'); });
  client.on('position', ({ teleportId, x, y, z, yaw, pitch }) => {
    client.write('teleport_confirm', { teleportId, x, y, z, yaw, pitch });
    teleports++;
    changes.emit('update');
  });
  await waitFor(() => modeChanges.at(-1).mode === 'camera' && avatar && loadedChunks && teleports > 0 && receivedCommands.length === 1);
  assert.deepEqual(receivedCommands[0], operatorCommands);
  assert.ok(handshake.some(({ name }) => name === 'registry_data'));
  assert.deepEqual(handshake.slice(-3).map(({ name }) => name), ['feature_flags', 'tags', 'finish_configuration']);
  assert.deepEqual(handshake.at(-3).packet, fixtureFeatures);
  assert.deepEqual(handshake.at(-2).packet, fixtureTags);
  const flags = { onGround: true, hasHorizontalCollision: false };
  client.write('position', { x: 12, y: 64, z: 0.5, flags });
  client.chat('.take');
  await waitFor(() => modeChanges.at(-1).mode === 'player' && teleports > 1 && inventory);
  joins[0].writeRaw(operatorCommands);
  await waitFor(() => receivedCommands.length === 2);
  assert.deepEqual(receivedCommands[1], operatorCommands);
  assert.equal(inventory.stateId, 3);
  assert.equal(inventory.items[36].itemCount, 4);
  client.write('position', { x: 3, y: 64, z: 0.5, flags });
  await waitFor(() => receivedPositions.some(position => position.x === 3));
  assert.equal(bot.entity.position.x, 3);
  assert.equal(receivedPositions.some(position => position.x === 12), false);
  const { getNextSequence } = require263('./lib/interaction_sequence.js');
  const previousSequence = getNextSequence(bot);
  client.write('block_dig', { status: 0, location: { x: 2, y: 63, z: 0 }, face: 1, sequence: 1 });
  await waitFor(() => localSequence !== undefined);
  assert.equal(gameSequence, previousSequence + 1);
  assert.equal(localSequence, 1);
  client.chat('.bot');
  await waitFor(() => modeChanges.at(-1).mode === 'camera');
  assert.equal(resumed, 1);
  client.chat('.camera');
  await waitFor(() => teleports > 2);
  client.chat('.take');
  await waitFor(() => modeChanges.at(-1).mode === 'player');
  client.end();
  await waitFor(() => modeChanges.at(-1).mode === 'bot');
  assert.equal(resumed, 2);
  assert.equal(joins.length, 1);
  assert.equal(joins[0].state, 'play');
  assert.deepEqual(errors, []);
  assert.deepEqual(relayErrors, []);
});

test('launcher Fabric adapter opens a mod menu and restores tables on disconnect', { timeout: 15000 }, async t => {
  const version = '1.21.4', registries = moddedRegistries(version);
  const { server, port, data } = await startServer(t, { version, era: 'config-direct-attributes', registries });
  const mineflayer = require('mineflayer');
  const bot = mineflayer.createBot({ host: '127.0.0.1', port, username: 'MenuTest', auth: 'offline', version: false, logErrors: false });
  t.after(() => bot.end());
  const errors = [];
  bot.on('error', error => errors.push(error));
  const fabric = fabricSupport.installFabricSupport(bot);
  assert.equal(fabricSupport.installFabricSupport(bot), fabric);
  await once(bot, 'spawn', { signal: t.signal });
  assert.equal(bot.registry.itemsByName['testmod:gadget'].modded, true);
  const opened = once(bot, 'windowOpen', { signal: t.signal });
  openMenu(Object.values(server.clients)[0], data, { inventoryType: registries.get('minecraft:menu').get('testmod:crate') });
  const [window] = await opened;
  assert.equal(window.type, 'testmod:crate');
  assert.equal(window.inventoryStart, 27);
  const ended = once(bot, 'end', { signal: t.signal });
  bot.end();
  await ended;
  assert.equal(bot.registry.itemsByName['testmod:gadget'], undefined);
  assert.equal(fabric.adaptation, undefined);
  assert.deepEqual(errors, []);
});

test('launcher worker negotiates Fabric again after a reconnect', { timeout: 20000 }, async t => {
  const version = '1.21.4';
  const { server, port, seen } = await startServer(t, { version, era: 'config-direct-attributes', registries: moddedRegistries(version) });
  const running = launchWorker(t, port, { autoReconnect: true, reconnectDelayMs: 1000, maxReconnectAttempts: 2 });
  await running.waitFor(events => events.some(e => e.type === 'ready'));
  Object.values(server.clients)[0].end('fixture restart');
  await running.waitFor(events => events.filter(e => e.type === 'ready').length === 2);
  assert.equal(seen.acks, 2);
  assert.equal(running.events.filter(e => e.message?.includes('Fabric registry sync complete')).length, 2);
  assert.deepEqual(running.events.filter(e => e.type === 'error'), [{ type: 'error', error: 'kicked: fixture restart' }]);
});

test('Fabric timeouts allow reconnect but malformed protocol errors stop retries', () => {
  assert.equal(worker.isPermanentConnectionError('FABRIC_TIMEOUT: handshake deadline'), false);
  assert.equal(worker.isPermanentConnectionError('FABRIC_INVALID_PACKET: invalid payload'), true);
});
