import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import worker from './worker.cjs';
import fabricSupport from './fabric.cjs';

const require = createRequire(import.meta.url);
const { startServer, openMenu } = require('./vendor/mineflayer-fabric/test/server.js');
const { moddedRegistries } = require('./vendor/mineflayer-fabric/test/fixtures.js');
const { CHANNELS } = require('./mineflayer-fabric.cjs');

function launchWorker(t, port, connection = {}) {
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
    server: { host: '127.0.0.1', port }, ownerName: 'Owner',
    account: { mode: 'offline', username: 'FabricBot' },
    connection: { autoReconnect: false, ...connection }, combat: { enabled: false },
    survival: { autoEat: false, emergencyMlg: false },
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
