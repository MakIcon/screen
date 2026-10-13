import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, movementProviders } from '../src'
import { createCacheWorld } from './setup'

function navigation (rig: ReturnType<typeof createCacheWorld>['rig'], canDig = true) {
  rig.bot.loadPlugin(createPlugin({
    pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, maxVisitedNodes: 20000,
      heuristicWeight: 1.5, routePrefixMs: 30, routePrefixLength: 16 },
    moveSettings: { canDig, allowJumpSprint: false, movementTimeoutMs: 3000 }
  }))
  for (const provider of [movementProviders.ParkourForward, movementProviders.ParkourDiagonal,
    movementProviders.MomentumJump, movementProviders.NeoProvider]) rig.bot.pathfinder.dropMovement(provider)
  const Item = require('prismarine-item')(rig.mcData)
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64)
  rig.bot.inventory.slots[9].slot = 9
  return rig.bot.pathfinder
}

test('come reuses an open mine staircase even when its entrance is away from the player', { timeout: 22000 }, async (t) => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
  for (let x = -15; x <= 6; x++) for (let z = -3; z <= 3; z++)
    for (let y = 64; y <= 74; y++) world.setBlock(new Vec3(x, y, z), 'dirt')
  for (let x = -12; x <= 0; x++) for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(x, y, 0), 'air')
  for (let step = 0; step <= 11; step++) {
    const x = -12 + step
    for (let y = 64 + step; y <= 67 + step; y++) world.setBlock(new Vec3(x, y, 1), 'air')
  }
  const navigator = navigation(rig)
  const Item = require('prismarine-item')(rig.mcData)
  rig.bot.inventory.slots[10] = new Item(rig.mcData.itemsByName.diamond_shovel.id, 1)
  rig.bot.inventory.slots[10].slot = 10
  const digs: Vec3[] = [], placed: Vec3[] = []
  const dig = rig.bot.dig
  rig.bot.dig = (block: any, ...args: any[]) => { digs.push(block.position.clone()); return dig(block, ...args) }
  const place = rig.bot._placeBlockWithOptions
  rig.bot._placeBlockWithOptions = (block: any, face: Vec3, ...args: any[]) => {
    placed.push(block.position.plus(face)); return place(block, face, ...args)
  }
  t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
  try {
    await navigator.goto(new goals.GoalNear(0.5, 75, 1.5, 0.7))
    assert.deepEqual(digs, [], 'return through the existing passage without excavating another exit')
    assert.deepEqual(placed, [], 'the existing stairs need no scaffold')
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(new Vec3(0.5, 75, 1.5)) < 0.8)
  } finally { await navigator.destroy(); rig.stopPassivePhysics() }
})

test('come builds a tall continuous tower beside an overhead platform', { timeout: 30000 }, async (t) => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
  for (let x = 1; x <= 5; x++) for (let z = -1; z <= 1; z++) world.setBlock(new Vec3(x, 83, z), 'stone')
  const navigator = navigation(rig, false)
  const paths: any[] = [], placements: number[] = []
  let ticks = 0, firstMove: number | undefined
  const started = performance.now()
  rig.bot.on('physicsTick', () => { ticks++ })
  rig.bot.on('pathGenerated', (path: any) => { paths.push(path); firstMove ??= performance.now() - started })
  const place = rig.bot._placeBlockWithOptions
  rig.bot._placeBlockWithOptions = (block: any, face: Vec3, ...args: any[]) => {
    placements.push(ticks); return place(block, face, ...args)
  }
  t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
  try {
    await navigator.goto(new goals.GoalNear(2.5, 84, 0.5, 0.7))
    assert.ok(firstMove! < 700, `first route=${firstMove}ms`)
    assert.ok(paths.length <= 3, `route searches=${paths.length}`)
    assert.ok(placements.length >= 18, `placed=${placements.length}`)
    const gaps = placements.slice(1).map((tick, i) => tick - placements[i])
    assert.ok(Math.max(...gaps) < 35, `placement gaps=${gaps}`)
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(new Vec3(2.5, 84, 0.5)) < 0.8)
    t.diagnostic(`tower: first route=${firstMove!.toFixed(1)}ms, routes=${paths.length}, placement gaps=${gaps}`)
  } finally { await navigator.destroy(); rig.stopPassivePhysics() }
})

for (const merged of [true, false]) test(`ordinary walking releases stale sneak and keeps sprint through ${merged ? 'merged' : 'short'} waypoints`, { timeout: 10000 }, async (t) => {
  const { rig } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
  const navigator = navigation(rig, false)
  navigator.setMoveOptions({ canPlace: false })
  rig.bot.setControlState('sneak', true)
  let slowTicks = 0, samples = 0, injectedSneak = false
  rig.bot.on('physicsTick', () => {
    const pos = rig.bot.entity.position
    if (!injectedSneak && pos.x >= 2) {
      injectedSneak = true
      rig.bot.setControlState('sneak', true)
    }
    if (pos.x < 3 || pos.x > 17) return
    samples++
    if (rig.bot.getControlState('sneak') || !rig.bot.getControlState('sprint') ||
        Math.hypot(rig.bot.entity.velocity.x, rig.bot.entity.velocity.z) < 0.12) slowTicks++
  })
  // Exercise unmerged waypoints, as on routes with turns and interactions.
  if (!merged) navigator.optimizerRegistry.clear()
  t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
  try {
    await navigator.goto(new goals.GoalBlock(20, 64, 0))
    assert.ok(samples > 20)
    assert.ok(slowTicks <= 2, `slow travel ticks=${slowTicks}/${samples}`)
    t.diagnostic(`walking: slow ticks=${slowTicks}/${samples}`)
  } finally { await navigator.destroy(); rig.stopPassivePhysics() }
})

test('overhead construction respects placement exclusions and available inventory', async () => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
  for (let x = 1; x <= 4; x++) world.setBlock(new Vec3(x, 73, 0), 'stone')
  const navigator = navigation(rig, false)
  navigator.setMoveOptions({ exclusionAreasPlace: [(block: any) => block.position.x === 0 && block.position.z === 0 ? Infinity : 0] })
  const goal = new goals.GoalBlock(2, 74, 0)
  try {
    const path = await navigator.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, goal)
    assert.ok(path != null, 'an adjacent unrestricted tower can still reach the platform')
    assert.ok(path.path.every((move: any) => move.remainingBlocks >= 0 &&
      move.toPlace.every((place: any) => place.vec.x !== 0 || place.vec.z !== 0)))
    rig.bot.inventory.slots[9].count = 3
    navigator.setOptions({ searchTimeoutMs: 100, maxVisitedNodes: 2000 })
    assert.equal(await navigator.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, goal), null,
      'the fast probe cannot invent the missing tower blocks')
    assert.equal(rig.bot.entity.position.y, 64, 'planning never moves the real player')
  } finally { await navigator.destroy(); rig.stopPassivePhysics() }
})
