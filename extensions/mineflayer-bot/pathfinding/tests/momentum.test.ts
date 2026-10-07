import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'

for (const scenario of [
  { version: '1.20.4', block: 'ice' },
  { version: '1.20.4', block: 'packed_ice' },
  { version: '26.1.2', block: 'blue_ice' },
]) {
  test(`two ${scenario.block} blocks preserve incoming speed across a five-air-block gap on ${scenario.version}`, { timeout: 14000 }, async (t) => {
    const world = createFlatWorld(scenario.version, -64, { renderDistance: 1 })
    for (let x = 0; x <= 6; x++) world.setBlock(new Vec3(x, 63, 0), x >= 5 ? scenario.block : 'stone')
    for (let x = 12; x <= 15; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
    const { rig } = createCacheWorld(scenario.version, 64, new Vec3(5.5, 64, 0.5), { world })
    // A valid incoming sprint-jump speed; the controller must preserve it.
    rig.bot.entity.velocity = new Vec3(0.38, -0.0784, 0)
    rig.bot.entity.onGround = true
    const Item = require('prismarine-item')(rig.mcData)
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64)
    rig.bot.inventory.slots[9]!.slot = 9
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: true, movementTimeoutMs: 3000 },
      pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30, maxVisitedNodes: 20000 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    const routes: any[] = []
    let lowest = 64
    rig.bot.on('pathGenerated', (result: any) => routes.push(...result.path))
    rig.bot.on('physicsTick', () => { lowest = Math.min(lowest, rig.bot.entity.position.y) })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(13, 64, 0))
      assert.ok(routes.some(move => move.moveType.constructor.name === 'MomentumJump'), routes.map(m => m.moveType.constructor.name).join(','))
      assert.ok(routes.every(move => move.toPlace.length === 0 && move.toBreak.length === 0))
      assert.ok(lowest >= 63.99, `missed the jump: ${lowest}`)
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(13, 64, 0)))
      assert.equal(rig.bot.entity.onGround, true)
      for (let x = 7; x <= 11; x++) assert.equal(world.getBlock(new Vec3(x, 63, 0))?.name, 'air')
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

test('a five-block gap is not declared jumpable from a standing stone edge', async () => {
  const world = createFlatWorld('26.1.2', -64, { renderDistance: 1 })
  for (let x = 0; x <= 6; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
  world.setBlock(new Vec3(12, 63, 0), 'stone')
  const { rig } = createCacheWorld('26.1.2', 64, new Vec3(6.5, 64, 0.5), { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false }, pathfinderSettings: { searchTimeoutMs: 300 } }))
  try {
    const path = await rig.bot.pathfinder.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, new goals.GoalBlock(12, 64, 0))
    assert.equal(path, null)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('a long ice runway builds its own speed and jumps five air blocks from rest', { timeout: 16000 }, async (t) => {
  const world = createFlatWorld('26.1.2', -64, { renderDistance: 2 })
  for (let x = 0; x < 20; x++) world.setBlock(new Vec3(x, 63, 0), 'ice')
  for (let x = 25; x <= 29; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
  const { rig } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { world })
  const Item = require('prismarine-item')(rig.mcData)
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64)
  rig.bot.inventory.slots[9]!.slot = 9
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: true, movementTimeoutMs: 3000 },
    pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30 } }))
  t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
  const routes: any[] = []
  rig.bot.on('pathGenerated', (result: any) => routes.push(...result.path))
  try {
    await rig.bot.pathfinder.goto(new goals.GoalBlock(26, 64, 0))
    assert.ok(routes.some(move => move.moveType.constructor.name === 'MomentumJump'))
    assert.ok(routes.every(move => move.toPlace.length === 0))
    assert.ok(rig.bot.entity.position.floored().equals(new Vec3(26, 64, 0)))
    assert.equal(rig.bot.entity.onGround, true)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})
