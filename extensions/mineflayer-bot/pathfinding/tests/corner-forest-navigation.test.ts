import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, movementProviders } from '../src'
import { createCacheWorld } from './setup'
import { supportedWalkSegment } from '../src/mineflayer-specific/navigationGeometry'

const jumps = [movementProviders.ParkourForward, movementProviders.ParkourDiagonal,
  movementProviders.MomentumJump, movementProviders.NeoProvider,
  movementProviders.AroundCornerDiagonal]

test('walking support must not join blocks which touch only at a corner', () => {
  const { rig, world, cacheWorld } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 84, 0.5))
  try {
    world.setBlock(new Vec3(0, 83, 0), 'stone')
    world.setBlock(new Vec3(1, 83, 1), 'stone')
    assert.equal(supportedWalkSegment(cacheWorld, new Vec3(0.5, 84, 0.5), new Vec3(1.5, 84, 1.5)), false)
    world.setBlock(new Vec3(1, 83, 0), 'stone')
    assert.equal(supportedWalkSegment(cacheWorld, new Vec3(0.5, 84, 0.5), new Vec3(1.5, 84, 0.5)), true)
    assert.equal(supportedWalkSegment(cacheWorld, new Vec3(1.5, 84, 0.5), new Vec3(1.5, 84, 1.5)), true)
    world.setBlock(new Vec3(0, 83, 1), 'stone')
    assert.equal(supportedWalkSegment(cacheWorld, new Vec3(0.5, 84, 0.5), new Vec3(1.5, 84, 1.5)), true)
  } finally { rig.stopPassivePhysics(); cacheWorld.dispose() }
})

