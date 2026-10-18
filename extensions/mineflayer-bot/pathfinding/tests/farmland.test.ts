import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, type Move } from '../src'
import { getNormalizedPos } from '../src/utils'
import { createCacheWorld } from './setup'

for (const version of ['1.20.4', '26.1.2']) {
  test(`farmland feet use the upper route cell without changing real terrain on ${version}`, async () => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 63.9375, 0.5), { renderDistance: 1 })
    rig.stopPassivePhysics()
    world.setBlock(new Vec3(0, 63, 0), 'farmland')
    rig.bot.loadPlugin(createPlugin())
    try {
      assert.equal(getNormalizedPos(rig.bot).y, 64)
      assert.equal(rig.bot.entity.position.y, 63.9375)
      assert.equal(world.getBlockInfo(new Vec3(0, 63, 0)).height, 63.9375)
    } finally { await rig.bot.pathfinder.destroy() }
  })

  test(`walking-only refuses a required jump and normal movement can use it on ${version}`, async () => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 63.9375, 0.5), { renderDistance: 1 })
    rig.stopPassivePhysics()
    for (let x = 0; x <= 4; x++) world.setBlock(new Vec3(x, 63, 0), 'farmland')
    world.setBlock(new Vec3(3, 64, 0), 'stone')
    rig.bot.loadPlugin(createPlugin({
      moveSettings: {
        walkOnly: true, canDig: false, canPlace: false, allowJumpSprint: true,
        exclusionAreasStep: [block => block.position.z === 0 && block.position.x >= 0 && block.position.x <= 4 ? 0 : Infinity]
      },
      pathfinderSettings: { searchTimeoutMs: 500, maxVisitedNodes: 1000, partialPathProducer: false }
    }))
    const goal = new goals.GoalBlock(3, 65, 0)
    const pathToStep = async (): Promise<{ status: string, path: Move[] } | undefined> => {
      let result
      for await (const update of rig.bot.pathfinder.getPathTo(goal)) result = update.result
      return result
    }
    try {
      const walking = await pathToStep()
      assert.notEqual(walking?.status, 'success')
      rig.bot.pathfinder.setMoveOptions({ walkOnly: false })
      const normal = await pathToStep()
      assert.equal(normal?.status, 'success')
      assert.ok(normal.path.some(move => ['ForwardJump', 'StraightUp'].includes(move.moveType.constructor.name)))
    } finally { await rig.bot.pathfinder.destroy() }
  })
}
