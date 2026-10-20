'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { attachFabric, CHANNELS } = require('..')
const { encodeChannels, varint } = require('../src/binary')

function botFixture () {
  const client = new EventEmitter()
  client.version = '26.1.2'
  client.state = 'configuration'
  client.writes = []
  client.errors = []
  client.write = (name, params) => client.writes.push({ name, ...params })
  client.end = reason => { client.reason = reason }
  client.on('error', error => client.errors.push(error))
  const bot = new EventEmitter()
  bot._client = client
  // Mineflayer's plugin loader listens before attachFabric is called.
  bot.once('inject_allowed', () => {
    bot.game = {}
    client.on('ping', packet => client.write('pong', packet))
  })
  return { bot, client }
}

test('attachFabric covers early ping, then sends one pong through the game plugin', () => {
  const { bot, client } = botFixture()
  const fabric = attachFabric(bot)
  assert.equal(attachFabric(bot), fabric)
  client.emit('custom_payload', { channel: CHANNELS.register, data: encodeChannels([CHANNELS.complete]) })
  client.emit('ping', { id: 0xFAB71C })
  assert.deepEqual(client.writes.map(packet => packet.name), ['custom_payload', 'custom_payload', 'pong'])
  bot.emit('inject_allowed')
  client.emit('ping', { id: 2 })
  client.state = 'play'
  client.emit('state', 'play')
  client.emit('ping', { id: 3 })
  client.state = 'configuration'
  client.emit('state', 'configuration')
  client.emit('ping', { id: 4 })
  assert.deepEqual(client.writes.filter(packet => packet.name === 'pong').map(packet => packet.id), [0xFAB71C, 2, 3, 4])
  assert.deepEqual(client.errors, [])
  client.emit('end')
})

test('attachFabric after game injection leaves configuration ping to Mineflayer', () => {
  const { bot, client } = botFixture()
  bot.emit('inject_allowed')
  const fabric = attachFabric(bot)
  client.emit('ping', { id: 1 })
  assert.equal(client.writes.length, 1)
  assert.equal(bot.listenerCount('inject_allowed'), 0)
  fabric.dispose()
  client.emit('ping', { id: 2 })
  assert.deepEqual(client.writes.map(packet => packet.id), [1, 2])
})

test('dispose and disconnect remove the deferred injection hook before reattachment', () => {
  for (const close of ['dispose', 'end']) {
    const { bot, client } = botFixture()
    const originalListeners = client.eventNames().map(name => [name, client.listenerCount(name)])
    const originalInjectionListeners = bot.listenerCount('inject_allowed')
    const fabric = attachFabric(bot)
    assert.equal(bot.listenerCount('inject_allowed'), originalInjectionListeners + 1)
    if (close === 'dispose') fabric.dispose()
    else client.emit('end')
    assert.equal(bot.listenerCount('inject_allowed'), originalInjectionListeners)
    assert.deepEqual(client.eventNames().map(name => [name, client.listenerCount(name)]), originalListeners)
    client.emit('ping', { id: 1 })
    assert.deepEqual(client.writes, [])
    const next = attachFabric(bot)
    assert.notEqual(next, fabric)
    client.emit('ping', { id: 2 })
    assert.deepEqual(client.writes, [{ name: 'pong', id: 2 }])
    next.dispose()
  }
})

test('explicit ping ownership is preserved across Mineflayer injection', () => {
  for (const enabled of [false, true]) {
    const { bot, client } = botFixture()
    const fabric = attachFabric(bot, { handleConfigurationPing: enabled })
    client.emit('ping', { id: 1 })
    assert.equal(client.writes.length, enabled ? 1 : 0)
    assert.equal(bot.listenerCount('inject_allowed'), 1)
    bot.emit('inject_allowed')
    assert.equal(fabric.options.handleConfigurationPing, enabled)
    fabric.dispose()
  }
})

test('early ping obeys split validation and never responds after failure', () => {
  const { bot, client } = botFixture()
  const fabric = attachFabric(bot)
  client.emit('custom_payload', { channel: CHANNELS.split, data: Buffer.concat([varint(100), Buffer.from([1])]) })
  client.emit('ping', { id: 1 })
  assert.equal(fabric.failed, true)
  assert.equal(client.errors.length, 1)
  assert.equal(client.writes.filter(packet => packet.name === 'pong').length, 0)
  client.emit('ping', { id: 2 })
  assert.equal(client.errors.length, 1)
  fabric.dispose()
})

test('early ping write failure reaches the normal Fabric error lifecycle', () => {
  const { bot, client } = botFixture()
  const fabric = attachFabric(bot)
  client.write = () => { throw new Error('socket write failed') }
  client.emit('ping', { id: 1 })
  assert.equal(fabric.failed, true)
  assert.match(client.reason, /socket write failed/)
  assert.equal(client.errors.length, 1)
  fabric.dispose()
})

