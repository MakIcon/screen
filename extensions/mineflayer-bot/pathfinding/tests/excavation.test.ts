import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'
import { Move } from '../src/mineflayer-specific/move'
import { MovementHandler } from '../src/mineflayer-specific/movements/movementProvider'
import { IdleMovement } from '../src/mineflayer-specific/movements/movementProviders'
import { BlockInfo } from '../src/mineflayer-specific/world/cacheWorld'

const passage = { canDig: true, canPlace: false, allowJumpSprint: false,
  allowExcavatedDescent: true, maxDropDown: 1, excavationWidth: 2,
  excavationHeight: 2, excavationStairWidth: 2, excavationStairHeight: 3,
  movementTimeoutMs: 3000 }

function givePick (bot: any): void {
  const Item = require('prismarine-item')(bot.registry)
  const pick = new Item(bot.registry.itemsByName.netherite_pickaxe.id, 1)
  Object.defineProperty(pick, 'enchants', { value: [{ name: 'efficiency', lvl: 5 }] })
  pick.slot = 36; bot.inventory.slots[36] = pick
  bot.updateHeldItem(); bot.pathingUtil.refresh()
}

for (const version of ['1.20.4', '26.1.2']) {
  test(`excavates a complete 2x2 tunnel and walks back without digging on ${version}`, { timeout: 20000 }, async () => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5))
    for (let x = 1; x <= 5; x++) for (let z = 0; z <= 1; z++)
      for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(x, y, z), 'stone')
    rig.bot.loadPlugin(createPlugin({ moveSettings: { ...passage,
      exclusionAreasStep: [block => block.position.x >= 0 && block.position.x <= 5 &&
        block.position.y === 64 && block.position.z === 0 ? 0 : 1e6],
      exclusionAreasBreak: [block => block.position.x >= 0 && block.position.x <= 5 &&
        block.position.y >= 64 && block.position.y <= 65 && block.position.z >= 0 && block.position.z <= 1 ? 0 : 1e6] } }))
    givePick(rig.bot)
    let broken = 0
    rig.bot.on('diggingCompleted', () => broken++)
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(5, 64, 0), { allowMiningPrefix: true })
      for (let x = 0; x <= 5; x++) for (let z = 0; z <= 1; z++) {
        for (let y = 64; y <= 65; y++) assert.equal(world.getBlock(new Vec3(x, y, z))!.name, 'air', `${x},${y},${z}`)
        assert.equal(world.getBlock(new Vec3(x, 63, z))!.boundingBox, 'block')
        if (x > 0) assert.equal(world.getBlock(new Vec3(x, 66, z))!.name, 'stone')
      }
      assert.equal(broken, 20)
      rig.bot.pathfinder.setMoveOptions({ canDig: false, canPlace: false, excavationWidth: 0, excavationStairWidth: 0 })
      await rig.bot.pathfinder.goto(new goals.GoalBlock(0, 64, 0))
      assert.ok(rig.bot.entity.position.distanceTo(new Vec3(0.5, 64, 0.5)) < 0.15)
      assert.equal(broken, 20, 'return routing uses the world instead of a stored movement script')
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

test('descending stairs plan three-high headroom, intact floors, and no diagonal excavation', () => {
  const world = createFlatWorld('26.1.2', 60, { renderDistance: 1 })
  for (let x = -3; x <= 4; x++) for (let z = -3; z <= 3; z++)
    for (let y = 60; y <= 68; y++) world.setBlock(new Vec3(x, y, z), 'stone')
  for (let z = 0; z <= 1; z++) for (let y = 64; y <= 66; y++) world.clearBlock(new Vec3(0, y, z))
  const { rig, cacheWorld } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: passage }))
  try {
    const start = Move.startMove(new IdleMovement(rig.bot, cacheWorld), rig.bot.entity.position, new Vec3(0, 0, 0), 0)
    const handler = MovementHandler.create(rig.bot, cacheWorld, rig.bot.pathfinder.getActiveMappings().movements, passage)
    handler.loadGoal(new goals.GoalBlock(3, 61, 0))
    const neighbors = handler.getNeighbors(start, new Set())
    const down = neighbors.find(move => move.x === 1 && move.y === 63 && move.z === 0)!
    assert.ok(down)
    for (let z = 0; z <= 1; z++) for (let y = 63; y <= 66; y++)
      assert.ok(down.toBreak.some(entry => entry.vec.equals(new Vec3(1, y, z))), `clear ${1},${y},${z}`)
    assert.equal(down.toBreak.some(entry => entry.y === 62), false, 'landing floor survives')
    assert.equal(down.toBreak.some(entry => entry.x === 0 && entry.y === 63), false, 'departure floor survives')
    assert.ok(neighbors.filter(move => move.toBreak.length).every(move =>
      Math.abs(move.x - start.x) + Math.abs(move.z - start.z) === 1 && Math.abs(move.y - start.y) <= 1))
    world.setBlock(new Vec3(1, 66, 1), 'chest')
    rig.bot.pathfinder.setMoveOptions({ ...passage, exclusionAreasBreak: [(block: BlockInfo) => block.block?.name === 'chest' ? 1e6 : 0] })
    const protectedHandler = MovementHandler.create(rig.bot, cacheWorld, rig.bot.pathfinder.getActiveMappings().movements,
      rig.bot.pathfinder.defaultMoveSettings)
    protectedHandler.loadGoal(new goals.GoalBlock(3, 61, 0))
    assert.equal(protectedHandler.getNeighbors(start, new Set()).some(move => move.x === 1 && move.y === 63 && move.z === 0), false)
  } finally { rig.stopPassivePhysics(); cacheWorld.dispose() }
})

