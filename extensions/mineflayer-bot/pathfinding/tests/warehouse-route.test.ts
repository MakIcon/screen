import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld } from './setup'
import type { TrafficAwareBot } from '../src/traffic'
import type { Move } from '../src/mineflayer-specific/move'

const { storageMoveOptions, containerClick } = require('../../warehouse-geometry.cjs')

test('warehouse walking follows the bridge around container lids instead of jumping to the parallel bridge', { timeout: 25000 }, async t => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 67, 0.5))
  const bot = rig.bot
  for (let x = 0; x <= 6; x++) for (const z of [0, 3]) world.setBlock(new Vec3(x, 66, z), 'white_wool')
  for (const x of [0, 6]) for (let z = 1; z < 3; z++) world.setBlock(new Vec3(x, 66, z), 'white_wool')
  world.setBlock(new Vec3(3, 66, 0), 'barrel')
  const chest = world.setBlock(new Vec3(7, 67, 0), 'chest')
  bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false },
    pathfinderSettings: { searchTimeoutMs: 2000, heuristicWeight: 1 } }))
  bot.pathfinder.setMoveOptions(storageMoveOptions(bot))
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop() }, { once: true })
  t.after(async () => { await bot.pathfinder.destroy(); rig.stopPassivePhysics() })
  const target = new goals.GoalNear(6.5, 67, 0.5, 0.22)
  const path = await bot.pathfinder.getPathFromToRaw(bot.entity.position, bot.entity.velocity, target)
  assert.ok(path)
  assert.ok(path.path.some((move: Move) => move.exitPos.z >= 3), 'uses the connecting walkway')
  assert.ok(path.path.every((move: Move) => !move.moveType.requiresParkour), 'no gap jumps on the storage approach')
  let low = Infinity, jumps = 0
  bot.on('physicsTick', () => {
    low = Math.min(low, bot.entity.position.y)
    if (bot.getControlState('jump')) jumps++
  })
  await bot.pathfinder.goto(target)
  await bot.waitForTicks(8)
  assert.ok(low >= 66.99, `stays on the bridge: lowest y=${low}`)
  assert.equal(jumps, 0)
  assert.ok(containerClick(bot, chest), 'can unload from the stopped position')
  assert.equal(bot.getControlState('forward'), false)
})

test('traffic cannot restart movement once a worker reaches its chest bay', { timeout: 8000 }, async t => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 67, 0.5))
  for (let x = 0; x <= 4; x++) world.setBlock(new Vec3(x, 66, 0), 'white_wool')
  const bot = rig.bot as TrafficAwareBot
  bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowSprinting: false } }))
  const target = new goals.GoalNear(4.5, 67, 0.5, 0.22)
  let latePauses = 0
  bot.launcherTraffic = { cost: () => 0, waiting: false, pause: () => {
    if (bot.entity.position.distanceTo(new Vec3(4.5, 67, 0.5)) > 0.22) return false
    latePauses++
    bot.clearControlStates()
    return true
  } }
  t.signal.addEventListener('abort', () => { void bot.pathfinder.stop() }, { once: true })
  t.after(async () => { await bot.pathfinder.destroy(); rig.stopPassivePhysics() })
  await bot.pathfinder.goto(target)
  await bot.waitForTicks(8)
  assert.equal(latePauses, 0, 'arrival finishes before a traffic detour')
  assert.ok(bot.entity.onGround && bot.entity.position.y >= 67)
  assert.equal(bot.getControlState('forward'), false)
})
