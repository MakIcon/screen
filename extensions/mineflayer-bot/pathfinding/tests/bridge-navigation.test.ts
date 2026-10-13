import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, movementProviders } from '../src'
import { createCacheWorld } from './setup'

for (const scenario of [
  { name: 'a level bridge from a high pillar', startY: 84, targetY: 84, targetX: 12, targetZ: 0, parkour: false, count: 64 },
  { name: 'a diagonal bridge from a high pillar', startY: 84, targetY: 84, targetX: 10, targetZ: 6, parkour: false, count: 64 },
  { name: 'a tower followed by a long bridge', startY: 64, targetY: 84, targetX: 12, targetZ: 0, parkour: false, count: 64 },
  { name: 'a bridge to a lower offset platform with parkour enabled', startY: 84, targetY: 82, targetX: 18, targetZ: 6, parkour: true, count: 64 },
  { name: 'a short bridge followed by a jump with only two blocks', startY: 84, targetY: 84, targetX: 6, targetZ: 0, parkour: true, count: 2 }
]) test(`come completes ${scenario.name} without pausing to search at the rim`, { timeout: 40000 }, async (t) => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, scenario.startY, 0.5), { renderDistance: 1 })
  if (scenario.startY > 64) for (let y = 64; y < 84; y++) world.setBlock(new Vec3(0, y, 0), 'cobblestone')
  for (let x = scenario.targetX; x <= scenario.targetX + 3; x++)
    for (let z = scenario.targetZ - 1; z <= scenario.targetZ + 1; z++) world.setBlock(new Vec3(x, scenario.targetY - 1, z), 'stone')
  rig.bot.loadPlugin(createPlugin({
    pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, maxVisitedNodes: 20000,
      heuristicWeight: 1.5, routePrefixMs: 30, routePrefixLength: 16 },
    moveSettings: { canDig: true, canPlace: true, allowJumpSprint: scenario.parkour, movementTimeoutMs: 3000 }
  }))
  const navigator = rig.bot.pathfinder
  for (const provider of [movementProviders.ParkourForward, movementProviders.ParkourDiagonal,
    movementProviders.MomentumJump, movementProviders.NeoProvider, movementProviders.LadderForward,
    movementProviders.LadderDiagonal, movementProviders.LadderLandingForward,
    movementProviders.LadderLandingDiagonal, movementProviders.AroundCornerDiagonal]) {
      if (!scenario.parkour) navigator.dropMovement(provider)
    }
  const Item = require('prismarine-item')(rig.mcData)
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, scenario.count)
  rig.bot.inventory.slots[9].slot = 9
  const started = performance.now()
  const paths: any[] = [], placed: Vec3[] = [], resets: string[] = []
  let firstRoute: number | undefined, lowest = scenario.startY
  rig.bot.on('pathGenerated', (path: any) => { firstRoute ??= performance.now() - started; paths.push(path) })
  rig.bot.on('resetPath', (reason: string) => resets.push(reason))
  rig.bot.on('physicsTick', () => { lowest = Math.min(lowest, rig.bot.entity.position.y) })
  const place = rig.bot._placeBlockWithOptions
  rig.bot._placeBlockWithOptions = (block: any, face: Vec3, ...args: any[]) => {
    assert.ok(block.shapes.length > 0, 'each bridge block must attach to an existing support')
    placed.push(block.position.plus(face)); return place(block, face, ...args)
  }
  t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
  try {
    const destination = new Vec3(scenario.targetX + 2.5, scenario.targetY, scenario.targetZ + 0.5)
    await navigator.goto(goals.GoalNear.fromVec(destination, 0.7))
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.distanceTo(destination) < 0.8,
      `position=${rig.bot.entity.position}, plans=${paths.length}, placements=${placed.length}, resets=${resets}`)
    assert.ok(firstRoute! < 700, `first route took ${firstRoute}ms`)
    assert.ok(paths.length <= 3, `routes=${paths.length}, resets=${resets}`)
    assert.ok(lowest >= Math.min(scenario.startY, scenario.targetY) - 0.01, `fell to ${lowest}`)
    const minimumBlocks = scenario.startY === 64 || scenario.count === 2 ? 1 : 5
    assert.ok(placed.filter(pos => pos.y >= 81 && (pos.x !== 0 || pos.z !== 0)).length >= minimumBlocks, 'actually finish a supported bridge')
    assert.ok(placed.length <= scenario.count, 'do not plan with blocks that are missing from inventory')
    if (scenario.count === 2) assert.ok(paths.some(path => path.path.some((move: any) => /Parkour/.test(move.moveType.constructor.name))))
    assert.deepEqual(resets, [], 'expected construction must not invalidate its own route')
    t.diagnostic(`first route=${firstRoute!.toFixed(1)}ms, routes=${paths.length}, blocks=${placed.length}, duration=${(performance.now() - started).toFixed(0)}ms`)
  } finally { await navigator.destroy(); rig.stopPassivePhysics() }
})

test('bridge traversal waits on the real floor during delayed server placement', { timeout: 15000 }, async (t) => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 84, 0.5), { renderDistance: 1 })
  for (let y = 64; y < 84; y++) world.setBlock(new Vec3(0, y, 0), 'stone')
  for (let x = 5; x <= 8; x++) world.setBlock(new Vec3(x, 83, 0), 'stone')
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, movementTimeoutMs: 3000 },
    pathfinderSettings: { tickTimeoutMs: 5, routePrefixMs: 30 } }))
  for (const provider of [movementProviders.ParkourForward, movementProviders.ParkourDiagonal,
    movementProviders.MomentumJump, movementProviders.NeoProvider]) rig.bot.pathfinder.dropMovement(provider)
  const Item = require('prismarine-item')(rig.mcData)
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 8)
  rig.bot.inventory.slots[9].slot = 9
  const place = rig.bot._placeBlockWithOptions
  let confirmations = 0
  rig.bot._placeBlockWithOptions = async (block: any, face: Vec3, ...args: any[]) => {
    const floor = block.position.plus(face)
    await rig.bot.waitForTicks(4)
    assert.equal(world.getBlock(floor)!.name, 'air', 'do not predict a floor before server confirmation')
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.y === 84, 'wait on the real support')
    confirmations++
    return place(block, face, ...args)
  }
  t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
  try {
    await rig.bot.pathfinder.goto(new goals.GoalBlock(7, 84, 0))
    assert.ok(confirmations >= 4)
    assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.y === 84)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})