test('walks down newly excavated stairs and climbs them back without clearing a second ceiling', { timeout: 25000 }, async () => {
  const world = createFlatWorld('26.1.2', 59, { renderDistance: 1 })
  for (let x = -2; x <= 6; x++) for (let z = -2; z <= 3; z++)
    for (let y = 59; y <= 68; y++) world.setBlock(new Vec3(x, y, z), 'stone')
  for (let z = 0; z <= 1; z++) for (let y = 64; y <= 66; y++) world.clearBlock(new Vec3(0, y, z))
  const { rig } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { ...passage, exclusionAreasBreak: [block => {
    const { x, y, z } = block.position
    return x >= 0 && x <= 4 && z >= 0 && z <= 1 && y >= 64 - x && y <= 67 - x ? 0 : 1e6
  }] } }))
  givePick(rig.bot)
  let broken = 0
  rig.bot.on('diggingCompleted', () => broken++)
  try {
    await rig.bot.pathfinder.goto(new goals.GoalBlock(4, 60, 0), { allowMiningPrefix: true })
    for (let x = 1; x <= 4; x++) for (let z = 0; z <= 1; z++) {
      for (let y = 64 - x; y <= 67 - x; y++) assert.equal(world.getBlock(new Vec3(x, y, z))!.name, 'air')
      assert.equal(world.getBlock(new Vec3(x, 63 - x, z))!.name, 'stone')
    }
    const before = broken
    rig.bot.pathfinder.setMoveOptions({ canDig: false, canPlace: false, excavationWidth: 0, excavationStairWidth: 0 })
    await rig.bot.pathfinder.goto(new goals.GoalBlock(0, 64, 0))
    assert.equal(broken, before)
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(0.5, 64, 0.5)) < 0.15)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('excavates upward stairs with headroom across the takeoff and landing', { timeout: 25000 }, async () => {
  const world = createFlatWorld('26.1.2', 59, { renderDistance: 1 })
  for (let x = -2; x <= 5; x++) for (let z = -2; z <= 3; z++)
    for (let y = 59; y <= 72; y++) world.setBlock(new Vec3(x, y, z), 'stone')
  for (let z = 0; z <= 1; z++) for (let y = 64; y <= 66; y++) world.clearBlock(new Vec3(0, y, z))
  const { rig } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { ...passage, exclusionAreasBreak: [block => {
    const { x, y, z } = block.position
    return x >= 0 && x <= 3 && z >= 0 && z <= 1 && y >= 64 + x && y <= 67 + x ? 0 : 1e6
  }] } }))
  givePick(rig.bot)
  try {
    await rig.bot.pathfinder.goto(new goals.GoalBlock(3, 67, 0), { allowMiningPrefix: true })
    for (let x = 0; x <= 3; x++) for (let z = 0; z <= 1; z++) {
      for (let y = 64 + x; y <= 66 + x + (x < 3 ? 1 : 0); y++)
        assert.equal(world.getBlock(new Vec3(x, y, z))!.name, 'air', `${x},${y},${z}`)
      assert.equal(world.getBlock(new Vec3(x, 63 + x, z))!.name, 'stone')
    }
    rig.bot.pathfinder.setMoveOptions({ canDig: false, canPlace: false, excavationWidth: 0, excavationStairWidth: 0 })
    await rig.bot.pathfinder.goto(new goals.GoalBlock(0, 64, 0))
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(0.5, 64, 0.5)) < 0.15)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('a new lower turn preserves an earlier stair floor without leaking reservations to another branch', () => {
  const world = createFlatWorld('26.1.2', 58, { renderDistance: 1 })
  for (let x = -2; x <= 3; x++) for (let z = -2; z <= 3; z++)
    for (let y = 58; y <= 67; y++) world.setBlock(new Vec3(x, y, z), 'stone')
  for (let z = 0; z <= 1; z++) for (let y = 62; y <= 64; y++) world.clearBlock(new Vec3(0, y, z))
  const pos = new Vec3(0.5, 62, 0.5)
  const { rig, cacheWorld } = createCacheWorld('26.1.2', 62, pos, { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: passage }))
  try {
    const provider = new IdleMovement(rig.bot, cacheWorld)
    const start = Move.startMove(provider, pos, new Vec3(0, 0, 0), 0)
    const previousStair = Move.fromPrevious(0, pos, start, provider)
    previousStair.metadata = { excavationFloors: [new Vec3(1, 64, 0)] }
    const handler = MovementHandler.create(rig.bot, cacheWorld, rig.bot.pathfinder.getActiveMappings().movements, passage)
    handler.loadGoal(new goals.GoalBlock(1, 61, 0))
    const hasLowerTurn = (move: Move): boolean => handler.getNeighbors(move, new Set())
      .some(next => next.x === 1 && next.y === 61 && next.z === 0)
    assert.equal(hasLowerTurn(previousStair), false, 'clearing the lower ceiling would destroy the older upper floor')
    assert.equal(hasLowerTurn(start), true, 'the unrelated search branch did not build that older stair')
  } finally { rig.stopPassivePhysics(); cacheWorld.dispose() }
})