test('adapted data is per connection: a proxy reconfiguration restores vanilla tables', async () => {
  const { setImmediate: tick } = require('node:timers/promises')
  const { encodeRegistryMap, moddedRegistries } = require('./fixtures')
  const { bot, client } = botFixture()
  bot.registry = require('prismarine-registry')('26.1')
  const vanillaItems = bot.registry.items
  const fabric = attachFabric(bot)
  const adapted = []
  fabric.on('adapted', report => adapted.push(report))
  client.emit('custom_payload', { channel: CHANNELS.register, data: encodeChannels([CHANNELS.complete]) }, { state: 'configuration' })
  client.emit('custom_payload', { channel: CHANNELS.registry, data: encodeRegistryMap(moddedRegistries('26.1')) }, { state: 'configuration' })
  await tick()
  assert.equal(fabric.synced, true)
  assert.equal(adapted.length, 1)
  assert.equal(bot.registry.itemsByName['testmod:gadget'].modded, true)
  assert.equal(client.writes.filter(packet => packet.channel === CHANNELS.complete).length, 1)
  client.state = 'play'
  client.emit('state', 'play')
  client.state = 'configuration'
  client.emit('state', 'configuration')
  assert.equal(bot.registry.items, vanillaItems)
  assert.equal(bot.registry.itemsByName['testmod:gadget'], undefined)
  fabric.dispose()
})

test('strict mode refuses mod content before the ACK; "none" leaves Mineflayer data untouched', async () => {
  const { setImmediate: tick } = require('node:timers/promises')
  const { encodeRegistryMap, moddedRegistries } = require('./fixtures')
  for (const registryValidation of ['strict', 'none']) {
    const { bot, client } = botFixture()
    bot.registry = require('prismarine-registry')('26.1')
    const items = bot.registry.items
    const fabric = attachFabric(bot, { registryValidation })
    client.emit('custom_payload', { channel: CHANNELS.register, data: encodeChannels([CHANNELS.complete]) }, { state: 'configuration' })
    client.emit('custom_payload', { channel: CHANNELS.registry, data: encodeRegistryMap(moddedRegistries('26.1')) }, { state: 'configuration' })
    await tick()
    await tick()
    assert.equal(bot.registry.items, items)
    assert.equal(fabric.failed, registryValidation === 'strict')
    assert.equal(client.writes.some(packet => packet.channel === CHANNELS.complete), registryValidation === 'none')
    if (registryValidation === 'strict') assert.equal(client.errors[0].code, 'FABRIC_REGISTRY_INCOMPATIBLE')
    fabric.dispose()
  }
  assert.throws(() => attachFabric(botFixture().bot, { registryValidation: 'maybe' }), TypeError)
})

test('disconnect, dispose and failure restore adapted tables and clear the report', async () => {
  const { setImmediate: tick } = require('node:timers/promises')
  const { encodeRegistryMap, moddedRegistries } = require('./fixtures')
  for (const close of ['end', 'dispose', 'failure', 'configuration']) {
    const { bot, client } = botFixture()
    bot.registry = require('prismarine-registry')('26.1')
    const vanillaItems = bot.registry.items
    const fabric = attachFabric(bot)
    client.emit('custom_payload', { channel: CHANNELS.registry, data: encodeRegistryMap(moddedRegistries('26.1')) }, { state: 'configuration' })
    await tick()
    assert.ok(fabric.adaptation)
    assert.notEqual(bot.registry.items, vanillaItems)
    if (close === 'end') client.emit('end')
    else if (close === 'dispose') fabric.dispose()
    else if (close === 'failure') client.emit('custom_payload', { channel: CHANNELS.registry, data: Buffer.from([255]) }, { state: 'configuration' })
    else client.emit('state', 'configuration')
    assert.equal(bot.registry.items, vanillaItems, close)
    assert.equal(fabric.adaptation, undefined, close)
    fabric.dispose()
  }
})

test('an async registry adapter cannot install tables after disconnect or failure', async () => {
  const { setImmediate: tick } = require('node:timers/promises')
  const { encodeRegistryMap, moddedRegistries } = require('./fixtures')
  for (const close of ['end', 'failure']) {
    const { bot, client } = botFixture()
    bot.registry = require('prismarine-registry')('26.1')
    const vanillaItems = bot.registry.items
    let release
    const pending = new Promise(resolve => { release = resolve })
    const fabric = attachFabric(bot, { onRegistry: () => pending })
    let adapted = false
    fabric.on('adapted', () => { adapted = true })
    client.emit('custom_payload', { channel: CHANNELS.registry, data: encodeRegistryMap(moddedRegistries('26.1')) }, { state: 'configuration' })
    await tick()
    if (close === 'end') client.emit('end')
    else client.emit('state', 'play')
    release()
    await tick()
    assert.equal(adapted, false, close)
    assert.equal(bot.registry.items, vanillaItems, close)
    assert.equal(fabric.adaptation, undefined, close)
    assert.equal(client.writes.some(packet => packet.channel === CHANNELS.complete), false, close)
    fabric.dispose()
  }
})
