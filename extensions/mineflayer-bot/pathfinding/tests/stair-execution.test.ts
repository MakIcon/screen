import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, movementProviders } from '../src'
import { createCacheWorld } from './setup'
import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'

const advancedJumps = [movementProviders.ParkourForward, movementProviders.ParkourDiagonal,
  movementProviders.MomentumJump, movementProviders.NeoProvider, movementProviders.AroundCornerDiagonal]

const cave = require('./fixtures/cave-staircase.json')
const { PlayerState: LivePlayerState } = require('prismarine-physics')

for (const batchSize of [1, 4, 8]) test(`a captured cave staircase reaches the owner with ${batchSize} physics ticks per event-loop turn`, { timeout: 10000 }, async () => {
  const start = new Vec3(cave.start[0], 64, cave.start[2])
  const { rig, world } = createCacheWorld('26.1.2', 32, start, { renderDistance: 1 })
  const Block = require('prismarine-block')(rig.mcData)
  for (let y = 0; y < cave.layers.length; y++) for (let z = 0; z < cave.layers[y].length; z++) {
    const row = cave.layers[y][z]
    for (let x = 0; x < row.length; x++) {
      const block = cave.palette[row.charCodeAt(x) - 65]
      const state = Block.fromProperties(rig.mcData.blocksByName[block.name].id, block.properties, 0).stateId
      world.setBlock(new Vec3(cave.min[0] + x, 64 + cave.min[1] + y, cave.min[2] + z), state)
    }
  }
  rig.bot.physicsEnabled = false
  rig.bot.food = 0
  rig.bot.health = 3
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false,
    allowSprinting: true, allowJumpSprint: true, movementTimeoutMs: 1500 } }))
  const nav = rig.bot.pathfinder
  const target = new Vec3(cave.target[0], 67, cave.target[2])
  let done = false, failure: unknown, ticks = 0
  const tail: unknown[] = []
  const running = nav.goto(goals.GoalNear.fromVec(target, 1)).catch((error: unknown) => { failure = error }).finally(() => { done = true })
  try {
    for (let batch = 0; batch < Math.ceil(600 / batchSize) && !done; batch++) {
      await new Promise<void>(resolve => setImmediate(resolve))
      for (let i = 0; i < batchSize && !done; i++) {
        const controls = Object.fromEntries(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak'].map(key => [key, rig.bot.getControlState(key as any)]))
        rig.bot.physics.simulatePlayer(new LivePlayerState(rig.bot, controls), world).apply(rig.bot)
        rig.bot.emit('physicsTick')
        if (tail.length >= 8) tail.shift()
        tail.push({ pos: rig.bot.entity.position.clone(), velocity: rig.bot.entity.velocity.clone(), controls,
          corner: (nav.currentExecutor as any)?.cornerTarget })
        ticks++
      }
    }
    assert.equal(failure, undefined)
    assert.equal(done, true, `stuck after ${ticks} ticks at ${rig.bot.entity.position}; move=${nav.currentMove?.moveType.constructor.name}; target=${nav.currentMove?.exitPos}; tail=${JSON.stringify(tail)}`)
    await running
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(target) <= 1)
  } finally { await nav.stop(); await running; await nav.destroy(); rig.stopPassivePhysics() }
})

for (const version of ['1.20.4', '26.1.2']) {
  for (const turn of [false, true]) {
    test(`a narrow cave staircase over a drop ascends ${turn ? 'around a corner' : 'beside a wall'} on ${version}`, { timeout: 15000 }, async (t) => {
      const { rig, world } = createCacheWorld(version, 64, new Vec3(0.69, 84, 0.31), { renderDistance: 1 })
      const stairs = turn ? [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2], [3, 2]]
        : [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]
      for (let i = 0; i < stairs.length; i++) {
        const [x, z] = stairs[i]
        world.setBlock(new Vec3(x, 83 + i, z), 'stone')
      }
      for (let x = -1; x <= 6; x++) for (let y = 82; y <= 94; y++) world.setBlock(new Vec3(x, y, -1), 'stone')
      if (turn) for (let z = 0; z <= 1; z++) for (let y = 86; y <= 94; y++) world.setBlock(new Vec3(2, y, z), 'stone')
      rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowSprinting: false,
        allowJumpSprint: false, movementTimeoutMs: 2000 } }))
      const navigator = rig.bot.pathfinder
      for (const provider of advancedJumps) navigator.dropMovement(provider)
      let lowest = 84, searches = 0
      const failures: string[] = [], trace: unknown[] = []
      const perform = navigator.perform.bind(navigator)
      navigator.perform = async (...args: Parameters<typeof perform>) => {
        try { await perform(...args) } catch (error) {
          failures.push(`${error}; pos=${rig.bot.entity.position}; entry=${navigator.currentMove?.entryPos}; exit=${navigator.currentMove?.exitPos}`)
          throw error
        }
      }
      rig.bot.on('pathGenerated', () => searches++)
      rig.bot.on('physicsTick', () => {
        lowest = Math.min(lowest, rig.bot.entity.position.y)
        if (trace.length > 15) trace.shift()
        trace.push({ pos: rig.bot.entity.position.clone(), ground: rig.bot.entity.onGround,
          jump: rig.bot.getControlState('jump'), sneak: rig.bot.getControlState('sneak'), move: navigator.currentMove?.exitPos })
      })
      t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
      try {
        const [x, z] = stairs[stairs.length - 1]
        await navigator.goto(new goals.GoalBlock(x, 84 + stairs.length - 1, z))
        assert.ok(lowest >= 83.99, `fell off the staircase: y=${lowest}`)
        assert.equal(searches, 1, `a ready staircase must not need repeated recovery: ${failures.join('\n')}`)
        assert.ok(rig.bot.entity.onGround)
        assert.ok(rig.bot.entity.position.distanceTo(new Vec3(x + 0.5, 84 + stairs.length - 1, z + 0.5)) < 0.25)
      } catch (error) {
        t.diagnostic(JSON.stringify({ failures, trace }))
        throw error
      } finally { await navigator.destroy(); rig.stopPassivePhysics() }
    })
  }
}

