'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { setImmediate: tick, setTimeout: delay } = require('node:timers/promises')
const { fabricHandshake, CHANNELS, validateMineflayerRegistry, decodeRegistrySync } = require('..')
const { encodeChannels, encodeVersions, varint, string } = require('../src/binary')
const { registryFixture } = require('./fixtures')

class MockClient extends EventEmitter {
  constructor () {
    super()
    this.version = '26.1'
    this.state = 'configuration'
    this.writes = []
    this.errors = []
    this.on('error', error => this.errors.push(error))
  }
  write (name, data) { this.writes.push({ name, ...data }) }
  end (reason) { this.reason = reason }
  payload (channel, data) { this.emit('custom_payload', { channel, data }, { state: this.state }) }
  changeState (state) { this.state = state; this.emit('state', state) }
}
function setup (options) {
  const client = new MockClient()
  const fabric = fabricHandshake(client, options)
  client.payload(CHANNELS.register, encodeChannels([CHANNELS.complete, CHANNELS.version, CHANNELS.commonRegister]))
  return { client, fabric }
}

test('registers synchronously before Fabric ping; idempotent installation and complete cleanup', () => {
  const client = new MockClient()
  const before = client.eventNames().map(name => [name, client.listenerCount(name)])
  const fabric = fabricHandshake(client)
  assert.equal(fabricHandshake(client), fabric)
  client.payload(CHANNELS.register, encodeChannels([CHANNELS.complete]))
  client.emit('ping', { id: 0xFAB71C })
  assert.deepEqual(client.writes.map(packet => packet.name), ['custom_payload', 'custom_payload', 'pong'])
  assert.equal(client.writes[1].channel, CHANNELS.register)
  assert.ok(client.writes[1].data.toString().includes(CHANNELS.registry))
  fabric.dispose()
  assert.deepEqual(client.eventNames().map(name => [name, client.listenerCount(name)]), before)
})

test('does not advertise unsupported mod channels or an unimplemented Java loader', () => {
  const { client, fabric } = setup()
  assert.equal(client.writes[0].data.subarray(1).toString(), 'mineflayer-fabric')
  assert.ok(!client.writes[1].data.toString().includes('creativecore'))
  assert.equal(fabric.detected, true)
  fabric.dispose()
})

test('registry ACK waits for adapter; rejected adapter gets no ACK', async () => {
  let release
  const first = setup({ onRegistry: () => new Promise(resolve => { release = resolve }) })
  first.client.payload(CHANNELS.registry, registryFixture())
  await tick()
  assert.ok(!first.client.writes.some(packet => packet.channel === CHANNELS.complete))
  release()
  await tick()
  assert.equal(first.fabric.synced, true)
  assert.equal(first.client.writes.filter(packet => packet.channel === CHANNELS.complete).length, 1)
  assert.equal(first.client.writes.at(-1).data.length, 0)
  first.fabric.dispose()

  const second = setup({ onRegistry: () => { throw new Error('missing block states') } })
  second.client.payload(CHANNELS.registry, registryFixture())
  await tick()
  assert.equal(second.fabric.failed, true)
  assert.ok(!second.client.writes.some(packet => packet.channel === CHANNELS.complete))
  assert.match(second.client.reason, /missing block states/)
  second.fabric.dispose()
})

test('closed connections never send delayed ACK; duplicates fail', async () => {
  let release
  const { client, fabric } = setup({ onRegistry: () => new Promise(resolve => { release = resolve }) })
  client.payload(CHANNELS.registry, registryFixture())
  await tick()
  fabric.dispose()
  release()
  await tick()
  assert.ok(!client.writes.some(packet => packet.channel === CHANNELS.complete))
  const second = setup()
  second.client.payload(CHANNELS.registry, registryFixture())
  second.client.payload(CHANNELS.registry, registryFixture())
  await tick()
  assert.equal(second.fabric.failed, true)
  assert.ok(!second.client.writes.some(packet => packet.channel === CHANNELS.complete))
  second.fabric.dispose()
})

test('unknown common version, malformed registry and excessive split sizes fail cleanly', () => {
  for (const [channel, bytes] of [
    [CHANNELS.version, encodeVersions([2])],
    [CHANNELS.registry, Buffer.from([255])],
    [CHANNELS.split, varint(17 * 1024 * 1024)]
  ]) {
    const { client, fabric } = setup()
    client.payload(channel, bytes)
    assert.equal(fabric.failed, true)
    assert.equal(client.errors.length, 1)
    assert.ok(!client.writes.some(packet => packet.channel === CHANNELS.complete))
    fabric.dispose()
  }
})

