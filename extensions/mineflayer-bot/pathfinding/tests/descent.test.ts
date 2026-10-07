import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'

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
