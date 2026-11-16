import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, movementProviders } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'
import { safeStepDownSegment } from '../src/mineflayer-specific/navigationGeometry'

for (const version of ['1.20.4', '26.1.2']) for (const axis of ['x', 'z'] as const) for (const sign of [-1, 1]) {
  test(`off-centre crouched sand rim descends one block along ${sign > 0 ? '+' : '-'}${axis} on ${version}`, { timeout: 7000 }, async t => {
    const start = new Vec3(1.299, 65, 1.299)
    if (sign < 0) start[axis] = 1 - start[axis]
    const { rig, world } = createCacheWorld(version, 64, start)
    for (let x = -3; x <= 0; x++) for (let z = -3; z <= 0; z++) {
      const p = axis === 'x' ? new Vec3(x, 64, z) : new Vec3(z, 64, x)
      if (sign < 0) p[axis] = -p[axis]
      world.setBlock(p, 'sand')
    }
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, movementTimeoutMs: 1500 } }))
    rig.bot.entity.onGround = true
    rig.bot.setControlState('sneak', true)
    await rig.bot.waitForTicks(2)
    assert.equal(rig.bot.entity.onGround, true, `starts on the upper sand: ${rig.bot.entity.position}`)
    let recoveries = 0, heldTicks = 0
    rig.bot.on('enteredRecovery', () => recoveries++)
    rig.bot.on('physicsTick', () => { if (rig.bot.entity.onGround && rig.bot.getControlState('sneak')) heldTicks++ })
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      const target = axis === 'x' ? new Vec3(3.5, 64, 0.5) : new Vec3(0.5, 64, 3.5)
      if (sign < 0) target[axis] = 1 - target[axis]
      const goal = new goals.GoalBlock(target.x, target.y, target.z)
      const route = await rig.bot.pathfinder.getPathFromToRaw(new Vec3(0.5, 65, 0.5), new Vec3(0, 0, 0), goal)
      assert.ok(route)
      const descent = route.path[0]
      const executor = rig.bot.pathfinder.movements.get(movementProviders.ForwardDropDown)!
      executor.loadMove(descent)
      assert.equal(await executor.align(descent), true, `the verified lower floor accepts an off-centre approach immediately: ${rig.bot.entity.position}->${descent.exitPos}`)
      await rig.bot.pathfinder.perform(route, goal)
      assert.ok(rig.bot.entity.position.distanceTo(target) < 0.4, `position=${rig.bot.entity.position}`)
      assert.equal(recoveries, 0, 'a loaded one-block landing needs no recovery or block removal')
      assert.ok(heldTicks <= 4, `crouched at the rim for ${heldTicks} ticks`)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

test('step-down clearance rejects a hole, lava, unloaded floor and a wall in the body corridor', () => {
  const { rig, world, cacheWorld } = createCacheWorld('26.1.2', 64, new Vec3(0.99, 65, 0.5))
  world.setBlock(new Vec3(0, 64, 0), 'sand')
  const from = new Vec3(0.99, 65, 0.5), to = new Vec3(1.5, 64, 0.5)
  try {
    assert.equal(safeStepDownSegment(cacheWorld, from, to), true)
    for (const block of ['air', 'lava']) {
      world.setBlock(new Vec3(1, 63, 0), block)
      assert.equal(safeStepDownSegment(cacheWorld, from, to), false, block)
    }
    world.setBlock(new Vec3(1, 63, 0), 'stone')
    world.setBlock(new Vec3(1, 65, 0), 'stone')
    assert.equal(safeStepDownSegment(cacheWorld, from, to), false, 'headroom')
    world.setBlock(new Vec3(1, 65, 0), 'air')
    const unknown = Object.create(cacheWorld) as typeof cacheWorld
    unknown.getBlockInfo = p => {
      const block = cacheWorld.getBlockInfo(p)
      return Math.floor(p.x) === 1 && Math.floor(p.y) === 63 ? Object.assign(Object.create(block), { isInvalid: true, physical: false }) : block
    }
    assert.equal(safeStepDownSegment(unknown, from, to), false, 'unloaded landing')
  } finally { cacheWorld.dispose(); rig.stopPassivePhysics() }
})

test('following a lower player crosses consecutive drops without long pauses or looking at feet', { timeout: 9000 }, async () => {
  const world = createFlatWorld('1.20.4', -64, { renderDistance: 1 })
  for (let x = 0; x <= 9; x++) world.setBlock(new Vec3(x, x < 3 ? 63 : x < 6 ? 61 : 59, 0), 'stone')
  const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5), { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, maxDropDown: 3, infiniteLiquidDropdownDistance: false, movementTimeoutMs: 3000 } }))
  let moving = false
  let idleTicks = 0
  let longestPause = 0
  let maxPitch = 0
  rig.bot.on('physicsTick', () => {
    const pos = rig.bot.entity.position
    if (pos.x > 1) moving = true
    if (moving && pos.x < 7.2) {
      const speed = rig.bot.entity.velocity.offset(0, -rig.bot.entity.velocity.y, 0).norm()
      idleTicks = speed < 0.01 && rig.bot.entity.onGround ? idleTicks + 1 : 0
      longestPause = Math.max(longestPause, idleTicks)
      maxPitch = Math.max(maxPitch, Math.abs(rig.bot.entity.pitch))
    }
  })
  try {
    const target = new Vec3(8.5, 60, 0.5)
    await rig.bot.pathfinder.goto(new goals.GoalFollowEntity(target, 0.8, { neverfinish: false }))
    assert.ok(rig.bot.entity.position.distanceTo(target) <= 0.85, `position=${rig.bot.entity.position}`)
    assert.equal(rig.bot.entity.onGround, true)
    assert.ok(longestPause <= 8, `paused for ${longestPause} ticks`)
    assert.ok(maxPitch < 0.65, `pitch=${maxPitch}`)
  } finally {
    await rig.bot.pathfinder.destroy()
    rig.stopPassivePhysics()
  }
})

for (const drop of [3, 4]) {
  test(`a ${drop}-block fall ${drop === 3 ? 'respects' : 'exceeds'} the configured three-block limit`, { timeout: 4000 }, async () => {
    const world = createFlatWorld('1.20.4', -64, { renderDistance: 1 })
    for (let x = 0; x <= 5; x++) world.setBlock(new Vec3(x, x < 2 ? 63 : 63 - drop, 0), 'stone')
    const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5), { world })
    rig.bot.loadPlugin(createPlugin({
      moveSettings: { canDig: false, canPlace: false, maxDropDown: 3, infiniteLiquidDropdownDistance: false },
      pathfinderSettings: { searchTimeoutMs: 500 }
    }))
    try {
      let status = ''
      for await (const result of rig.bot.pathfinder.getPathTo(new goals.GoalBlock(4, 64 - drop, 0))) status = result.result.status
      assert.equal(status, drop === 3 ? 'success' : 'noPath')
    } finally {
      await rig.bot.pathfinder.destroy()
      rig.stopPassivePhysics()
    }
  })
}
