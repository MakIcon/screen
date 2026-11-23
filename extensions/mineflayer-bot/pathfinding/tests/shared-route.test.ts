import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, routeProfile } from '../src'
import { createCacheWorld } from './setup'
import type { TrafficAwareBot } from '../src/traffic'
import type { RoutePoint } from '../src/sharedRoute'

test('a second bot rebuilds a shared route against its own terrain and movement settings', async t => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5))
  const bot = rig.bot as TrafficAwareBot
  bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowParkour: false } }))
  t.after(async () => { await bot.pathfinder.destroy(); rig.stopPassivePhysics() })
  const goal = new goals.GoalBlock(12, 64, 0)
  const first = await bot.pathfinder.getPathFromToRaw(bot.entity.position, new Vec3(0, 0, 0), goal)
  assert.ok(first && first.path.length > 2)
  const hints: RoutePoint[] = [{ ...bot.entity.position, profile: routeProfile(first.path[0].moveType.settings) }, ...first.path.map(move =>
    ({ ...move.exitPos, kind: move.moveType.constructor.name, cost: move.cost }))]
  bot.launcherTraffic = { cost: () => 0, pause: () => false, waiting: false, routeFrom: () => hints }
  const reused = await bot.pathfinder.getPathFromToRaw(bot.entity.position, new Vec3(0, 0, 0), goal)
  assert.ok(reused)
  assert.equal(reused.visitedNodes, 0, 'no A* expansion when directed steps remain valid')
  assert.ok(reused.path.every(move => !first.path.includes(move)), 'moves belong to the receiving bot')
  assert.ok(goal.isEnd(reused.path.at(-1)!))
  const sprinting = bot.pathfinder.defaultMoveSettings.allowSprinting
  bot.pathfinder.setMoveOptions({ allowSprinting: !sprinting })
  const different = await bot.pathfinder.getPathFromToRaw(bot.entity.position, new Vec3(0, 0, 0), goal)
  assert.ok(different && different.visitedNodes > 0, 'different movement capabilities get a fresh route')
  bot.pathfinder.setMoveOptions({ allowSprinting: sprinting })
  world.setBlock(new Vec3(6, 64, 0), 'stone')
  world.setBlock(new Vec3(6, 65, 0), 'stone')
  bot.pathfinder.world.cleanup?.()
  const changed = await bot.pathfinder.getPathFromToRaw(bot.entity.position, new Vec3(0, 0, 0), goal)
  assert.ok(changed)
  assert.ok(changed.visitedNodes > 0, 'a blocked shared route falls through to fresh A*')
  assert.ok(changed.path.every(move => !(move.x === 6 && move.z === 0 && move.y === 64)))
  bot.launcherTraffic.cost = (_from, to) => Math.abs(to.z - 0.5) < 0.1 && to.x > 3 && to.x < 9 ? 60 : 0
  const traffic = await bot.pathfinder.getPathFromToRaw(bot.entity.position, new Vec3(0, 0, 0), goal)
  assert.ok(traffic && traffic.visitedNodes > 0, 'current traffic invalidates a cached lane')
});

test('shared routes never grant permissions to dig or cross missing support', async t => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5))
  const bot = rig.bot as TrafficAwareBot
  bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowParkour: false } }))
  t.after(async () => { await bot.pathfinder.destroy(); rig.stopPassivePhysics() })
  bot.launcherTraffic = { cost: () => 0, pause: () => false, waiting: false,
    routeFrom: () => Array.from({ length: 8 }, (_, x) => ({ x: x + 0.5, y: 64, z: 0.5, kind: 'Forward' })) }
  world.setBlock(new Vec3(3, 63, 0), 'lava')
  const result = await bot.pathfinder.getPathFromToRaw(bot.entity.position, new Vec3(0, 0, 0), new goals.GoalBlock(7, 64, 0))
  assert.ok(result && result.visitedNodes > 0)
  assert.ok(result.path.every(move => !(move.x === 3 && move.z === 0)))
  assert.ok(result.path.every(move => move.toBreak.length === 0 && move.toPlace.length === 0))
});
