import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, Move, movementProviders } from '../src'
import { createCacheWorld } from './setup'
import { ForwardJumpUpOpt } from '../src/mineflayer-specific/post/optimizers'
import { PlaceHandler } from '../src/mineflayer-specific/movements/interactionUtils'

test('a rejected interaction cannot unlock or finish an absent step', async () => {
  const { rig } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5))
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false } }))
  class RejectedPlacement extends PlaceHandler {
    override async perform (): Promise<void> { throw new Error('server rejected placement') }
  }
  const placement = new RejectedPlacement(1, 64, 0, 'solid')
  placement.loadMove(rig.bot.pathfinder.movements.get(movementProviders.ForwardJump)!)
  try {
    await assert.rejects(placement._perform(rig.bot, null), /Failed to perform RejectedPlacement/)
    assert.equal(placement.done, false)
    assert.equal(placement.allowExit, false)
    assert.equal(placement.isPerforming, false)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('jump optimization keeps the landing before an obstructed upper turn', async () => {
  const { rig, world, cacheWorld } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5))
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false } }))
  try {
    world.setBlock(new Vec3(1, 64, 0), 'grass_block')
    world.setBlock(new Vec3(1, 64, 1), 'grass_block')
    world.setBlock(new Vec3(0, 65, 1), 'stone')
    const start = Move.startMove(new movementProviders.IdleMovement(rig.bot, cacheWorld), rig.bot.entity.position, new Vec3(0, 0, 0), 0)
    const up = Move.fromPrevious(8, new Vec3(1.5, 65, 0.5), start, new movementProviders.ForwardJump(rig.bot, cacheWorld), [], [])
    const turn = Move.fromPrevious(5, new Vec3(1.5, 65, 1.5), up, new movementProviders.Forward(rig.bot, cacheWorld), [], [])
    assert.equal(await new ForwardJumpUpOpt(rig.bot, cacheWorld).identEndOpt(0, [up, turn]), 0)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('vertical movement alignment uses the horizontal approach direction', async () => {
  const { rig, world, cacheWorld } = createCacheWorld('26.1.2', 64, new Vec3(0.1, 64, 0.5))
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false } }))
  try {
    world.setBlock(new Vec3(1, 64, 0), 'grass_block')
    const provider = new movementProviders.ForwardJump(rig.bot, cacheWorld)
    const start = Move.startMove(new movementProviders.IdleMovement(rig.bot, cacheWorld), new Vec3(0.5, 64, 0.5), new Vec3(0, 0, 0), 0)
    const move = Move.fromPrevious(8, new Vec3(1.5, 65, 0.5), start, provider, [], [])
    const executor = rig.bot.pathfinder.movements.get(movementProviders.ForwardJump)!
    executor.loadMove(move)
    assert.equal(executor.isInitAligned(move), true)
    rig.bot.entity.position.set(1.1, 65, 0.5)
    rig.bot.entity.onGround = false
    assert.equal(executor.isAlreadyCompleted(move, 0, new goals.GoalBlock(1, 65, 0)), false, 'touching a landing edge while airborne is not arrival')
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

for (const version of ['1.20.4', '26.1.2']) {
  test(`one-block descent followed by a turn and ascent on ${version}`, { timeout: 8500 }, async (t) => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.8, 65, 0.8))
    for (let x = -2; x <= 1; x++) for (let z = -2; z <= 2; z++) world.setBlock(new Vec3(x, 64, z), 'grass_block')
    // A one-cell trench: leave the upper support completely, land, then jump.
    for (let z = -2; z <= 2; z++) world.setBlock(new Vec3(3, 64, z), 'grass_block')
    world.setBlock(new Vec3(2, 64, 0), 'allium')
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, movementTimeoutMs: 2000 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(3, 65, 1))
      assert.ok(rig.bot.entity.position.xzDistanceTo(new Vec3(3.5, 65, 1.5)) < 0.3, `position=${rig.bot.entity.position}`)
      assert.equal(rig.bot.entity.onGround, true)
      assert.equal(rig.bot.entity.position.y, 65)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })

  test(`ascent turns around a wall without cutting its upper corner on ${version}`, { timeout: 8500 }, async (t) => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.7, 64, 0.75))
    for (let x = 1; x <= 4; x++) for (let z = -2; z <= 4; z++) world.setBlock(new Vec3(x, 64, z), 'grass_block')
    for (let z = 1; z <= 3; z++) for (let y = 65; y <= 67; y++) world.setBlock(new Vec3(2, y, z), 'stone')
    world.setBlock(new Vec3(1, 65, 0), 'allium')
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, movementTimeoutMs: 2000 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(3, 65, 2))
      assert.ok(rig.bot.entity.position.xzDistanceTo(new Vec3(3.5, 65, 2.5)) < 0.3, `position=${rig.bot.entity.position}`)
      assert.equal(rig.bot.entity.onGround, true)
      assert.equal(rig.bot.entity.position.y, 65)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })

  test(`consecutive one-block grass steps from against a riser on ${version}`, { timeout: 8500 }, async (t) => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.69, 64, 0.82))
    for (let x = 1; x <= 6; x++) for (let z = -1; z <= 1; z++) {
      for (let y = 64; y < 64 + Math.min(4, x); y++) world.setBlock(new Vec3(x, y, z), 'grass_block')
      world.setBlock(new Vec3(x, 64 + Math.min(4, x), z), 'allium')
    }
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, movementTimeoutMs: 2000 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(5, 68, 0))
      assert.ok(rig.bot.entity.position.xzDistanceTo(new Vec3(5.5, 68, 0.5)) < 0.3, `position=${rig.bot.entity.position}`)
      assert.equal(rig.bot.entity.onGround, true)
      assert.equal(rig.bot.entity.position.y, 68)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}
