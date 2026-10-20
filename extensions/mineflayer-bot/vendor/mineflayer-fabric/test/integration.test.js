'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const mc = require('minecraft-protocol')
const mineflayer = require('mineflayer')
const { createFabricClient, createFabricBot, CHANNELS } = require('..')
const { decodeChannels } = require('../src/binary')
const { startServer, openMenu } = require('./server')
const { moddedRegistries } = require('./fixtures')

// Real TCP and real minecraft-protocol/Mineflayer codecs. The server side
// emulates the Fabric API exchange of each era; it does not run Java.
const ERA_CASES = [
  ['1.16.5', 'play-nbt', CHANNELS.registry],
  ['1.19.4', 'play-direct', CHANNELS.registryDirect],
  ['1.20.1', 'play-direct-only', CHANNELS.registryDirect],
  ['1.20.4', 'config-direct', CHANNELS.registryDirect],
  ['1.21.1', 'config-direct', CHANNELS.registryDirect],
  ['1.21.4', 'config-direct-attributes', CHANNELS.registryDirect],
  ['1.21.8', 'config-direct-attributes', CHANNELS.registryDirect],
  ['1.21.11', 'config-sync', CHANNELS.registry],
  ['26.1', 'config-sync', CHANNELS.registry]
]
const botOptions = port => ({ host: '127.0.0.1', port, username: 'FabricTest', auth: 'offline', version: false, logErrors: false })

// PLAY-era servers send registry sync around spawn; wait for both.
async function spawned (bot, { synced = true } = {}) {
  await new Promise((resolve, reject) => {
    bot.once('spawn', resolve)
    bot.once('end', reason => reject(new Error('Disconnected before spawn: ' + reason)))
  })
  if (synced && !bot.fabric.synced) await once(bot.fabric, 'synced')
}

function collectErrors (emitter) {
  const errors = []
  emitter.on('error', error => errors.push(error))
  return errors
}

for (const [version, era, channel] of ERA_CASES) {
  test('Mineflayer joins a Fabric ' + version + ' server (' + era + ')', { timeout: 15000 }, async t => {
    const registries = moddedRegistries(version)
    const { server, seen, port, data } = await startServer(t, { version, era, registries })
    const bot = createFabricBot(botOptions(port))
    t.after(() => bot.end())
    const errors = collectErrors(bot)
    const warnings = []
    bot.fabric.on('warning', warning => warnings.push(warning.code))
    await spawned(bot)
    assert.equal(bot.version, version)
    assert.equal(bot.fabric.detected, true)
    assert.equal(bot.fabric.synced, true)
    assert.equal(bot.fabric.registry.channel, channel)
    assert.equal(bot.fabric.era, era.startsWith('play') ? 'play' : 'configuration')
    assert.equal(seen.acks, era.startsWith('play') ? 0 : 1)
    if (era.startsWith('play')) assert.equal(seen.loginResponses.length, 1)
    const gadget = registries.get('minecraft:item').get('testmod:gadget')
    assert.equal(bot.registry.items[gadget].name, 'testmod:gadget')
    assert.equal(bot.registry.blocksByName.stone.minStateId, require('minecraft-data')(version).blocksByName.stone.minStateId)
    assert.ok(warnings.includes('FABRIC_MOD_CONTENT'))
    // A mod menu would crash plain Mineflayer; it opens as a generic window.
    const opened = once(bot, 'windowOpen')
    openMenu(Object.values(server.clients)[0], data, { inventoryType: registries.get('minecraft:menu').get('testmod:crate') })
    const [window] = await opened
    assert.equal(window.type, 'testmod:crate')
    assert.equal(window.inventoryStart, 27)
    assert.deepEqual(seen.errors, [])
    assert.deepEqual(errors, [])
  })
}

for (const [version, era] of [['1.19.4', 'play-direct'], ['1.21.4', 'config-direct-attributes'], ['26.1', 'config-sync']]) {
  test('raw minecraft-protocol client completes ' + era + ' on ' + version, { timeout: 15000 }, async t => {
    const registries = moddedRegistries(version)
    const { server, seen, port } = await startServer(t, { version, era, registries })
    const client = createFabricClient(botOptions(port))
    t.after(() => client.end())
    const errors = collectErrors(client)
    await once(server, 'fixtureJoin')
    if (!client.fabric.synced) await once(client.fabric, 'synced')
    assert.equal(client.fabric.registry.registries.get('minecraft:menu').entries.get('testmod:crate'),
      registries.get('minecraft:menu').get('testmod:crate'))
    assert.equal(seen.acks, era.startsWith('play') ? 0 : 1)
    assert.deepEqual(errors, [])
    assert.deepEqual(seen.errors, [])
  })
}