test('timeout bounds incomplete sync; vanilla connection remains idle', async () => {
  const { client, fabric } = setup({ timeout: 15 })
  await delay(30)
  assert.equal(client.errors[0].code, 'FABRIC_TIMEOUT')
  fabric.dispose()
  const vanilla = new MockClient()
  const idle = fabricHandshake(vanilla, { timeout: 5 })
  await delay(15)
  assert.equal(vanilla.writes.length, 0)
  assert.equal(vanilla.errors.length, 0)
  idle.dispose()
})

test('reconfiguration clears old registry and common state', async () => {
  const { client, fabric } = setup()
  client.payload(CHANNELS.version, encodeVersions([1]))
  client.payload(CHANNELS.registry, registryFixture())
  await tick()
  client.changeState('play')
  client.changeState('configuration')
  assert.equal(fabric.registry.entryCount, 0)
  assert.equal(fabric.synced, false)
  assert.equal(fabric.commonVersion, null)
  client.payload(CHANNELS.register, encodeChannels([CHANNELS.complete]))
  client.payload(CHANNELS.registry, registryFixture())
  await tick()
  assert.equal(client.writes.filter(packet => packet.channel === CHANNELS.complete).length, 2)
  fabric.dispose()
})

test('validation rejects fabricated blocks and remapped vanilla IDs', () => {
  const table = entries => ({ registries: new Map([['minecraft:block', { entries: new Map(entries) }]]) })
  const registry = { blocksByName: { stone: { id: 1 } } }
  validateMineflayerRegistry(registry, table([['minecraft:stone', 1]]))
  assert.throws(() => validateMineflayerRegistry(registry, table([['minecraft:stone', 2]])), { code: 'FABRIC_REGISTRY_INCOMPATIBLE' })
  assert.throws(() => validateMineflayerRegistry(registry, table([['mod:machine', 1]])))
})

test('incomplete split cannot be interrupted by another payload', () => {
  const { client, fabric } = setup()
  client.payload(CHANNELS.split, Buffer.concat([varint(100), Buffer.from([1])]))
  client.payload(CHANNELS.brand, string('fabric'))
  assert.equal(fabric.failed, true)
  fabric.dispose()
})

test('modern vanilla effect names are validated against minecraft-data display names', () => {
  const data = require('minecraft-data')('26.1')
  const sync = { registries: new Map([['minecraft:mob_effect', {
    entries: new Map([['minecraft:speed', 0], ['minecraft:mining_fatigue', 3], ['minecraft:unluck', 26]])
  }]]) }
  validateMineflayerRegistry(data, sync)
})

test('custom payload handlers are advertised by phase and receive the original bytes', async () => {
  let received
  const { client, fabric } = setup({ handlers: {
    configuration: { 'test:config': bytes => { received = bytes } },
    play: { 'test:play': () => {} }
  } })
  const advertised = client.writes[1].data.toString()
  assert.ok(advertised.includes('test:config'))
  assert.ok(!advertised.includes('test:play'))
  const bytes = Buffer.from([0, 255, 42])
  client.payload('test:config', bytes)
  await tick()
  assert.equal(received, bytes)
  fabric.dispose()
})

test('ES module and CommonJS exports share the same implementation', async () => {
  const esm = await import('../index.mjs')
  assert.equal(esm.fabricHandshake, fabricHandshake)
  assert.equal(typeof esm.attachFabric, 'function')
})

const { encodeRegistryMap, encodeNbtRegistryMap, chunk, moddedRegistries } = require('./fixtures')
const { encodeIdentifierList, decodeIdentifierList } = require('../src/binary')

test('ordinary servers see no Fabric announcement unless explicitly requested', () => {
  for (const announce of ['auto', 'always']) {
    const client = new MockClient()
    const fabric = fabricHandshake(client, { announce })
    client.payload(CHANNELS.register, encodeChannels(['bungeecord:main', 'velocity:player_info']))
    client.emit('ping', { id: 1 })
    const payloads = client.writes.filter(packet => packet.name === 'custom_payload')
    assert.equal(payloads.length, announce === 'always' ? 2 : 0)
    assert.equal(fabric.detected, false)
    assert.equal(fabric._timer, null)
    fabric.dispose()
  }
})

