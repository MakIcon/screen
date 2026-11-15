import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld } from './setup'
import type { TrafficAwareBot } from '../src/traffic'

const { createFleetNavigation } = require('../../fleet-navigation.cjs')
const { createHub } = require('../../fleet-crew.cjs')
const flush = async (): Promise<void> => await new Promise(resolve => setImmediate(resolve))

function setup(position = new Vec3(0.5, 64, 0.5)) {
  const result = createCacheWorld('26.1.2', 64, position, { renderDistance: 1 })
  result.rig.bot.loadPlugin(createPlugin({
    moveSettings: { canDig: false, canPlace: false, allowSprinting: false, movementTimeoutMs: 800 },
    pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, heuristicWeight: 1 }
  }))
  return result
}

test('traffic costs make the real planner walk around an occupied approach', async () => {
  const { rig } = setup()
  const hub = createHub()
  hub.handle('parked', 'traffic', { dim: 'overworld', pos: new Vec3(3.5, 64, 0.5), route: [] })
  const nav = createFleetNavigation(rig.bot, { request: async (op: string, input: unknown) => hub.handle('walker', op, input) })
  try {
    await flush()
    const route = await rig.bot.pathfinder.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity,
      new goals.GoalNear(7.5, 64, 0.5, 0.2))
    assert.ok(route != null)
    assert.ok(route.path.every((move: any) => move.exitPos.distanceTo(new Vec3(3.5, 64, 0.5)) >= 1.1))
    assert.ok(route.path.every((move: any) => move.toBreak.length === 0 && move.toPlace.length === 0))
  } finally { nav.dispose(); await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('the real executor resumes after a traffic queue longer than its stall timeout', { timeout: 10000 }, async () => {
  const { rig } = setup()
  let waiting = true, holds = 0
  const bot = rig.bot as TrafficAwareBot
  bot.launcherTraffic = { cost: () => 0, pause: () => {
    if (waiting) { holds++; bot.clearControlStates() }
    return waiting
  }, get waiting() { return waiting } }
  const timer = setTimeout(() => { waiting = false }, 1800)
  try {
    await rig.bot.pathfinder.goto(new goals.GoalNear(4.5, 64, 0.5, 0.3))
    assert.ok(holds >= 10, `queued physics ticks=${holds}`)
    assert.ok(bot.entity.position.distanceTo(new Vec3(4.5, 64, 0.5)) < 0.4)
  } finally { clearTimeout(timer); await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('four bots receiving come reach separate places around the same owner', { timeout: 18000 }, async t => {
  const bots = [-4.5, -1.5, 1.5, 4.5].map(z => setup(new Vec3(-7.5, 64, z)))
  const hub = createHub()
  const navs = bots.map(({ rig }, index) => createFleetNavigation(rig.bot,
    { request: async (op: string, input: unknown) => hub.handle(`bot${index}`, op, input) }, { pollMs: 60 }))
  bots.forEach(({ rig }, index) => bots.forEach((other, j) => {
    if (index !== j) rig.bot.entities[100 + j] = Object.assign(other.rig.bot.entity, { username: `bot${j}` })
  }))
  let separation = Infinity
  bots[0].rig.bot.on('physicsTick', () => bots.forEach((a, i) => bots.slice(i + 1).forEach(b => {
    separation = Math.min(separation, a.rig.bot.entity.position.distanceTo(b.rig.bot.entity.position))
  })))
  t.signal.addEventListener('abort', () => { bots.forEach(({ rig }) => { void rig.bot.pathfinder.stop() }) }, { once: true })
  const owner = new Vec3(0.5, 64, 0.5)
  try {
    await new Promise(resolve => setTimeout(resolve, 80))
    await Promise.all(bots.map(({ rig }, i) => rig.bot.pathfinder.goto(
      navs[i].adaptGoal(new goals.GoalNear(owner.x, owner.y, owner.z, 1), 'come'))))
    assert.ok(bots.every(({ rig }) => rig.bot.entity.position.distanceTo(owner) < 3))
    assert.ok(separation > 0.7, `minimum fleet separation=${separation}`)
    for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++)
      assert.ok(bots[i].rig.bot.entity.position.distanceTo(bots[j].rig.bot.entity.position) >= 1.1)
    t.diagnostic(`four-bot come: minimum separation=${separation.toFixed(2)} blocks`)
  } finally {
    navs.forEach((nav: any) => nav.dispose())
    await Promise.all(bots.map(({ rig }) => rig.bot.pathfinder.destroy()))
    bots.forEach(({ rig }) => rig.stopPassivePhysics())
  }
})

test('opposing workers take turns through the same one-block cave exit', { timeout: 18000 }, async t => {
  const left = setup(new Vec3(-1.5, 64, 0.5)), right = setup(new Vec3(10.5, 64, 0.5))
  for (const { world } of [left, right]) for (let x = 0; x <= 8; x++)
    for (let z = -20; z <= 20; z++) for (let y = 64; y <= 68; y++)
      if (z !== 0 || y >= 66) world.setBlock(new Vec3(x, y, z), 'stone')
  const hub = createHub()
  const a = createFleetNavigation(left.rig.bot, { request: async (op: string, input: unknown) => hub.handle('a', op, input) }, { pollMs: 60 })
  const b = createFleetNavigation(right.rig.bot, { request: async (op: string, input: unknown) => hub.handle('b', op, input) }, { pollMs: 60 })
  left.rig.bot.entities[101] = Object.assign(right.rig.bot.entity, { username: 'b' })
  right.rig.bot.entities[102] = Object.assign(left.rig.bot.entity, { username: 'a' })
  let minDistance = Infinity, waited = false
  const closest: unknown[] = []
  left.rig.bot.on('physicsTick', () => {
    const separation = left.rig.bot.entity.position.distanceTo(right.rig.bot.entity.position)
    if (separation < minDistance && separation < 1.3) closest.push({
      a: left.rig.bot.entity.position.toString(), b: right.rig.bot.entity.position.toString(),
      aWait: a.waiting, bWait: b.waiting, aControl: left.rig.bot.controlState, bControl: right.rig.bot.controlState
    })
    minDistance = Math.min(minDistance, separation)
    waited ||= a.waiting || b.waiting
  })
  t.signal.addEventListener('abort', () => { void left.rig.bot.pathfinder.stop(); void right.rig.bot.pathfinder.stop() }, { once: true })
  try {
    await flush()
    await Promise.all([
      left.rig.bot.pathfinder.goto(new goals.GoalNear(12.5, 64, 0.5, 0.4)),
      right.rig.bot.pathfinder.goto(new goals.GoalNear(-3.5, 64, 0.5, 0.4))
    ])
    assert.ok(waited, 'one flow waits for the passage')
    assert.ok(minDistance > 0.7, `minimum separation=${minDistance}; ${JSON.stringify(closest)}`)
    assert.ok(left.rig.bot.entity.position.x > 12)
    assert.ok(right.rig.bot.entity.position.x < -3)
    t.diagnostic(`opposing cave traffic: minimum separation=${minDistance.toFixed(2)} blocks`)
  } finally {
    a.dispose(); b.dispose()
    await Promise.all([left.rig.bot.pathfinder.destroy(), right.rig.bot.pathfinder.destroy()])
    left.rig.stopPassivePhysics(); right.rig.stopPassivePhysics()
  }
})
