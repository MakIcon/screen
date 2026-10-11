import assert from 'node:assert/strict'
import test from 'node:test'
import '../src'
import { Vec3 } from 'vec3'
import { createCacheWorld } from './setup'
import { AStar } from '../src/mineflayer-specific/algs'
import { CPathNode } from '../src/abstract/node'
import { GoalBlock } from '../src/mineflayer-specific/goals'
import { Move } from '../src/mineflayer-specific/move'
import { IdleMovement } from '../src/mineflayer-specific/movements/movementProviders'
import { MovementHandler } from '../src/mineflayer-specific/movements/movementProvider'
import { PlaceHandler, BreakHandler } from '../src/mineflayer-specific/movements/interactionUtils'
import { selectAscentPrefix } from '../src/mineflayer-specific/ascentPrefix'

test('an incomplete ascent requires a dry foothold and available scaffolding, and cannot repeat a dead end', () => {
  const startPos = new Vec3(0.5, 64, 0.5)
  const { rig, cacheWorld } = createCacheWorld('1.20.4', 64, startPos)
  try {
    const provider = new IdleMovement(rig.bot, cacheWorld)
    const start = Move.startMove(provider, startPos, new Vec3(0, 0, 0), 1)
    const goal = new GoalBlock(4, 70, 0)
    const handler = MovementHandler.create(rig.bot, cacheWorld, new Map(), {})
    const context = new AStar(start, handler, goal, 100)
    const step = Move.fromPrevious(10, startPos.offset(0, 1, 0), start, provider,
      [PlaceHandler.fromVec(new Vec3(0, 64, 0), 'solid')])
    const result = context.makeResult('timeout', new CPathNode(10, goal.heuristic(step), step, context.bestNode))
    const select = (visits = new Map<string, number>()): Move[] | undefined => selectAscentPrefix(result, cacheWorld, goal, startPos, 16, visits)
    assert.deepEqual(select(), [step], 'the planned block supplies the otherwise missing foothold')
    assert.equal(select(new Map([[step.hash, 2]])), undefined, 'do not cycle through an already tried endpoint')
    step.toPlace.length = 0
    assert.equal(select(), undefined, 'an unsupported jump is not an ascent endpoint')
    step.toPlace.push(PlaceHandler.fromVec(new Vec3(0, 64, 0), 'solid'), PlaceHandler.fromVec(new Vec3(0, 65, 0), 'water'))
    assert.equal(select(), undefined, 'do not abandon the dry ledge for a water endpoint')
    step.toBreak.push(BreakHandler.fromVec(new Vec3(0, 65, 0), 'solid'))
    step.toPlace.pop()
    assert.deepEqual(select(), [step])
    const exhausted = Move.fromPrevious(10, startPos.offset(0, 1, 0), start, provider,
      [PlaceHandler.fromVec(new Vec3(0, 64, 0), 'solid'), PlaceHandler.fromVec(new Vec3(1, 64, 0), 'solid')])
    result.path = [exhausted]
    assert.equal(select(), undefined, 'two planned blocks cannot be built with one inventory block')
  } finally { rig.stopPassivePhysics(); cacheWorld.dispose() }
})
