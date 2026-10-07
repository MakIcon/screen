import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, installSurfaceSwimming, Move, movementProviders } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'
import { MovementHandler } from '../src/mineflayer-specific/movements/movementProvider'

for (const version of ['1.20.4', '26.1.2']) {
  test(`swims out of the ocean and builds a supported ascent to a player on a high bridge on ${version}`, { timeout: 18000 }, async (t) => {
    const world = ocean(version)
    for (let y = 56; y <= 67; y++) world.setBlock(new Vec3(5, y, 0), 'stone')
    for (let x = 3; x <= 8; x++) world.setBlock(new Vec3(x, 67, 0), 'stone')
    const { rig } = createCacheWorld(version, 64, new Vec3(3.5, 62, 0.5), { world })
    const Item = require('prismarine-item')(rig.mcData)
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64)
    rig.bot.inventory.slots[9]!.slot = 9
    rig.bot.loadPlugin(createPlugin({ moveSettings: {
      canDig: false, canPlace: true, allow1by1towers: true, maxDropDown: 3, movementTimeoutMs: 3000,
    }, pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30, maxVisitedNodes: 20000 } }))
    installSurfaceSwimming(rig.bot)
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    const planned: any[] = []
    rig.bot.on('pathGenerated', (result: any) => planned.push(...result.path))
    try {
      const target = new Vec3(5.5, 68, 0.5)
      await rig.bot.pathfinder.goto(new goals.GoalFollowEntity(target, 0.8, { neverfinish: false }))
      assert.ok(rig.bot.entity.position.distanceTo(target) <= 0.85, `position=${rig.bot.entity.position}`)
      assert.equal(rig.bot.entity.onGround, true)
      assert.ok(planned.some(move => move.moveType instanceof movementProviders.ForwardJump && move.toPlace.length > 0))
      assert.ok(planned.every(move => move.toBreak.length === 0))
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

for (const scenario of [
  { name: 'no reachable anchor', support: false, blocks: 64, canPlace: true },
  { name: 'not enough inventory blocks', support: true, blocks: 1, canPlace: true },
  { name: 'placement disabled', support: true, blocks: 64, canPlace: false },
]) {
  test(`water exit cannot fabricate a stair with ${scenario.name}`, async () => {
    const world = ocean('26.1.2')
    if (scenario.support) for (let y = 56; y <= 67; y++) world.setBlock(new Vec3(2, y, 0), 'stone')
    const { rig, cacheWorld } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 63, 0.5), { world })
    const settings = { canDig: false, canPlace: scenario.canPlace, allow1by1towers: true }
    rig.bot.loadPlugin(createPlugin({ moveSettings: settings }))
    try {
      const handler = MovementHandler.create(rig.bot, cacheWorld, rig.bot.pathfinder.movements, settings)
      handler.loadGoal(new goals.GoalBlock(1, 64, 0))
      const start = Move.startMove(new movementProviders.IdleMovement(rig.bot, cacheWorld), rig.bot.entity.position, new Vec3(0, 0, 0), scenario.blocks)
      const moves = handler.getNeighbors(start, new Set())
      assert.ok(moves.every(move => !(move.moveType instanceof movementProviders.ForwardJump) || move.toPlace.length === 0))
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

function ocean (version: string) {
  const world = createFlatWorld(version, 56, { renderDistance: 1 })
  for (let x = -3; x <= 12; x++) for (let z = -3; z <= 3; z++) {
    for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), 'water')
  }
  return world
}

for (const version of ['1.20.4', '26.1.2']) {
  test(`surface swimming rises, keeps breathing while idle and survives input clears on ${version}`, { timeout: 6500 }, async () => {
    const world = ocean(version)
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 61, 0.5), { world })
    const originalSet = rig.bot.setControlState
    const listeners = rig.bot.listenerCount('physicsTick')
    const dispose = installSurfaceSwimming(rig.bot)
    assert.equal(installSurfaceSwimming(rig.bot), dispose)
    assert.equal(rig.bot.listenerCount('physicsTick'), listeners + 1)
    const competingControls = () => { rig.bot.clearControlStates(); rig.bot.setControlState('jump', false); rig.bot.setControlState('sneak', true) }
    rig.bot.on('physicsTick', competingControls)
    try {
      await rig.bot.waitForTicks(90)
      assert.ok(rig.bot.entity.position.y > 62.7, `position=${rig.bot.entity.position}`)
      const eye = rig.bot.entity.position.offset(0, 1.62, 0)
      assert.equal(world.getBlock(eye)?.name, 'air', `head=${eye}`)
      rig.bot.off('physicsTick', competingControls)
      dispose()
      dispose()
      assert.equal(rig.bot.setControlState, originalSet)
      assert.equal(rig.bot.listenerCount('physicsTick'), listeners)
      rig.bot.clearControlStates()
      assert.equal(rig.bot.getControlState('jump'), false)
    } finally { rig.bot.off('physicsTick', competingControls); dispose(); rig.stopPassivePhysics() }
  })

  test(`a high ocean drop with digging off reaches an island and keeps its head above water on ${version}`, { timeout: 14000 }, async (t) => {
    const world = ocean(version)
    for (let x = 0; x <= 2; x++) world.setBlock(new Vec3(x, 83, 0), 'stone')
    for (let x = 8; x <= 10; x++) for (let z = -1; z <= 1; z++) world.setBlock(new Vec3(x, 63, z), 'stone')
    const { rig } = createCacheWorld(version, 84, new Vec3(0.5, 84, 0.5), { world })
    rig.bot.loadPlugin(createPlugin({ moveSettings: {
      canDig: false, canPlace: false, maxDropDown: 3, infiniteLiquidDropdownDistance: true, movementTimeoutMs: 3000,
    }, pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30, maxVisitedNodes: 20000 } }))
    installSurfaceSwimming(rig.bot)
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    const used: any[] = []
    rig.bot.on('pathGenerated', (result: any) => {
      used.push(...result.path.map((m: any) => ({ waterLanding: m.metadata?.waterLanding, breaks: m.toBreak.length, places: m.toPlace.length })))
    })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(8, 64, 0))
      assert.ok(used.some(m => m.waterLanding === true))
      assert.ok(used.every(m => m.breaks === 0 && m.places === 0))
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(8, 64, 0)), `position=${rig.bot.entity.position}`)
      assert.equal(rig.bot.entity.onGround, true)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

