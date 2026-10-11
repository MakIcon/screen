import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld } from './setup'
import { Move } from '../src/mineflayer-specific/move'
import { MovementHandler } from '../src/mineflayer-specific/movements/movementProvider'
import { IdleMovement } from '../src/mineflayer-specific/movements/movementProviders'
import { BreakHandler } from '../src/mineflayer-specific/movements/interactionUtils'

for (const version of ['1.20.4', '26.1.2']) {
  test(`mining planned on one search branch cannot clear another branch on ${version}`, () => {
    const pos = new Vec3(0.5, 64, 0.5)
    const { rig, world, cacheWorld } = createCacheWorld(version, 64, pos)
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: true, canPlace: false, allowJumpSprint: false } }))
    try {
      for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(1, y, 0), 'stone')
      const provider = new IdleMovement(rig.bot, cacheWorld)
      const start = Move.startMove(provider, pos, new Vec3(0, 0, 0), 0)
      const handler = MovementHandler.create(rig.bot, cacheWorld, rig.bot.pathfinder.getActiveMappings().movements,
        rig.bot.pathfinder.defaultMoveSettings)
      handler.loadGoal(new goals.GoalBlock(5, 70, 0))
      const mined = Move.fromPrevious(10, pos, start, provider, [], [BreakHandler.fromVec(new Vec3(1, 65, 0), 'solid')])
      const ascent = (move: Move): Move | undefined => handler.getNeighbors(move, new Set()).find(next => next.x === 1 && next.y === 65 && next.z === 0)
      assert.equal(ascent(mined)?.toBreak.length, 1)
      assert.equal(ascent(start)?.toBreak.length, 2, 'the other branch still needs to clear both solid blocks')
    } finally { rig.stopPassivePhysics(); cacheWorld.dispose() }
  })

  test(`returning to an old excavated area retains its removed support on ${version}`, () => {
    const pos = new Vec3(0.5, 64, 0.5)
    const { rig, world, cacheWorld } = createCacheWorld(version, 64, pos)
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false } }))
    try {
      world.setBlock(new Vec3(1, 64, 0), 'stone')
      const provider = new IdleMovement(rig.bot, cacheWorld)
      const start = Move.startMove(provider, pos, new Vec3(0, 0, 0), 0)
      const mined = Move.fromPrevious(10, pos, start, provider, [], [BreakHandler.fromVec(new Vec3(1, 64, 0), 'solid')])
      const away = Move.fromPrevious(10, new Vec3(20.5, 64, 0.5), mined, provider)
      const returned = Move.fromPrevious(10, pos, away, provider)
      const atOrigin = Move.fromPrevious(10, pos, returned, provider)
      const handler = MovementHandler.create(rig.bot, cacheWorld, rig.bot.pathfinder.getActiveMappings().movements,
        rig.bot.pathfinder.defaultMoveSettings)
      handler.loadGoal(new goals.GoalBlock(5, 70, 0))
      assert.equal(handler.getNeighbors(atOrigin, new Set()).some(next => next.x === 1 && next.y === 65 && next.z === 0), false,
        'the route must not land on a block it already removed')
    } finally { rig.stopPassivePhysics(); cacheWorld.dispose() }
  })
}
