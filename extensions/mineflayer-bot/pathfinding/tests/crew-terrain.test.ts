import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld } from './setup'
import type { TrafficAwareBot } from '../src/traffic'

test('jumps from the thin top of a ladder without crouching against the wall', { timeout: 6000 }, async t => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(1.699999988079071, 67, 0.48))
  const data = rig.mcData.blocksByName.ladder
  const { Block } = require('./setup/mc-data').loadMcData('26.1.2')
  let ladder = data.minStateId
  for (; ladder <= data.maxStateId; ladder++) {
    const props = Block.fromStateId(ladder, 0).getProperties()
    if (props.facing === 'west' && !props.waterlogged) break
  }
  for (let y = 64; y <= 67; y++) world.setBlock(new Vec3(2, y, 0), 'cobblestone')
  world.setBlock(new Vec3(1, 66, 0), ladder)
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, movementTimeoutMs: 1000 } }))
  rig.bot.setControlState('sneak', true)
  t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
  try {
    await rig.bot.waitForTicks(2)
    assert.equal(rig.bot.entity.onGround, true, 'actual contact with the thin ladder top')
    await rig.bot.pathfinder.goto(new goals.GoalBlock(2, 68, 0))
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(2.5, 68, 0.5)) < 0.45)
    assert.equal(rig.bot.entity.onGround, true)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('eight simultaneous obstructed route searches keep protocol timers responsive', { timeout: 12000 }, async t => {
  const bots = Array.from({ length: 8 }, () => createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 }))
  for (const { rig } of bots) {
    rig.bot.loadPlugin(createPlugin({
      moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false },
      pathfinderSettings: { tickTimeoutMs: 1, searchTimeoutMs: 100, maxVisitedNodes: 1200 }
    }))
    ;(rig.bot as TrafficAwareBot).launcherTraffic = { cost: () => 0, pause: () => false, waiting: false, workDelayMs: 12 }
  }
  let beats = 0, maxGap = 0, lastBeat = performance.now()
  const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - lastBeat); lastBeat = now; beats++ }, 10)
  try {
    const routes = await Promise.all(bots.map(({ rig }) => rig.bot.pathfinder.getPathFromToRaw(
      rig.bot.entity.position, rig.bot.entity.velocity, new goals.GoalBlock(0, 100, 0))))
    assert.ok(routes.every(route => route == null), 'no teleporting to an unreachable goal')
    assert.ok(beats >= 5, `timers serviced ${beats} times during searching`)
    assert.ok(maxGap < 300, `longest protocol timer gap=${maxGap.toFixed(1)}ms`)
    t.diagnostic(`8 searches: protocol beats=${beats}, maximum gap=${maxGap.toFixed(1)}ms`)
  } finally {
    clearInterval(timer)
    await Promise.all(bots.map(async ({ rig }) => { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }))
  }
})

for (const version of ['1.20.4', '26.1.2']) {
  test(`walks the bent desert rim at walking speed on ${version}`, { timeout: 14000 }, async t => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 65, 0.94))
    // A continuous upper platform with a staircase-shaped rim, like the
    // screenshot. The lower sand is one block down, not a flat test plane.
    for (let x = -3; x <= 22; x++) for (let z = -8; z <= Math.floor(x / 4); z++)
      world.setBlock(new Vec3(x, 64, z), 'sand')
    rig.bot.loadPlugin(createPlugin({
      moveSettings: { canDig: false, canPlace: false, allowSprinting: false, allowJumpSprint: false, movementTimeoutMs: 1400 },
      pathfinderSettings: { tickTimeoutMs: 3 }
    }))
    let ticks = 0, crouched = 0, lowest = 65, recoveries = 0
    rig.bot.on('physicsTick', () => {
      ticks++; if (rig.bot.getControlState('sneak')) crouched++
      lowest = Math.min(lowest, rig.bot.entity.position.y)
    })
    rig.bot.on('enteredRecovery', () => recoveries++)
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(19, 65, 4))
      t.diagnostic(`ticks=${ticks}, crouched=${crouched}, recoveries=${recoveries}, lowest=${lowest}`)
      assert.ok(rig.bot.entity.position.distanceTo(new Vec3(19.5, 65, 4.5)) < 0.4)
      assert.equal(lowest, 65, 'never slips off the rim')
      assert.ok(ticks < 155, `19 blocks should not take ${ticks} ticks`)
      assert.ok(crouched < ticks * 0.25, `crouched for ${crouched}/${ticks} ticks`)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}
