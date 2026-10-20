'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { decodeRegistrySync } = require('..')
const { MineflayerAdapter, guardWindows } = require('../src/adapter')
const { encodeRegistryMap, moddedRegistries } = require('./fixtures')

function adapted (version, options = {}, mapOptions = {}) {
  const registry = require('prismarine-registry')(version)
  const map = moddedRegistries(version, mapOptions)
  const adapter = new MineflayerAdapter({ registry }, options)
  const report = adapter.apply(decodeRegistrySync(encodeRegistryMap(map)))
  return { registry, adapter, report, map }
}

test('mod content gets per-bot placeholders without touching shared minecraft-data', () => {
  const shared = require('minecraft-data')('1.20.1')
  const other = require('prismarine-registry')('1.20.1')
  const { registry, report, map } = adapted('1.20.1')
  const gadget = map.get('minecraft:item').get('testmod:gadget')
  assert.deepEqual(registry.items[gadget], { id: gadget, name: 'testmod:gadget', displayName: 'Gadget', modded: true, stackSize: 64 })
  assert.equal(registry.itemsByName['testmod:gadget'].id, gadget)
  assert.equal(registry.itemsByName.diamond_sword, shared.itemsByName.diamond_sword)
  assert.equal(registry.entitiesByName['testmod:robot'].type, 'other')
  assert.deepEqual([...report.namespaces], ['testmod'])
  assert.equal(report.added.items, 2)
  // Neither the cached minecraft-data object nor another bot sees the change.
  for (const data of [shared, other]) {
    assert.equal(data.itemsByName['testmod:gadget'], undefined)
    assert.equal(data.items[gadget], undefined)
    assert.equal(data.blocksByName['testmod:machine'], undefined)
  }
})

test('remapped vanilla IDs follow the server', () => {
  const { registry, report, map } = adapted('1.20.1', {}, { remap: true })
  const items = map.get('minecraft:item')
  assert.equal(registry.items[items.get('minecraft:stone')].name, 'stone')
  assert.equal(registry.items[items.get('minecraft:granite')].name, 'granite')
  assert.equal(registry.itemsByName.stone.id, items.get('minecraft:stone'))
  assert.equal(report.remapped.items, 2)
})

test('vanilla block states stay exact; unknown mod states become solid unknown blocks', () => {
  for (const version of ['1.16.5', '1.20.1', '26.1']) {
    const { registry, report } = adapted(version)
    const Block = require('prismarine-block')(registry)
    const stone = registry.blocksByName.stone
    assert.equal(Block.fromStateId(stone.minStateId, 0).name, 'stone')
    const vanillaStates = Object.values(require('minecraft-data')(version).blocks).reduce((max, block) => Math.max(max, block.maxStateId), 0) + 1
    assert.equal(report.unknownStateFrom, vanillaStates)
    assert.deepEqual(report.unresolvedBlocks, ['testmod:machine', 'testmod:pipe'])
    const unknown = Block.fromStateId(vanillaStates + 12, 0)
    assert.equal(unknown.name, 'fabric:unknown_block')
    assert.equal(unknown.boundingBox, 'block')
    assert.equal(registry.blocksByName['testmod:machine'].unresolvedStates, true)
    // prismarine-chunk derives its global palette width from the registry.
    const Chunk = require('prismarine-chunk')(registry)
    const column = new Chunk({ minY: 0, worldHeight: 256 })
    assert.ok(Number.isInteger(column.maxBitsPerBlock ?? 16))
  }
})

test('modData describes mod blocks exactly', () => {
  const { registry, report } = adapted('1.20.1', {
    modData: {
      blocks: {
        'testmod:machine': { stateCount: 4, hardness: 3 },
        'testmod:pipe': {
          states: [{ name: 'axis', type: 'enum', num_values: 3, values: ['x', 'y', 'z'] }],
          boundingBox: 'empty',
          transparent: true
        }
      },
      items: { 'testmod:wrench': { stackSize: 1, displayName: 'Wrench' } }
    }
  })
  const Block = require('prismarine-block')(registry)
  const start = registry.blocksByName['testmod:machine'].minStateId
  assert.equal(report.unknownStateFrom, null)
  assert.equal(registry.blocksByName['testmod:machine'].maxStateId, start + 3)
  assert.equal(Block.fromStateId(start + 2, 0).hardness, 3)
  const pipe = Block.fromStateId(start + 5, 0)
  assert.equal(pipe.name, 'testmod:pipe')
  assert.equal(pipe.boundingBox, 'empty')
  assert.deepEqual(pipe.getProperties(), { axis: 'y' })
  assert.equal(registry.blocksByStateId[start + 7], undefined)
  assert.equal(registry.itemsByName['testmod:wrench'].stackSize, 1)
})

test('restore returns the original shared tables; identical registries are not copied', () => {
  const registry = require('prismarine-registry')('26.1')
  const original = { items: registry.items, blocksByStateId: registry.blocksByStateId, effects: registry.effects }
  const adapter = new MineflayerAdapter({ registry })
  adapter.apply(decodeRegistrySync(encodeRegistryMap(moddedRegistries('26.1'))))
  assert.notEqual(registry.items, original.items)
  adapter.restore()
  for (const key of Object.keys(original)) assert.equal(registry[key], original[key])
  // Vanilla effect names use display keys in minecraft-data (Speed, BadLuck).
  const effects = new Map(registry.effectsArray.map(effect => [
    'minecraft:' + effect.name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace('bad_luck', 'unluck'), effect.id
  ]))
  adapter.apply(decodeRegistrySync(encodeRegistryMap(new Map([['minecraft:mob_effect', effects]]))))
  assert.equal(registry.effects, original.effects)
  assert.equal(adapter.baseline?.size ?? 0, 0)
})