test('configuration direct sync (Fabric API 1.20.2 - 1.21.10) is acknowledged after the terminator', async () => {
  for (const [version, attributes] of [['1.20.4', false], ['1.21.4', true]]) {
    const client = new MockClient()
    client.version = version
    const fabric = fabricHandshake(client)
    client.payload(CHANNELS.register, encodeChannels([CHANNELS.complete]))
    const advertised = client.writes[1].data.toString()
    assert.ok(advertised.includes(CHANNELS.registryDirect) && advertised.includes(CHANNELS.registry))
    const map = moddedRegistries(version)
    for (const part of chunk(encodeRegistryMap(map, { attributes }), 1000)) client.payload(CHANNELS.registryDirect, part)
    await tick()
    assert.equal(fabric.synced, false)
    client.payload(CHANNELS.registryDirect, Buffer.alloc(0))
    await tick()
    assert.equal(fabric.synced, true)
    assert.equal(fabric.registry.format, attributes ? 'binary+attributes' : 'binary')
    assert.equal(fabric.registry.registries.get('minecraft:item').entries.get('testmod:gadget'), map.get('minecraft:item').get('testmod:gadget'))
    assert.equal(client.writes.filter(packet => packet.channel === CHANNELS.complete).length, 1)
    fabric.dispose()
  }
})

test('PLAY-era sync (Fabric API 1.14 - 1.20.1) is never acknowledged and leaves no deadline', async () => {
  for (const mode of ['nbt', 'direct']) {
    const client = new MockClient()
    client.version = '1.19.4'
    client.state = 'play'
    const fabric = fabricHandshake(client, { timeout: 20 })
    const map = moddedRegistries('1.19.4')
    if (mode === 'nbt') {
      client.payload(CHANNELS.registry, encodeNbtRegistryMap(map))
    } else {
      for (const part of chunk(encodeRegistryMap(map, { attributes: false }), 4096)) client.payload(CHANNELS.registryDirect, part)
      client.payload(CHANNELS.registryDirect, Buffer.alloc(0))
    }
    await tick()
    assert.equal(fabric.synced, true)
    assert.equal(fabric.era, 'play')
    assert.equal(fabric.registry.format, mode === 'nbt' ? 'nbt' : 'binary')
    assert.ok(!client.writes.some(packet => packet.channel === CHANNELS.complete))
    await delay(40)
    assert.deepEqual(client.errors, [])
    fabric.dispose()
  }
})

test('broken PLAY-era registry data is reported but keeps the connection', async () => {
  const client = new MockClient()
  client.state = 'play'
  const fabric = fabricHandshake(client)
  const warnings = []
  fabric.on('warning', warning => warnings.push(warning.code))
  client.payload(CHANNELS.registry, Buffer.from([10, 0]))
  await tick()
  assert.deepEqual(warnings, ['FABRIC_REGISTRY_DECODE_FAILED'])
  assert.equal(fabric.failed, false)
  assert.deepEqual(client.errors, [])
  fabric.dispose()
})

test('early registration answers Fabric login query and delegates other queries', () => {
  const client = new MockClient()
  client.state = 'login'
  const answered = []
  client.on('login_plugin_request', function onLoginPluginRequest (packet) {
    answered.push(packet.messageId)
    client.write('login_plugin_response', { messageId: packet.messageId })
  })
  const fabric = fabricHandshake(client, { handlers: { play: { 'test:play': () => {} } } })
  client.emit('login_plugin_request', {
    messageId: 4, channel: CHANNELS.earlyRegistration, data: encodeIdentifierList(['testmod:server_action'])
  })
  client.emit('login_plugin_request', { messageId: 5, channel: 'velocity:player_info', data: Buffer.alloc(1) })
  assert.deepEqual(answered, [5])
  const response = client.writes.find(packet => packet.messageId === 4)
  assert.deepEqual([...decodeIdentifierList(response.data)], [CHANNELS.registryDirect, CHANNELS.registry, 'test:play'])
  assert.equal(fabric.detected, true)
  assert.ok(fabric.serverChannels.play.has('testmod:server_action'))
  // A later PLAY registration is answered once.
  client.changeState('play')
  client.payload(CHANNELS.register, encodeChannels(['testmod:server_action']))
  client.payload(CHANNELS.register, encodeChannels(['testmod:other']))
  assert.equal(client.writes.filter(packet => packet.channel === CHANNELS.register).length, 1)
  fabric.dispose()
  assert.equal(client.listeners('login_plugin_request').length, 1)
  assert.equal(client.listeners('login_plugin_request')[0].name, 'onLoginPluginRequest')
  client.emit('login_plugin_request', { messageId: 6, channel: CHANNELS.earlyRegistration, data: encodeIdentifierList([]) })
  assert.deepEqual(answered, [5, 6])
})