test('surface swimming can be disabled without replacing navigation inputs', { timeout: 2500 }, async () => {
  const world = ocean('1.20.4')
  const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 61, 0.5), { world })
  const set = rig.bot.setControlState
  installSurfaceSwimming(rig.bot, false)
  assert.equal(rig.bot.setControlState, set)
  try {
    await rig.bot.waitForTicks(30)
    assert.ok(rig.bot.entity.position.y < 61)
    assert.equal(rig.bot.getControlState('jump'), false)
  } finally { rig.stopPassivePhysics() }
})

for (const surface of ['stone', 'lava', 'shallow water', 'covered water']) {
  test(`high drops reject ${surface} even when unlimited water drops are enabled`, async () => {
    const world = createFlatWorld('1.20.4', -64, { renderDistance: 1 })
    for (let x = 0; x <= 2; x++) world.setBlock(new Vec3(x, 83, 0), 'stone')
    for (let x = 3; x <= 7; x++) for (let z = -2; z <= 2; z++) {
      if (surface === 'stone') world.setBlock(new Vec3(x, 63, z), 'stone')
      else {
        world.setBlock(new Vec3(x, 63, z), surface === 'lava' ? 'lava' : 'water')
        world.setBlock(new Vec3(x, 62, z), surface === 'shallow water' ? 'stone' : 'water')
        if (surface === 'covered water') world.setBlock(new Vec3(x, 64, z), 'stone')
      }
    }
    const { rig } = createCacheWorld('1.20.4', 84, new Vec3(0.5, 84, 0.5), { world })
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, maxDropDown: 3, infiniteLiquidDropdownDistance: true }, pathfinderSettings: { searchTimeoutMs: 500 } }))
    try {
      const result = await rig.bot.pathfinder.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, new goals.GoalBlock(5, surface === 'stone' ? 64 : 63, 0))
      assert.equal(result, null)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}