for (const start of [new Vec3(0.5, 84, 1.15), new Vec3(-0.15, 84, 0.5), new Vec3(0.31, 84, 0.31)]) {
  test(`a cave stair releases its crouched takeoff from ${start}`, { timeout: 12000 }, async (t) => {
    const { rig, world } = createCacheWorld('26.1.2', 64, start, { renderDistance: 1 })
    for (let x = 0; x <= 4; x++) world.setBlock(new Vec3(x, 83 + x, 0), 'stone')
    for (let x = -1; x <= 5; x++) for (let y = 82; y <= 92; y++) world.setBlock(new Vec3(x, y, -1), 'stone')
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, movementTimeoutMs: 2000 } }))
    const navigator = rig.bot.pathfinder
    for (const provider of advancedJumps) navigator.dropMovement(provider)
    rig.bot.setControlState('sneak', true)
    let lowest = 84
    rig.bot.on('physicsTick', () => { lowest = Math.min(lowest, rig.bot.entity.position.y) })
    t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
    try {
      await rig.bot.waitForTicks(2)
      assert.equal(rig.bot.entity.onGround, true)
      await navigator.goto(new goals.GoalBlock(4, 88, 0))
      assert.ok(lowest >= 83.99, `fell off the takeoff to ${lowest}`)
      assert.ok(rig.bot.entity.position.distanceTo(new Vec3(4.5, 88, 0.5)) < 0.25)
    } finally { await navigator.destroy(); rig.stopPassivePhysics() }
  })
}

for (const latency of [0, 150]) test(`a bot constructs and climbs a staircase along a cave wall with ${latency}ms server confirmation`, { timeout: 24000 }, async (t) => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.69, 84, 0.31), { renderDistance: 1 })
  world.setBlock(new Vec3(0, 83, 0), 'stone')
  for (let x = -1; x <= 6; x++) for (let y = 81; y <= 94; y++) world.setBlock(new Vec3(x, y, -1), 'stone')
  world.setBlock(new Vec3(5, 88, 0), 'stone')
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: true, allow1by1towers: true,
    allowJumpSprint: false, movementTimeoutMs: 2500 }, pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30 } }))
  const navigator = rig.bot.pathfinder
  for (const provider of [...advancedJumps, movementProviders.StraightUp]) navigator.dropMovement(provider)
  const Item = require('prismarine-item')(rig.mcData)
  const blocks = new Item(rig.mcData.itemsByName.cobblestone.id, 64)
  blocks.slot = 9; rig.bot.inventory.slots[9] = blocks
  let placed = 0, rejected = 0, lowest = 84
  const place = rig.bot._placeBlockWithOptions
  rig.bot._placeBlockWithOptions = async (reference: any, face: Vec3, ...args: any[]) => {
    const dest = reference.position.plus(face)
    if (latency) await new Promise(resolve => setTimeout(resolve, latency))
    if (AABB.fromBlock(dest).intersects(AABBUtils.getEntityAABB(rig.bot.entity))) {
      rejected++
      throw new Error('server rejected placement through the player')
    }
    assert.equal(world.getBlock(reference.position)?.boundingBox, 'block', 'the server needs a live placement anchor')
    await place(reference, face, ...args)
    placed++
  }
  rig.bot.on('physicsTick', () => { lowest = Math.min(lowest, rig.bot.entity.position.y) })
  t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
  try {
    await navigator.goto(new goals.GoalBlock(5, 89, 0))
    assert.ok(placed >= 4, `placed=${placed}`)
    assert.equal(rejected, 0, 'place from a clear, supported takeoff rather than through the body')
    assert.ok(lowest >= 83.99, `fell to ${lowest}`)
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(new Vec3(5.5, 89, 0.5)) < 0.25)
  } catch (error) {
    t.diagnostic(JSON.stringify({ placed, rejected, position: rig.bot.entity.position,
      entry: navigator.currentMove?.entryPos, exit: navigator.currentMove?.exitPos }))
    throw error
  } finally { await navigator.destroy(); rig.stopPassivePhysics() }
})