test('legacy REGISTER, plugin brands and malformed channel names never fail a pre-1.13 session', () => {
  const client = new MockClient()
  client.version = '1.12.2'
  client.state = 'play'
  const fabric = fabricHandshake(client)
  client.payload('REGISTER', Buffer.from('BungeeCord\0MC|Brand\0WDL|INIT'))
  client.payload('MC|Brand', Buffer.from('\x05Spigot'))
  client.payload(CHANNELS.register, Buffer.from('Not An Identifier\0ok:channel'))
  assert.equal(fabric.failed, false)
  assert.ok(fabric.serverChannels.play.has('BungeeCord'))
  assert.ok(fabric.serverChannels.play.has('ok:channel'))
  assert.equal(client.writes.length, 0)
  fabric.dispose()
})

test('fabric:split works in PLAY and delivers mod payloads to handlers', async () => {
  const mc = require('minecraft-protocol')
  const client = new MockClient()
  client.state = 'play'
  let received
  const fabric = fabricHandshake(client, { handlers: { play: { 'test:large': bytes => { received = bytes } } } })
  const serializer = mc.createSerializer({ state: 'play', isServer: true, version: '26.1' })
  const payload = Buffer.alloc(5000, 7)
  const wrapped = serializer.createPacketBuffer({ name: 'custom_payload', params: { channel: 'test:large', data: payload } })
  serializer.destroy()
  const [first, ...rest] = chunk(wrapped, 1500)
  client.payload(CHANNELS.split, Buffer.concat([varint(wrapped.length), first]))
  for (const part of rest) client.payload(CHANNELS.split, part)
  await tick()
  assert.deepEqual(received, payload)
  assert.equal(fabric._timer, null)
  fabric.dispose()
})

test('after a proxy switches to an ordinary backend nothing Fabric is announced', () => {
  const { client, fabric } = setup()
  assert.equal(fabric.detected, true)
  client.changeState('play')
  client.changeState('configuration')
  const before = client.writes.length
  client.payload(CHANNELS.register, encodeChannels(['bungeecord:main']))
  assert.equal(fabric.detected, false)
  assert.equal(client.writes.length, before)
  fabric.dispose()
})

test('Fabric API 1.20.5 - 1.21.10 direct parts: zero padding and repeated backing arrays', async () => {
  // Captured from a real 1.21.4 server: 93777 data bytes in a 131072-byte part.
  for (const parts of [1, 4]) {
    const client = new MockClient()
    client.version = '1.21.4'
    const fabric = fabricHandshake(client, { maxPayloadBytes: 300000 })
    client.payload(CHANNELS.register, encodeChannels([CHANNELS.complete]))
    const map = moddedRegistries('1.21.4')
    const bytes = encodeRegistryMap(map, { attributes: true })
    const backing = Buffer.concat([bytes, Buffer.alloc(131072 - bytes.length)])
    for (let i = 0; i < parts; i++) client.payload(CHANNELS.registryDirect, backing)
    client.payload(CHANNELS.registryDirect, Buffer.alloc(0))
    await tick()
    assert.equal(fabric.failed, false)
    assert.equal(fabric.synced, true)
    assert.equal(fabric.registry.trailingBytes, 131072 - bytes.length)
    assert.equal(fabric.registry.entryCount, [...map.values()].reduce((sum, table) => sum + table.size, 0))
    fabric.dispose()
  }
  // A genuine prefix never decodes early; parts are joined.
  const client = new MockClient()
  client.version = '1.20.4'
  const fabric = fabricHandshake(client)
  client.payload(CHANNELS.register, encodeChannels([CHANNELS.complete]))
  for (const part of chunk(encodeRegistryMap(moddedRegistries('1.20.4'), { attributes: false }), 7000)) client.payload(CHANNELS.registryDirect, part)
  client.payload(CHANNELS.registryDirect, Buffer.alloc(0))
  await tick()
  assert.equal(fabric.synced, true)
  assert.equal(fabric.registry.trailingBytes, 0)
  fabric.dispose()
  // The strict decoder still rejects trailing bytes outside sync/direct.
  assert.throws(() => decodeRegistrySync(Buffer.concat([encodeRegistryMap(moddedRegistries('26.1')), Buffer.alloc(5)])))
})
