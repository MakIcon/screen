import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { PathingUtil } from '../src/PathingUtil'
import { createPlugin } from '../src'
import { createCacheWorld } from './setup'

for (const version of ['1.20.4', '26.1.2']) {
  test(`ore dig timing uses pickaxe speed and efficiency without changing harvest tiers on ${version}`, async () => {
    const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5))
    // Keep a block instance created before the compatibility installer.
    const diamond = world.setBlock(new Vec3(1, 64, 0), 'diamond_ore')
    const deepslate = world.setBlock(new Vec3(2, 64, 0), 'deepslate_diamond_ore')
    rig.bot.loadPlugin(createPlugin())
    const Item = require('prismarine-item')(rig.mcData)
    const pick = new Item(rig.mcData.itemsByName.iron_pickaxe.id, 1)
    pick.slot = 36; rig.bot.inventory.slots[36] = pick
    rig.bot.updateHeldItem(); rig.bot.pathingUtil.refresh()
    try {
      await rig.bot.waitForTicks(2)
      assert.equal(rig.bot.digTime(diamond), 750)
      assert.equal(rig.bot.digTime(deepslate), 1150)
      assert.equal(rig.bot.pathingUtil.digCost(diamond), 750)
      assert.equal(rig.bot.pathingUtil.bestHarvestingTool(diamond), pick)
      assert.equal(Boolean(diamond.canHarvest(rig.mcData.itemsByName.wooden_pickaxe.id)), false)
      assert.equal(Boolean(diamond.canHarvest(rig.mcData.itemsByName.golden_pickaxe.id)), false)
      Object.defineProperty(pick, 'enchants', { value: [{ name: 'efficiency', lvl: 5 }] })
      rig.bot.pathingUtil.refresh()
      assert.equal(rig.bot.digTime(diamond), 150)
      assert.equal(rig.bot.pathingUtil.digCost(diamond), 150)
      rig.bot.entity.onGround = false
      assert.equal(rig.bot.digTime(diamond), 750, 'preserve the real airborne penalty')
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

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
