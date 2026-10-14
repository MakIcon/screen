import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, installSurfaceSwimming } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'
import { clearBodySegment } from '../src/mineflayer-specific/navigationGeometry'
import { ShoreRouteGoal } from '../src/mineflayer-specific/shore'
import type { Move } from '../src/mineflayer-specific/move'

test('entity following tracks a replaced position vector and ignores other entities', () => {
  const entity = { position: new Vec3(0.5, 64, 0.5) }
  const goal = goals.GoalFollowEntity.fromEntity(entity, 1, { neverfinish: true })
  entity.position = new Vec3(8.5, 65, 0.5)
  assert.equal(goal.hasChanged('entityMoved', entity as any), true)
  goal.update()
  assert.equal(goal.x, 8.5)
  assert.equal(goal.refVec, entity.position)
  assert.equal(goal.isValid('entityGone', { position: entity.position } as any), true)
  assert.equal(goal.isValid('entityGone', entity as any), false)
})

test('body sweep catches a wall beside a clear centre line and allows a safe detour', async () => {
  const { rig, world, cacheWorld } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5))
  try {
    world.setBlock(new Vec3(2, 65, 0), 'stone')
    assert.equal(clearBodySegment(cacheWorld, new Vec3(0.5, 64, 0.5), new Vec3(3.5, 64, 1.5)), false)
    assert.equal(clearBodySegment(cacheWorld, new Vec3(0.5, 64, 1.5), new Vec3(3.5, 64, 1.5)), true)
  } finally { rig.stopPassivePhysics(); cacheWorld.dispose() }
})

test('follow survives an unreachable target and notices movement without an entity event', { timeout: 6000 }, async () => {
  const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5))
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false },
    pathfinderSettings: { searchTimeoutMs: 80, tickTimeoutMs: 2, maxVisitedNodes: 500 } }))
  const target = new Vec3(0.5, 85, 0.5)
  let failure: unknown, finished = false
  const running = rig.bot.pathfinder.goto(new goals.GoalFollowEntity(target, 1, { neverfinish: true }))
    .catch((error: unknown) => { failure = error }).finally(() => { finished = true })
  try {
    await rig.bot.waitForTicks(12)
    assert.equal(finished, false, 'a failed search must not terminate following')
    target.set(6.5, 64, 0.5)
    await rig.bot.waitForTicks(65)
    assert.equal(failure, undefined)
    assert.ok(rig.bot.entity.position.distanceTo(target) <= 1.1, `position=${rig.bot.entity.position}`)
    await rig.bot.pathfinder.stop(); await running
    assert.equal(rig.bot.getControlState('forward'), false)
    assert.equal(rig.bot.listenerCount('entityMoved'), 0)
  } finally { await rig.bot.pathfinder.destroy(); await running; rig.stopPassivePhysics() }
})

test('idle follow resumes after the bot is displaced without a target event', { timeout: 5000 }, async () => {
  const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5))
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false } }))
  const target = new Vec3(0.5, 64, 0.5)
  const running = rig.bot.pathfinder.goto(new goals.GoalFollowEntity(target, 1, { neverfinish: true }))
  try {
    await rig.bot.waitForTicks(3)
    rig.bot.entity.position.set(5.5, 64, 0.5)
    await rig.bot.waitForTicks(55)
    assert.ok(rig.bot.entity.position.distanceTo(target) <= 1.1, `position=${rig.bot.entity.position}`)
    await rig.bot.pathfinder.stop(); await running
  } finally { await rig.bot.pathfinder.destroy(); await running; rig.stopPassivePhysics() }
})

test('come retries a blocked walking step and reaches its original destination', { timeout: 6000 }, async (t) => {
  const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5))
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, movementTimeoutMs: 2000 } }))
  const simulate = rig.bot.physics.simulatePlayer
  let blockedTicks = 0, routes = 0
  rig.bot.physics.simulatePlayer = (state: any, world: any) => {
    const result = simulate(state, world)
    if (++blockedTicks <= 28) {
      result.pos.x = 0.5; result.pos.z = 0.5
      result.vel.x = 0; result.vel.z = 0
      result.isCollidedHorizontally = true
    }
    return result
  }
  rig.bot.on('pathGenerated', () => routes++)
  t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
  try {
    await rig.bot.pathfinder.goto(new goals.GoalNear(7.5, 64, 0.5, 0.7))
    assert.ok(routes >= 2, `replanned routes=${routes}`)
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(7.5, 64, 0.5)) <= 0.8)
  } finally { rig.bot.physics.simulatePlayer = simulate; await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('stop cancels a failed follow search and its retry wait promptly', { timeout: 3000 }, async () => {
  const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5))
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false },
    pathfinderSettings: { searchTimeoutMs: 60, tickTimeoutMs: 2, maxVisitedNodes: 200 } }))
  const listeners = rig.bot.listenerCount('blockUpdate')
  const running = rig.bot.pathfinder.goto(new goals.GoalFollowEntity(new Vec3(0.5, 90, 0.5), 1, { neverfinish: true }))
  try {
    await rig.bot.waitForTicks(5)
    const before = performance.now()
    await rig.bot.pathfinder.stop(); await running
    assert.ok(performance.now() - before < 300)
    assert.equal(rig.bot.listenerCount('blockUpdate'), listeners)
    assert.equal(rig.bot.listenerCount('entityMoved'), 0)
    await rig.bot.waitForTicks(4)
    assert.equal(rig.bot.pathfinder.isPathing, false)
    assert.equal(rig.bot.getControlState('forward'), false)
  } finally { await rig.bot.pathfinder.destroy(); await running; rig.stopPassivePhysics() }
})

