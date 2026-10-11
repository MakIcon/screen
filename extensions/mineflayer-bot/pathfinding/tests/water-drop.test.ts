import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, Move, movementProviders } from '../src'
import { WaterDrop, predictWaterDrop } from '../src/mineflayer-specific/movements/waterDrop'
import { MovementHandler } from '../src/mineflayer-specific/movements/movementProvider'
import { createCacheWorld, createFlatWorld } from './setup'

for (const version of ['1.20.4', '26.1.2']) {
  test(`water drop predicts reachable river, rejects distant water and executes on ${version}`, { timeout: 12000 }, async (t) => {
    const world = createFlatWorld(version, 60, { renderDistance: 1 })
    world.setBlock(new Vec3(0, 83, 0), 'stone')
    for (let x = 4; x <= 11; x++) for (let z = -2; z <= 2; z++) {
      for (let y = 60; y <= 63; y++) world.setBlock(new Vec3(x, y, z), 'water')
    }
    const { rig, cacheWorld } = createCacheWorld(version, 84, new Vec3(0.5, 84, 0.5), { world })
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowBucketWaterDrop: false, movementTimeoutMs: 3000 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      assert.ok(predictWaterDrop(rig.bot, cacheWorld, rig.bot.entity.position, new Vec3(0, 0, 0), new Vec3(4.5, 63.1, 0.5), false, true))
      assert.equal(predictWaterDrop(rig.bot, cacheWorld, rig.bot.entity.position, new Vec3(0, 0, 0), new Vec3(11.5, 63.1, 0.5), false, true), undefined)
      const used: Move[] = []
      rig.bot.on('pathGenerated', (result: any) => used.push(...result.path))
      await rig.bot.pathfinder.goto(new goals.GoalNear(4.5, 63, 0.5, 1))
      assert.ok(used.some(move => move.moveType instanceof WaterDrop))
      assert.equal(rig.bot.entity.isInWater, true)
      assert.ok(rig.bot.entity.position.x >= 4)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })

  test(`bucket drop equips, places in reach, lands and collects its source on ${version}`, { timeout: 12000 }, async (t) => {
    const world = createFlatWorld(version, 64, { renderDistance: 1 })
    world.setBlock(new Vec3(0, 83, 0), 'stone')
    const { rig } = createCacheWorld(version, 84, new Vec3(0.5, 84, 0.5), { world })
    const Item = require('prismarine-item')(rig.mcData)
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.water_bucket.id, 1)
    rig.bot.inventory.slots[9]!.slot = 9
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowWaterDrop: false, movementTimeoutMs: 3000 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    const actions: string[] = []
    let source: Vec3 | undefined
    rig.bot.activateItem = () => {
      const move = rig.bot.pathfinder.currentMove
      assert.ok(move?.metadata?.bucketWaterDrop)
      const target = move.exitPos.floored()
      const eye = rig.bot.entity.position.offset(0, 1.62, 0)
      const slot = rig.bot.heldItem.slot
      if (rig.bot.heldItem.name === 'water_bucket') {
        assert.ok(eye.distanceTo(target.offset(0.5, 0, 0.5)) <= 4.5)
        assert.equal(rig.bot.entity.onGround, false)
        actions.push('place'); source = target
        world.setBlock(target, 'water')
        rig.bot.inventory.slots[slot] = new Item(rig.mcData.itemsByName.bucket.id, 1)
      } else {
        assert.equal(rig.bot.heldItem.name, 'bucket')
        assert.equal(rig.bot.entity.onGround, true)
        assert.ok(source?.equals(target))
        actions.push('collect'); world.setBlock(target, 'air')
        rig.bot.inventory.slots[slot] = new Item(rig.mcData.itemsByName.water_bucket.id, 1)
      }
      rig.bot.inventory.slots[slot].slot = slot
    }
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(1, 64, 0))
      assert.deepEqual(actions, ['place', 'collect'])
      assert.equal(world.getBlock(source!)?.name, 'air')
      assert.ok(rig.bot.inventory.items().some((item: any) => item.name === 'water_bucket'))
      assert.equal(rig.bot.entity.onGround, true)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

test('water drop settings, inventory, Nether, roof and lava constrain route generation', async () => {
  const world = createFlatWorld('1.20.4', 64, { renderDistance: 1 })
  world.setBlock(new Vec3(0, 83, 0), 'stone')
  const { rig, cacheWorld } = createCacheWorld('1.20.4', 84, new Vec3(0.5, 84, 0.5), { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false } }))
  const neighbors = (settings: any) => {
    const handler = MovementHandler.create(rig.bot, cacheWorld, rig.bot.pathfinder.movements, settings)
    handler.loadGoal(new goals.GoalBlock(1, 64, 0))
    return handler.getNeighbors(Move.startMove(new movementProviders.IdleMovement(rig.bot, cacheWorld), rig.bot.entity.position, new Vec3(0, 0, 0), 0), new Set())
  }
  try {
    assert.ok(neighbors({ allowWaterDrop: false, allowBucketWaterDrop: true }).every(move => !(move.moveType instanceof WaterDrop)))
    const Item = require('prismarine-item')(rig.mcData)
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.water_bucket.id, 1)
    rig.bot.inventory.slots[9]!.slot = 9
    assert.ok(neighbors({ allowWaterDrop: false, allowBucketWaterDrop: true }).some(move => move.metadata?.bucketWaterDrop))
    assert.ok(neighbors({ allowWaterDrop: false, allowBucketWaterDrop: false }).every(move => !(move.moveType instanceof WaterDrop)))
    rig.bot.game.dimension = 'minecraft:the_nether'
    assert.ok(neighbors({ allowWaterDrop: false, allowBucketWaterDrop: true }).every(move => !(move.moveType instanceof WaterDrop)))
    rig.bot.game.dimension = 'minecraft:overworld'
    for (let z = -2; z <= 2; z++) for (let x = 1; x <= 5; x++) {
      world.setBlock(new Vec3(x, 64, z), 'water')
      world.setBlock(new Vec3(x, 75, z), 'stone')
    }
    assert.equal(predictWaterDrop(rig.bot, cacheWorld, rig.bot.entity.position, new Vec3(0, 0, 0), new Vec3(2.5, 64.1, 0.5), false, true), undefined)
    for (let x = 1; x <= 5; x++) for (let z = -2; z <= 2; z++) {
      world.setBlock(new Vec3(x, 75, z), 'air'); world.setBlock(new Vec3(x, 64, z), 'lava')
    }
    assert.equal(predictWaterDrop(rig.bot, cacheWorld, rig.bot.entity.position, new Vec3(0, 0, 0), new Vec3(2.5, 64.1, 0.5), false, true), undefined)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('landing scan visits each height once, stops at roofs and respects the ground limit', () => {
  const world = createFlatWorld('1.20.4', 60, { renderDistance: 1 })
  const { rig, cacheWorld } = createCacheWorld('1.20.4', 84, new Vec3(0.5, 84, 0.5), { world })
  const provider = new movementProviders.ForwardDropDown(rig.bot, cacheWorld, { allowWaterDrop: true })
  const start = Move.startMove(provider, new Vec3(0.5, 84, 0.5), new Vec3(0, 0, 0), 0)
  let queried: number[] = []
  provider.getBlockInfo = (pos, dx, dy, dz) => {
    queried.push(Math.floor(pos.y) + dy)
    return cacheWorld.getBlockInfo(new Vec3(Math.floor(pos.x) + dx, Math.floor(pos.y) + dy, Math.floor(pos.z) + dz))
  }
  try {
    world.setBlock(new Vec3(1, 76, 0), 'stone')
    world.setBlock(new Vec3(1, 64, 0), 'water')
    assert.equal(provider.getLandingBlock(cacheWorld.getBlockInfo(start.exitPos), start, new Vec3(1, 0, 0)), null)
    assert.equal(queried.length, 8)
    assert.equal(new Set(queried).size, queried.length)
    provider.settings.allowWaterDrop = false
    queried = []
    assert.equal(provider.getLandingBlock(cacheWorld.getBlockInfo(start.exitPos), start, new Vec3(1, 0, 0)), null)
    assert.equal(queried.length, 4)
  } finally { cacheWorld.dispose(); rig.stopPassivePhysics() }
})

test('a one-block deep puddle is a verified landing for a high jump', { timeout: 7000 }, async () => {
  const world = createFlatWorld('26.1.2', 63, { renderDistance: 1 })
  world.setBlock(new Vec3(0, 83, 0), 'stone')
  for (let x = 4; x <= 7; x++) for (let z = -1; z <= 1; z++) world.setBlock(new Vec3(x, 63, z), 'water')
  const { rig } = createCacheWorld('26.1.2', 84, new Vec3(0.5, 84, 0.5), { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowBucketWaterDrop: false } }))
  try {
    await rig.bot.pathfinder.goto(new goals.GoalBlock(4, 63, 0))
    assert.equal(world.getBlock(rig.bot.entity.position)?.name, 'water')
    assert.equal(rig.bot.entity.onGround, true)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})