for (const [version, era, splitSize] of [['26.1', 'config-sync', 4096], ['1.21.4', 'config-direct-attributes', 3000], ['1.20.1', 'play-direct-only', 2500]]) {
  test('large registry is reassembled over TCP: ' + era + ' ' + version + ' in ' + splitSize + '-byte parts', { timeout: 15000 }, async t => {
    const registries = moddedRegistries(version)
    const { seen, port } = await startServer(t, { version, era, registries, splitSize })
    const bot = createFabricBot(botOptions(port))
    t.after(() => bot.end())
    const errors = collectErrors(bot)
    await spawned(bot)
    assert.deepEqual(errors, [])
    assert.equal(bot.fabric.registry.entryCount, [...registries.values()].reduce((sum, table) => sum + table.size, 0))
    assert.deepEqual(seen.errors, [])
  })
}

test('Fabric 1.21.4+ kicks plain Mineflayer; the plugin passes the same server', { timeout: 15000 }, async t => {
  const version = '1.21.4'
  const { seen, port } = await startServer(t, { version, era: 'config-direct-attributes', registries: moddedRegistries(version) })
  const plain = mineflayer.createBot(botOptions(port))
  collectErrors(plain)
  await once(plain, 'end')
  assert.match(String(seen.kicked), /requires Fabric/)
  const bot = createFabricBot(botOptions(port))
  t.after(() => bot.end())
  const errors = collectErrors(bot)
  await spawned(bot)
  assert.deepEqual(errors, [])
  assert.equal(bot.fabric.synced, true)
})

test('Mineflayer covers configuration before game injection', { timeout: 15000 }, async t => {
  const { server, seen, port } = await startServer(t, { version: '26.1', era: 'config-sync', registries: moddedRegistries('26.1') })
  const bot = createFabricBot(botOptions(port))
  t.after(() => bot.end())
  const errors = collectErrors(bot)
  const emit = bot.emit
  let injectionHeld
  const held = new Promise(resolve => { injectionHeld = resolve })
  bot.emit = function (name, ...args) {
    if (name === 'inject_allowed') {
      injectionHeld(args)
      return false
    }
    return emit.call(this, name, ...args)
  }
  await once(server, 'fixtureJoin')
  assert.equal(bot.game, undefined, 'configuration must finish without the game plugin')
  assert.equal(seen.pongs, 1)
  assert.equal(seen.acks, 1)
  assert.equal(bot.fabric.synced, true)
  bot.emit = emit
  bot.emit('inject_allowed', ...(await held))
  assert.ok(bot.game)
  assert.equal(bot.fabric.options.handleConfigurationPing, false)
  assert.deepEqual(seen.errors, [])
  assert.deepEqual(errors, [])
})

// Ordinary servers of every version: the library stays silent and Mineflayer
// behaves exactly as without it, including proxies' malformed channel names.
for (const version of mc.supportedVersions.filter(version => version !== '1.7')) {
  test('ordinary ' + version + ' server: spawn without Fabric traces', { timeout: 15000 }, async t => {
    const legacy = require('minecraft-data')(version).version['<']('1.13')
    const plugins = legacy ? ['BungeeCord', 'WDL|INIT'] : ['bungeecord:main', 'velocity:player_info']
    const { server, seen, port } = await startServer(t, { version, plugins })
    server.on('connection', client => client.on('custom_payload', packet => {
      if (!legacy && packet.channel === 'minecraft:register') {
        seen.registered = [...decodeChannels(packet.data).channels]
      }
    }))
    const bot = createFabricBot(botOptions(port))
    t.after(() => bot.end())
    const errors = collectErrors(bot)
    await spawned(bot, { synced: false })
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(bot.fabric.detected, false)
    assert.equal(bot.fabric.failed, false)
    assert.ok(!seen.payloads.some(packet => packet.channel?.startsWith('fabric') ||
      (packet.channel === 'minecraft:register' && packet.data.toString().includes('fabric'))))
    assert.ok(!seen.payloads.some(packet => packet.data?.toString().includes('mineflayer-fabric')))
    assert.deepEqual(errors, [])
    assert.deepEqual(seen.errors, [])
  })
}
