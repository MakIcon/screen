import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { Vec3 } from 'vec3'
import { createPlugin } from '../src'
import { BlockInfo } from '../src/mineflayer-specific/world/cacheWorld'
import { createCacheWorld } from './setup'

test('navigation refreshes IDs for different Fabric registries of the same version', () => {
  const first = require('prismarine-registry')('1.21.4')
  const second = require('prismarine-registry')('1.21.4')
  BlockInfo.init(first)
  const cobble = second.itemsByName.cobblestone
  const remapped = { ...cobble, id: 50000 }
  second.items = { ...second.items, [remapped.id]: remapped }
  second.itemsByName = { ...second.itemsByName, cobblestone: remapped }
  BlockInfo.init(second)
  assert.ok(BlockInfo.scaffoldingBlockItems.has(remapped.id))
  assert.equal(BlockInfo.scaffoldingBlockItems.has(cobble.id), false)
  BlockInfo.init(first)
  assert.ok(BlockInfo.scaffoldingBlockItems.has(cobble.id))
  assert.equal(BlockInfo.scaffoldingBlockItems.has(remapped.id), false)
})

test('PLAY adaptation and proxy configuration clear navigation caches and refresh item IDs', async () => {
  const { rig } = createCacheWorld('1.21.4', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
  rig.stopPassivePhysics()
  const fabric = new EventEmitter()
  ;(rig.bot as any).fabric = fabric
  rig.bot.loadPlugin(createPlugin())
  const registry = rig.bot.registry
  const baseline = { items: registry.items, names: registry.itemsByName }
  const cobble = registry.itemsByName.cobblestone
  let cleared = 0
  const clear = rig.bot.pathfinder.world.cleanup?.bind(rig.bot.pathfinder.world)
  rig.bot.pathfinder.world.cleanup = () => { cleared++; clear?.() }
  try {
    const remapped = { ...cobble, id: 50000 }
    registry.items = { ...registry.items, [remapped.id]: remapped }
    registry.itemsByName = { ...registry.itemsByName, cobblestone: remapped }
    fabric.emit('adapted')
    assert.ok(BlockInfo.scaffoldingBlockItems.has(remapped.id))
    assert.equal(BlockInfo.scaffoldingBlockItems.has(cobble.id), false)
    registry.items = baseline.items
    registry.itemsByName = baseline.names
    fabric.emit('configuration')
    assert.ok(BlockInfo.scaffoldingBlockItems.has(cobble.id))
    assert.equal(BlockInfo.scaffoldingBlockItems.has(remapped.id), false)
    assert.equal(cleared, 2)
    rig.bot.emit('end', 'fixture disconnect')
    assert.equal(fabric.listenerCount('adapted'), 0)
    assert.equal(fabric.listenerCount('configuration'), 0)
  } finally {
    registry.items = baseline.items
    registry.itemsByName = baseline.names
    await rig.bot.pathfinder.destroy()
  }
})