test('window guard opens mod menus once their slot count is known', () => {
  const client = new EventEmitter()
  const adapter = { menus: new Map([[2, 'minecraft:generic_9x3'], [40, 'testmod:crate']]) }
  const warnings = []
  const unguard = guardWindows(client, adapter, warning => warnings.push(warning.code))
  const opened = []
  const order = []
  client.on('open_window', packet => { opened.push({ ...packet }); order.push('open') })
  client.on('window_items', () => order.push('items'))
  client.emit('open_window', { windowId: 1, inventoryType: 2, windowTitle: 'Chest' })
  assert.equal(opened[0].inventoryType, 'minecraft:generic_9x3')
  client.emit('open_window', { windowId: 2, inventoryType: 40, windowTitle: 'Crate' })
  assert.equal(opened.length, 1)
  client.emit('window_items', { windowId: 2, items: new Array(45) })
  assert.deepEqual(opened[1], { windowId: 2, inventoryType: 'testmod:crate', windowTitle: 'Crate', slotCount: 9 })
  assert.deepEqual(order, ['open', 'open', 'items'])
  client.emit('open_window', { windowId: 3, inventoryType: 40, windowTitle: 'Crate' })
  client.emit('close_window', { windowId: 3 })
  client.emit('window_items', { windowId: 3, items: new Array(45) })
  assert.equal(opened.length, 2)
  client.emit('open_window', { windowId: 4, inventoryType: 40 })
  client.emit('open_window', { windowId: 5, inventoryType: 2 })
  assert.deepEqual(warnings, ['FABRIC_MENU_DROPPED'])
  unguard()
  assert.equal(Object.hasOwn(client, 'emit'), false)
})

test('minecraft-data ID conventions are kept: shifted sound IDs, missing air item', () => {
  for (const version of ['1.16.5', '1.20.1', '1.20.4', '26.1']) {
    const shared = require('minecraft-data')(version)
    const { registry, report, map } = adapted(version)
    const base = Math.min(...shared.soundsArray.map(sound => sound.id))
    for (const sound of shared.soundsArray.slice(0, 50)) assert.equal(registry.sounds[sound.id].name, sound.name, version)
    assert.equal(registry.soundsByName['testmod:beep'].id, map.get('minecraft:sound_event').get('testmod:beep') + base)
    assert.equal(report.remapped.sounds, undefined, version)
    assert.equal(report.remapped.items, undefined, version)
    if (!shared.itemsByName.air) {
      assert.equal(registry.items[0].name, 'air')
      assert.equal(registry.items[0].modded, undefined)
      assert.equal(report.missing.items, 1)
    }
  }
})

test('pending mod menus do not survive configuration or disconnect', () => {
  for (const event of ['configuration', 'end']) {
    const client = new EventEmitter()
    const adapter = { menus: new Map([[40, 'testmod:crate']]) }
    const warnings = []
    const unguard = guardWindows(client, adapter, warning => warnings.push(warning))
    const opened = []
    client.on('open_window', packet => opened.push(packet))
    client.emit('open_window', { windowId: 1, inventoryType: 40 })
    if (event === 'end') client.emit('end')
    else client.emit('state', 'configuration')
    client.emit('window_items', { windowId: 1, items: new Array(45) })
    assert.deepEqual(opened, [])
    assert.deepEqual(warnings, [])
    unguard()
  }
})

test('reloading prismarine-block preserves mod collisions without changing shared shape tables', () => {
  for (const version of ['1.16.5', '1.21.4', '26.1']) {
    const shared = require('minecraft-data')(version).blockCollisionShapes
    const before = { blocks: { ...shared.blocks }, shapes: { ...shared.shapes } }
    const { registry, adapter, report } = adapted(version)
    for (let i = 0; i < 2; i++) {
      const Block = require('prismarine-block')(registry)
      assert.deepEqual(Block.fromStateId(report.unknownStateFrom + 12, 0).shapes, [[0, 0, 0, 1, 1, 1]])
      for (const block of registry.blocksArray) assert.ok(Array.isArray(Block.fromStateId(block.minStateId, 0).shapes), block.name)
    }
    assert.notEqual(registry.blockCollisionShapes, shared)
    assert.deepEqual(shared, before)
    adapter.restore()
    assert.equal(registry.blockCollisionShapes, shared)
  }
  const shapes = [[0, 0, 0, 1, 0.5, 1]]
  const { registry } = adapted('1.21.4', { modData: { blocks: {
    'testmod:machine': { stateCount: 1, shapes },
    'testmod:pipe': { stateCount: 1, boundingBox: 'empty' }
  } } })
  const Block = require('prismarine-block')(registry)
  assert.deepEqual(Block.fromStateId(registry.blocksByName['testmod:machine'].minStateId, 0).shapes, shapes)
  assert.deepEqual(Block.fromStateId(registry.blocksByName['testmod:pipe'].minStateId, 0).shapes, [])
})