test('an interrupted execution cannot report arrival before reaching the come goal', { timeout: 4000 }, async (t) => {
  const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5))
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false } }))
  const navigator = rig.bot.pathfinder
  const perform = navigator.perform.bind(navigator)
  let attempts = 0
  navigator.perform = async (...args: Parameters<typeof perform>) => {
    if (++attempts === 1) return // Recovery found no continuation and returned.
    await perform(...args)
  }
  t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
  try {
    await navigator.goto(new goals.GoalNear(6.5, 64, 0.5, 0.7))
    assert.equal(attempts, 2)
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(6.5, 64, 0.5)) <= 0.8)
  } finally { await navigator.destroy(); rig.stopPassivePhysics() }
})

test('recovery resumes beyond the reached bend without replaying the old corridor', { timeout: 12000 }, async (t) => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5))
  for (let x = -1; x <= 8; x++) for (let z = -1; z <= 4; z++) for (let y = 64; y <= 65; y++) {
    const passage = (z === 0 && x >= 0 && x <= 3) || (x === 3 && z >= 0 && z <= 3) || (z === 3 && x >= 3 && x <= 7)
    if (!passage) world.setBlock(new Vec3(x, y, z), 'stone')
  }
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false } }))
  const navigator = rig.bot.pathfinder
  const goal = new goals.GoalBlock(7, 64, 3)
  t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
  try {
    const route = await navigator.getPathFromToRaw(rig.bot.entity.position, new Vec3(0, 0, 0), goal)
    assert.ok(route && route.path.length > 5)
    const failed = route.path[0]
    rig.bot.entity.position.set(3.5, 64, 2.5)
    rig.bot.entity.velocity.set(0, 0, 0)
    rig.bot.entity.onGround = true
    let lowestZ = 2.5
    rig.bot.on('physicsTick', () => { lowestZ = Math.min(lowestZ, rig.bot.entity.position.z) })
    await navigator.recovery(failed, route, goal)
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(7.5, 64, 3.5)) < 0.4)
    assert.ok(lowestZ >= 2.3, `recovery walked back toward an already completed bend: z=${lowestZ}`)
  } finally { await navigator.destroy(); rig.stopPassivePhysics() }
})

test('a container approach retries execution that stopped before reaching its visible face', { timeout: 6000 }, async (t) => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5))
  const chest = world.setBlock(new Vec3(8, 64, 0), 'chest')
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false } }))
  const navigator = rig.bot.pathfinder, perform = navigator.perform.bind(navigator)
  let attempts = 0
  navigator.perform = async (...args: Parameters<typeof perform>) => { if (++attempts > 1) await perform(...args) }
  t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
  try {
    await navigator.goto(goals.GoalLookAt.fromBlock(navigator.world, chest, 4))
    assert.equal(attempts, 2)
    assert.ok(rig.bot.entity.position.x > 4, `position=${rig.bot.entity.position}`)
  } finally { await navigator.destroy(); rig.stopPassivePhysics() }
})

