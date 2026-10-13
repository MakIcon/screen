import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld } from './setup'

test('deep ore search commits useful descending steps without exhausting its search budget', { timeout: 10000 }, async (t) => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 2 })
  for (let x = -6; x <= 30; x++) for (let z = -6; z <= 6; z++) for (let y = 38; y <= 62; y++) {
    world.setBlock(new Vec3(x, y, z), 'stone')
  }
  rig.bot.loadPlugin(createPlugin({ moveSettings: {
    canDig: true, canPlace: false, allowExcavatedDescent: true, maxDropDown: 1,
    excavationWidth: 2, excavationHeight: 2, excavationStairWidth: 2, excavationStairHeight: 3
  }, pathfinderSettings: { heuristicWeight: 1.5, tickTimeoutMs: 5, searchTimeoutMs: 4000 } }))
  const Item = require('prismarine-item')(rig.bot.registry)
  const pick = new Item(rig.bot.registry.itemsByName.iron_pickaxe.id, 1)
  pick.slot = 36; rig.bot.inventory.slots[36] = pick
  rig.bot.updateHeldItem(); rig.bot.pathingUtil.refresh()
  const goal = new goals.GoalMiningApproach(new Vec3(16, 40, 0))
  let firstDescent = Infinity, last: any
  const started = performance.now()
  try {
    for await (const { result } of rig.bot.pathfinder.getPathTo(goal)) {
      last = result
      if (result.path.length >= 4 && result.path.at(-1)!.y <= 61 && firstDescent === Infinity) firstDescent = performance.now() - started
      if (firstDescent < Infinity) break
    }
    t.diagnostic(`first descent=${firstDescent}ms; visited=${last.visitedNodes}; end=${last.path.at(-1)?.exitPos}; status=${last.status}`)
    assert.ok(firstDescent < 1500, `delayed useful descent: ${firstDescent}ms`)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})