for (const version of ['1.20.4', '26.1.2']) {
  test(`supported diagonal sprint jumps retain speed without rim crouching on ${version}`, { timeout: 9000 }, async (t) => {
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: true } }))
    let samples = 0, crouched = 0, airborne = 0, slow = 0
    rig.bot.on('physicsTick', () => {
      if (rig.bot.entity.position.x < 3 || rig.bot.entity.position.x > 12) return
      samples++
      if (!rig.bot.entity.onGround) airborne++
      if (rig.bot.getControlState('sneak')) crouched++
      if (Math.hypot(rig.bot.entity.velocity.x, rig.bot.entity.velocity.z) < 0.12) slow++
    })
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalNear(15.5, 64, 15.5, 0.4))
      assert.ok(samples > 25 && airborne > 10, 'exercise normal diagonal sprint jumps')
      assert.equal(crouched, 0, 'airborne movement must not inherit a ground rim correction')
      assert.ok(slow <= 2, `keep ordinary travel speed: ${slow}/${samples} slow ticks`)
      assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(new Vec3(15.5, 64, 15.5)) < 0.5)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })

  test(`a crouched outside rim is recentered before walking releases sneak on ${version}`, { timeout: 8000 }, async (t) => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(6.79, 84, -0.28), { renderDistance: 1 })
    for (let x = 0; x <= 6; x++) world.setBlock(new Vec3(x, 83, 0), 'cobblestone')
    for (let z = 0; z <= 4; z++) world.setBlock(new Vec3(6, 83, z), 'cobblestone')
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, movementTimeoutMs: 2000 } }))
    for (const provider of jumps) rig.bot.pathfinder.dropMovement(provider)
    rig.bot.setControlState('sneak', true)
    await rig.bot.waitForTicks(2)
    assert.equal(rig.bot.entity.onGround, true, 'start from actual contact with the corner block')
    rig.bot.entity.velocity.set(0.02, 0, -0.02)
    let lowest = 84
    rig.bot.on('physicsTick', () => { lowest = Math.min(lowest, rig.bot.entity.position.y) })
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalNear(6.5, 84, 3.5, 0.4))
      assert.ok(lowest >= 83.99, `fell from the outside rim to ${lowest}`)
      assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(new Vec3(6.5, 84, 3.5)) < 0.5)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })

  for (const reverse of [false, true]) test(`a one-block G walkway preserves its supported bends ${reverse ? 'backwards' : 'forwards'} on ${version}`, { timeout: 15000 }, async (t) => {
    const start = reverse ? new Vec3(1.5, 84, 2.5) : new Vec3(0.5, 84, 0.5)
    const target = reverse ? new Vec3(0.5, 84, 0.5) : new Vec3(1.5, 84, 2.5)
    const { rig, world } = createCacheWorld(version, 64, start, { renderDistance: 1 })
    for (let x = 0; x <= 6; x++) world.setBlock(new Vec3(x, 83, 0), 'cobblestone')
    for (let z = 0; z <= 5; z++) world.setBlock(new Vec3(6, 83, z), 'cobblestone')
    for (let x = 1; x <= 6; x++) world.setBlock(new Vec3(x, 83, 5), 'cobblestone')
    for (let z = 2; z <= 5; z++) world.setBlock(new Vec3(1, 83, z), 'cobblestone')
    // The inside wall exposes the same outside rim seen in the screenshots.
    for (let z = 1; z <= 4; z++) for (let y = 84; y <= 85; y++) world.setBlock(new Vec3(5, y, z), 'cobblestone')
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: true, movementTimeoutMs: 2000 } }))
    for (const provider of jumps) rig.bot.pathfinder.dropMovement(provider)
    let lowest = 84
    const bends = [new Vec3(6.5, 84, 0.5), new Vec3(6.5, 84, 5.5), new Vec3(1.5, 84, 5.5)]
    const distances = bends.map(() => Infinity)
    const routes: any[] = []
    const failures: string[] = []
    const perform = rig.bot.pathfinder.perform.bind(rig.bot.pathfinder)
    rig.bot.pathfinder.perform = async (...args: Parameters<typeof perform>) => {
      try { await perform(...args) } catch (error) { failures.push(String(error)); throw error }
    }
    rig.bot.on('pathGenerated', (path: any) => routes.push(path))
    rig.bot.on('physicsTick', () => {
      lowest = Math.min(lowest, rig.bot.entity.position.y)
      for (let i = 0; i < bends.length; i++) distances[i] = Math.min(distances[i], rig.bot.entity.position.xzDistanceTo(bends[i]))
    })
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      await rig.bot.pathfinder.goto(goals.GoalNear.fromVec(target, 0.35))
      assert.ok(lowest >= 83.99, `fell to ${lowest}; position=${rig.bot.entity.position}`)
      assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(target) < 0.45)
      assert.equal(routes.length, 1, `a ready walkway must not need falling/recovery: ${failures}`)
      assert.ok(distances.every(distance => distance < 0.3), `visit the corner blocks before turning: ${distances}`)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })

  test(`come recovers rejected stair placements below a forest canopy on ${version}`, { timeout: 40000 }, async (t) => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
    for (let x = -3; x <= 5; x++) for (let z = -3; z <= 3; z++) world.setBlock(new Vec3(x, 67, z), 'spruce_leaves')
    for (let y = 64; y <= 70; y++) world.setBlock(new Vec3(2, y, 1), 'spruce_log')
    for (let x = 9; x <= 12; x++) for (let z = -1; z <= 1; z++) world.setBlock(new Vec3(x, 83, z), 'stone')
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: true, allowJumpSprint: false, movementTimeoutMs: 2000 },
      pathfinderSettings: { searchTimeoutMs: 1000, tickTimeoutMs: 5, maxVisitedNodes: 12000, routePrefixMs: 30 } }))
    for (const provider of jumps) rig.bot.pathfinder.dropMovement(provider)
    const Item = require('prismarine-item')(rig.mcData)
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64)
    rig.bot.inventory.slots[9].slot = 9
    const place = rig.bot._placeBlockWithOptions
    let rejected = 0, confirmed = 0
    let denied: Vec3 | undefined
    rig.bot._placeBlockWithOptions = async (block: any, face: Vec3, ...args: any[]) => {
      const destination = block.position.plus(face)
      denied ??= destination.clone()
      if (destination.equals(denied)) {
        rejected++
        await rig.bot.waitForTicks(2)
        world.setBlock(destination, 'air')
        throw new Error('Server rejected the placement')
      }
      const oldState = world.getBlockStateId(destination)
      await rig.bot.waitForTicks(2)
      assert.equal(world.getBlockStateId(destination), oldState, 'never inject a predicted floor into the live world')
      confirmed++
      return place(block, face, ...args)
    }
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      const target = new Vec3(10.5, 84, 0.5)
      await rig.bot.pathfinder.goto(goals.GoalNear.fromVec(target, 0.7))
      assert.ok(rejected >= 1 && rejected <= 2, 'avoid repeatedly requesting the rejected placement')
      assert.ok(confirmed > 15, 'continue constructing after recovering')
      assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(target) < 0.8, `position=${rig.bot.entity.position}`)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}
