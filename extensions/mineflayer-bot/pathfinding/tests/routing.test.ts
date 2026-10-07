import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, installSurfaceSwimming, movementProviders } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'

function giveBlocks (rig: ReturnType<typeof createCacheWorld>['rig'], count: number) {
  const Item = require('prismarine-item')(rig.mcData)
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, count)
  rig.bot.inventory.slots[9]!.slot = 9
}

for (const version of ['1.20.4', '26.1.2']) {
  test(`water below a floating platform first reaches shore then builds up on ${version}`, { timeout: 26000 }, async (t) => {
    const world = createFlatWorld(version, 56, { renderDistance: 2 })
    for (let x = -16; x <= 20; x++) for (let z = -6; z <= 6; z++)
      for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), 'water')
    for (let x = 8; x <= 13; x++) for (let z = -2; z <= 2; z++) world.setBlock(new Vec3(x, 63, z), 'stone')
    for (let x = 0; x <= 2; x++) world.setBlock(new Vec3(x, 71, 0), 'stone')
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 62, 0.5), { world })
    giveBlocks(rig, 64)
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: true, movementTimeoutMs: 3000 },
      pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30, maxVisitedNodes: 20000 } }))
    installSurfaceSwimming(rig.bot)
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    let reachedShore = false
    const place = rig.bot._placeBlockWithOptions
    rig.bot.on('physicsTick', () => {
      if (rig.bot.entity.onGround && rig.bot.entity.position.x >= 7.7 && rig.bot.entity.position.y >= 64) reachedShore = true
    })
    rig.bot._placeBlockWithOptions = (block: any, face: Vec3, opts: any) => {
      assert.ok(reachedShore, 'Swim to a real shore before trying to build toward the sky platform')
      return place(block, face, opts)
    }
    try {
      await rig.bot.pathfinder.goto(new goals.GoalFollowEntity(new Vec3(1.5, 72, 0.5), 0.7))
      assert.equal(reachedShore, true)
      assert.equal(rig.bot.entity.onGround, true)
      assert.ok(rig.bot.entity.position.distanceTo(new Vec3(1.5, 72, 0.5)) < 0.8, String(rig.bot.entity.position))
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

test('a supported three-block stair beats excavating a survival stone wall', { timeout: 12000 }, async (t) => {
  const world = createFlatWorld('26.1.2', -64, { renderDistance: 1 })
  world.setBlock(new Vec3(0, 63, 0), 'stone')
  for (let y = 63; y <= 66; y++) world.setBlock(new Vec3(2, y, 0), 'stone')
  const { rig } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { world })
  giveBlocks(rig, 3)
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: true, canPlace: true, movementTimeoutMs: 3000 },
    pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30, maxVisitedNodes: 20000 } }))
  for (const provider of rig.bot.pathfinder.movements.keys()) {
    if (/Parkour|Ladder|Neo|AroundCorner|Momentum/.test(provider.name)) rig.bot.pathfinder.dropMovement(provider)
  }
  t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
  const routes: any[] = []
  const digs: Vec3[] = []
  const dig = rig.bot.dig
  rig.bot.dig = (block: any, ...args: any[]) => { digs.push(block.position.clone()); return dig(block, ...args) }
  rig.bot.on('pathGenerated', (result: any) => routes.push(...result.path))
  try {
    await rig.bot.pathfinder.goto(new goals.GoalBlock(2, 67, 0))
    assert.deepEqual(digs, [])
    assert.equal(routes.reduce((count, move) => count + move.toPlace.length, 0), 3)
    assert.ok(rig.bot.entity.position.floored().equals(new Vec3(2, 67, 0)))
    assert.equal(rig.bot.entity.onGround, true)
    assert.equal(world.getBlock(new Vec3(2, 66, 0))?.name, 'stone')
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})
