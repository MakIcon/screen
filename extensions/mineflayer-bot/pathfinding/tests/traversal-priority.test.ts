import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld } from './setup'
import { loadMcData } from './setup/mc-data'

for (const { version, missingStart = false } of [
  { version: '1.20.4' }, { version: '26.1.2' }, { version: '26.1.2', missingStart: true }
]) test(`come ${missingStart ? 'repairs only the missing start before using' : 'uses'} a ready gap, Neo, ladder and upper gap with building enabled on ${version}`, { timeout: 30000 }, async (t) => {
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 84, 0.5), { renderDistance: 1 })
  for (let y = 64; y < 84; y++) world.setBlock(new Vec3(0, y, 0), 'cobblestone')
  const shift = missingStart ? 3 : 0
  for (const x of [0, 1, 5 + shift, 6 + shift, 7 + shift, 8 + shift]) world.setBlock(new Vec3(x, 83, 0), 'stone')
  for (const y of [84, 85]) world.setBlock(new Vec3(6 + shift, y, 0), 'stone')
  const { mcData, Block } = loadMcData(version)
  const ladder = mcData.blocksByName.ladder
  let stateId: number | undefined
  for (let state = ladder.minStateId; state <= ladder.maxStateId; state++) {
    const props = Block.fromStateId(state, 0).getProperties()
    if (props.facing === 'west' && !props.waterlogged) { stateId = state; break }
  }
  assert.ok(stateId != null)
  for (let y = 84; y <= 87; y++) {
    world.setBlock(new Vec3(9 + shift, y, 0), 'stone')
    world.setBlock(new Vec3(8 + shift, y, 0), stateId)
  }
  for (const x of [9, 10, 11, 14, 15, 16]) world.setBlock(new Vec3(x + shift, 87, 0), 'stone')
  rig.bot.loadPlugin(createPlugin({
    pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, maxVisitedNodes: 20000,
      heuristicWeight: 1.5, routePrefixMs: 30, routePrefixLength: 16 },
    moveSettings: { canDig: true, canPlace: true, allowJumpSprint: true, movementTimeoutMs: 3000 }
  }))
  const Item = require('prismarine-item')(rig.mcData)
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64)
  rig.bot.inventory.slots[9].slot = 9
  const used: string[] = [], placed: Vec3[] = [], dug: Vec3[] = []
  let firstRoute: number | undefined
  let lowest = 84
  const started = performance.now()
  rig.bot.on('pathGenerated', (path: any) => {
    firstRoute ??= performance.now() - started
    used.push(...path.path.map((move: any) => move.moveType.constructor.name))
  })
  rig.bot.on('physicsTick', () => { lowest = Math.min(lowest, rig.bot.entity.position.y) })
  const place = rig.bot._placeBlockWithOptions
  rig.bot._placeBlockWithOptions = (block: any, face: Vec3, ...args: any[]) => {
    placed.push(block.position.plus(face)); return place(block, face, ...args)
  }
  const dig = rig.bot.dig
  rig.bot.dig = (block: any, ...args: any[]) => { dug.push(block.position.clone()); return dig(block, ...args) }
  t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
  try {
    const target = new Vec3(16.5 + shift, 88, 0.5)
    await rig.bot.pathfinder.goto(goals.GoalNear.fromVec(target, 0.7))
    if (missingStart) {
      assert.ok(placed.length >= 2 && placed.length <= 3, `only fill the excessive starting gap: ${placed}`)
      assert.ok(placed.every(pos => pos.x < 5 + shift && pos.y === 83), `do not bypass the ready obstacles: ${placed}`)
    } else assert.deepEqual(placed, [], `do not build around a usable course: ${used}`)
    assert.deepEqual(dug, [], 'preserve the existing obstacles and ladder')
    assert.ok(used.includes('NeoProvider'), used.join(','))
    assert.ok(used.includes('Climb'), used.join(','))
    assert.ok(used.some(name => /Parkour/.test(name)), used.join(','))
    assert.ok(firstRoute! < 700, `planning=${firstRoute}ms`)
    assert.ok(lowest >= 83.99, `lost the course landing and fell to ${lowest}`)
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(target) < 0.8)
    t.diagnostic(`ready course: first route=${firstRoute!.toFixed(1)}ms, duration=${(performance.now() - started).toFixed(0)}ms`)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('a ladder-assisted jump uses the existing ladder when building is allowed and digging is off', { timeout: 12000 }, async (t) => {
  const version = '26.1.2'
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 84, 0.5), { renderDistance: 1 })
  for (const x of [0, 1]) world.setBlock(new Vec3(x, 83, 0), 'stone')
  for (let y = 83; y <= 85; y++) world.setBlock(new Vec3(4, y, 0), 'stone')
  const { mcData, Block } = loadMcData(version)
  const ladder = mcData.blocksByName.ladder
  const stateId = Array.from({ length: ladder.maxStateId - ladder.minStateId + 1 }, (_, i) => ladder.minStateId + i)
    .find(id => { const props = Block.fromStateId(id, 0).getProperties(); return props.facing === 'west' && !props.waterlogged })
  assert.ok(stateId != null)
  for (const y of [84, 85]) world.setBlock(new Vec3(3, y, 0), stateId)
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: true, movementTimeoutMs: 3000 },
    pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30 } }))
  const Item = require('prismarine-item')(rig.mcData)
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64)
  rig.bot.inventory.slots[9].slot = 9
  const placed: Vec3[] = [], used: string[] = []
  const place = rig.bot._placeBlockWithOptions
  rig.bot._placeBlockWithOptions = (block: any, face: Vec3, ...args: any[]) => {
    placed.push(block.position.plus(face)); return place(block, face, ...args)
  }
  rig.bot.on('pathGenerated', (path: any) => used.push(...path.path.map((move: any) => move.moveType.constructor.name)))
  t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
  try {
    await rig.bot.pathfinder.goto(new goals.GoalBlock(4, 86, 0))
    assert.deepEqual(placed, [])
    assert.ok(used.some(name => name.startsWith('Ladder')), used.join(','))
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.y === 86)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