for (const version of ['1.20.4', '26.1.2']) {
  for (const method of ['building', 'digging', 'digging below the player'] as const) test(`a mountain ledge continues by ${method} even when the full ascent search times out on ${version}`, { timeout: 24000 }, async (t) => {
    const world = createFlatWorld(version, 56, { renderDistance: 2 })
    for (let x = -5; x <= 12; x++) for (let z = -5; z <= 5; z++) for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), 'water')
    for (let z = -3; z <= 3; z++) world.setBlock(new Vec3(2, 63, z), 'stone')
    for (let x = 3; x <= 12; x++) for (let z = -3; z <= 3; z++) for (let y = 56; y <= 71; y++) world.setBlock(new Vec3(x, y, z), 'stone')
    const { rig } = createCacheWorld(version, 64, new Vec3(2.5, 64, 0.5), { world })
    const Item = require('prismarine-item')(rig.mcData)
    rig.bot.inventory.slots[9] = method === 'building'
      ? new Item(rig.mcData.itemsByName.cobblestone.id, 64)
      : new Item(rig.mcData.itemsByName.diamond_pickaxe.id, 1)
    rig.bot.inventory.slots[9]!.slot = 9
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: method !== 'building', canPlace: method === 'building', allowJumpSprint: false, movementTimeoutMs: 3000 },
      pathfinderSettings: { searchTimeoutMs: 100, tickTimeoutMs: 3, routePrefixMs: 15, routePrefixLength: 2, maxVisitedNodes: 1500 } }))
    const placed: Vec3[] = []
    const place = rig.bot._placeBlockWithOptions
    rig.bot._placeBlockWithOptions = (reference: any, face: Vec3, ...args: any[]) => {
      placed.push(reference.position.plus(face))
      return place(reference, face, ...args)
    }
    const dug: Vec3[] = []
    const dig = rig.bot.dig
    rig.bot.dig = (block: any, ...args: any[]) => { dug.push(block.position.clone()); return dig(block, ...args) }
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    const target = new Vec3(method === 'digging' ? 11.5 : 5.5, 72, 0.5)
    const getPathTo = rig.bot.pathfinder.getPathTo.bind(rig.bot.pathfinder)
    let incompleteSearches = 0
    rig.bot.pathfinder.getPathTo = async function * (...args: Parameters<typeof getPathTo>) {
      for await (const result of getPathTo(...args)) {
        if (['partial', 'success', 'timeout'].includes(result.result.status) && rig.bot.entity.position.y < target.y - 2 &&
            result.result.path.some((move: Move) => move.exitPos.y >= rig.bot.entity.position.y + 0.9)) {
          incompleteSearches++
          // Model a bounded search that verified the next few steps, but has
          // not returned the complete route to the player above the mountain.
          yield { ...result, result: { ...result.result, status: 'timeout' as const, path: result.result.path.slice(0, 2) } }
          return
        }
        yield result
      }
    }
    try {
      await rig.bot.pathfinder.goto(goals.GoalFollowEntity.fromEntity({ position: target }, 0.8, { neverfinish: false }))
      if (method === 'building') {
        assert.ok(placed.some(pos => pos.y >= 64), 'build a supported ascent from the ledge')
        assert.equal(dug.length, 0, 'respect disabled digging')
      } else {
        assert.ok(dug.some(pos => pos.y >= 65), 'carve an ascent through the mountain')
        assert.equal(placed.length, 0, 'climb without scaffold blocks')
      }
      assert.ok(rig.bot.entity.position.distanceTo(target) <= 0.85, `position=${rig.bot.entity.position}`)
      assert.equal(rig.bot.entity.onGround, true)
      assert.ok(incompleteSearches >= 2, 'continue climbing across repeated incomplete searches')
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })

  test(`navigation rounds a wall from an off-centre start on ${version}`, { timeout: 6500 }, async (t) => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.8, 64, 0.8))
    for (let z = -3; z <= 3; z++) for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(2, y, z), 'stone')
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false },
      pathfinderSettings: { tickTimeoutMs: 3, searchTimeoutMs: 500 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalNear(4.5, 64, 0.5, 0.6))
      assert.ok(rig.bot.entity.position.distanceTo(new Vec3(4.5, 64, 0.5)) < 0.7, `position=${rig.bot.entity.position}`)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })

  test(`water navigation passes an isolated ledge to reach a mountain bridge without blocks on ${version}`, { timeout: 15000 }, async (t) => {
    const world = createFlatWorld(version, 56, { renderDistance: 2 })
    for (let x = -8; x <= 18; x++) for (let z = -8; z <= 8; z++) for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), 'water')
    // The tempting nearest exit has no onward land connection.
    world.setBlock(new Vec3(2, 63, 0), 'stone')
    world.setBlock(new Vec3(2, 63, 1), 'stone')
    for (let x = 8; x <= 16; x++) for (let z = -2; z <= 2; z++) {
      for (let y = 56; y <= 63 + Math.min(4, x - 8); y++) world.setBlock(new Vec3(x, y, z), 'stone')
    }
    for (let x = 4; x <= 12; x++) world.setBlock(new Vec3(x, 67, 0), 'stone')
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 62, 0.5), { world })
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, movementTimeoutMs: 2000 },
      pathfinderSettings: { searchTimeoutMs: 1000, tickTimeoutMs: 3, routePrefixMs: 30, maxVisitedNodes: 12000 } }))
    installSurfaceSwimming(rig.bot)
    const getPathTo = rig.bot.pathfinder.getPathTo.bind(rig.bot.pathfinder)
    let drySearches = 0, verifiedShore = false
    rig.bot.pathfinder.getPathTo = (...args: Parameters<typeof getPathTo>) => {
      verifiedShore ||= args[0] instanceof ShoreRouteGoal
      if (rig.bot.entity.onGround && !(rig.bot.entity as any).isInWater) drySearches++
      return getPathTo(...args)
    }
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    const target = new Vec3(4.5, 68, 0.5)
    try {
      await rig.bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, 0.7))
      assert.ok(rig.bot.entity.position.distanceTo(target) <= 0.8, `position=${rig.bot.entity.position}`)
      assert.equal(rig.bot.entity.onGround, true)
      assert.equal(rig.bot.inventory.items().length, 0)
      // A time-bounded shore probe may leave the onward route unverified under
      // load. In that case a dry search is required; a verified route is reused.
      if (verifiedShore) assert.equal(drySearches, 0, 'reuse the verified onward route immediately after landing on the bank')
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}
