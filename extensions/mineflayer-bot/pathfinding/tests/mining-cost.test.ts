import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { PathingUtil } from '../src/PathingUtil'
import { createCacheWorld } from './setup'

test('mining costs account for tools, water and unsupported footing independently', () => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5))
  const util = new PathingUtil(rig.bot)
  const block = world.getBlock(new Vec3(0, 63, 0))!
  try {
    const dry = util.digCost(block, { inWater: false, notOnGround: false })
    const water = util.digCost(block, { inWater: true, notOnGround: false })
    const air = util.digCost(block, { inWater: false, notOnGround: true })
    const both = util.digCost(block, { inWater: true, notOnGround: true })
    assert.ok(water >= dry * 4.8)
    assert.ok(air >= dry * 4.8)
    assert.ok(both >= dry * 24)
    assert.equal(util.digCost(block, { inWater: false, notOnGround: false }), dry)
    const Item = require('prismarine-item')(rig.mcData)
    const pick = new Item(rig.mcData.itemsByName.diamond_pickaxe.id, 1)
    pick.slot = 9; rig.bot.inventory.slots[9] = pick
    util.refresh()
    assert.equal(util.bestHarvestingTool(block), pick)
    assert.ok(util.digCost(block, { inWater: false, notOnGround: false }) < dry)
  } finally { rig.stopPassivePhysics() }
})