for (const permission of ['canDig', 'canPlace'] as const) {
  test(`terrain-preserving pursuit permits necessary ${permission === 'canDig' ? 'digging' : 'building'} after exhausting traversal`, async () => {
    const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
    if (permission === 'canDig') {
      // The bot is enclosed under a roof. Jumping, walking and detouring cannot exit.
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
        world.setBlock(new Vec3(x, 66, z), 'dirt')
        if (x === 0 && z === 0) continue
        for (const y of [64, 65]) world.setBlock(new Vec3(x, y, z), 'dirt')
      }
    } else {
      // Isolated high platforms are separated by more than a normal jump.
      rig.bot.entity.position.set(0.5, 84, 0.5)
      world.setBlock(new Vec3(0, 83, 0), 'stone')
      for (let x = 7; x <= 9; x++) world.setBlock(new Vec3(x, 83, 0), 'stone')
      const Item = require('prismarine-item')(rig.mcData)
      rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64)
      rig.bot.inventory.slots[9].slot = 9
    }
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: permission === 'canDig', canPlace: permission === 'canPlace',
      maxDropDown: 3, allowWaterDrop: false, allowBucketWaterDrop: false },
      pathfinderSettings: { searchTimeoutMs: 2500, maxVisitedNodes: 20000 } }))
    try {
      const target = new Vec3(8.5, permission === 'canDig' ? 64 : 84, 0.5)
      let result: any
      for await (const path of rig.bot.pathfinder.getPathTo(goals.GoalFollowEntity.fromEntity({ position: target }, 2.5, {}),
        undefined, 1, { preferExistingTerrain: true })) result = path.result
      assert.equal(result.status, 'success')
      assert.ok(result.path.some((move: any) => permission === 'canDig' ? move.toBreak.length > 0 : move.toPlace.length > 0),
        'an exhausted traversal search must still allow the required block interaction')
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

test('a pursuit search timeout does not authorize terrain edits', async () => {
  const { rig } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: true, canPlace: true },
    pathfinderSettings: { searchTimeoutMs: 2500, maxVisitedNodes: 1 } }))
  try {
    let result: any
    for await (const path of rig.bot.pathfinder.getPathTo(new goals.GoalBlock(12, 64, 0), undefined, 1,
      { preferExistingTerrain: true })) result = path.result
    assert.equal(result.status, 'timeout')
    assert.ok(result.path.every((move: any) => move.toBreak.length === 0 && move.toPlace.length === 0))
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})
