import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, movementProviders } from '../src'
import { createCacheWorld } from './setup'
import { Move } from '../src/mineflayer-specific/move'
import { TraversalMemory } from '../src/mineflayer-specific/traversalMemory'

function cave (version: string, position = new Vec3(0.5, 75, 0.5)) {
  const { rig, world } = createCacheWorld(version, 64, position, { renderDistance: 2 })
  for (let x = -30; x <= 8; x++) for (let z = -24; z <= 24; z++) {
    for (let y = 64; y <= 74; y++) world.setBlock(new Vec3(x, y, z), 'stone')
    if (x >= -27 && x <= 5 && Math.abs(z) <= 21)
      for (let y = 64; y <= 67; y++) world.setBlock(new Vec3(x, y, z), 'cave_air')
  }
  for (let step = 0; step <= 11; step++) {
    const x = -26 + step
    world.setBlock(new Vec3(x, 63 + step, -20), 'stone')
    for (let y = 64 + step; y <= 67 + step; y++) world.setBlock(new Vec3(x, y, -20), 'air')
  }
  rig.bot.loadPlugin(createPlugin({
    pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, maxVisitedNodes: 20000,
      heuristicWeight: 1.5, routePrefixMs: 30, routePrefixLength: 16 },
    moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, movementTimeoutMs: 3000 }
  }))
  for (const provider of [movementProviders.ParkourForward, movementProviders.ParkourDiagonal,
    movementProviders.MomentumJump, movementProviders.NeoProvider]) rig.bot.pathfinder.dropMovement(provider)
  return { rig, world, navigator: rig.bot.pathfinder }
}

for (const version of ['1.20.4', '26.1.2']) test(`walking approaches a cave staircase diagonally and descends without sliding along its rim on ${version}`, { timeout: 20000 }, async (t) => {
  const { rig, navigator } = cave(version, new Vec3(-13.5, 75, -18.5))
  navigator.setMoveOptions({ allowSprinting: false, maxDropDown: 2 })
  t.after(async () => { await navigator.destroy(); rig.stopPassivePhysics() })
  t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
  await navigator.goto(new goals.GoalBlock(-26, 64, -20))
  assert.ok(rig.bot.entity.position.distanceTo(new Vec3(-25.5, 64, -19.5)) < 0.9)
})

for (const version of ['1.20.4', '26.1.2']) test(`returns through a broad cave whose stairs lead away from the owner on ${version}`, { timeout: 40000 }, async (t) => {
  const { rig, world, navigator } = cave(version)
  t.after(async () => { await navigator.destroy(); rig.stopPassivePhysics() })
  t.signal.addEventListener('abort', () => { void navigator.stop() }, { once: true })
  navigator.setOptions({ searchTimeoutMs: 300, maxVisitedNodes: 1000, routePrefixMs: 0 })
  const owner = new goals.GoalNear(0.5, 75, 0.5, 0.8)
  const cold = await navigator.getPathFromToRaw(new Vec3(0.5, 64, 0.5), new Vec3(0, 0, 0), owner)
  assert.ok(cold == null, `ordinary cave search: nodes=${cold?.visitedNodes}, steps=${cold?.path.length}`)
  navigator.setOptions({ searchTimeoutMs: 2500, maxVisitedNodes: 20000, routePrefixMs: 30 })
  await navigator.goto(new goals.GoalBlock(-15, 75, -20))
  await navigator.goto(new goals.GoalBlock(-26, 64, -20))
  await navigator.goto(new goals.GoalBlock(0, 64, 0))
  // A low budget reproduces the cave flood that previously exhausted the
  // ordinary return search and sent delivery into excavation/construction.
  navigator.setOptions({ searchTimeoutMs: 300, maxVisitedNodes: 1000, routePrefixMs: 0 })
  const began = performance.now()
  const route = await navigator.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, owner)
  assert.ok(route != null, 'the known cave exit must remain reachable within the search budget')
  assert.ok(route.path.some((move: Move) => move.x <= -24 && move.z <= -18), 'reach the stairs away from the owner')
  assert.ok(route.path.every((move: Move) => move.toBreak.length === 0 && move.toPlace.length === 0))
  assert.ok(performance.now() - began < 1800, 'do not exhaust repeated full cave searches')
  // Remembered coordinates do not authorize crossing a newly blocked passage.
  for (let y = 70; y <= 73; y++) world.setBlock(new Vec3(-20, y, -20), 'stone')
  assert.ok(await navigator.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, owner) == null,
    'a blocked remembered staircase cannot supply a route')
  for (let y = 70; y <= 73; y++) world.setBlock(new Vec3(-20, y, -20), 'air')
  for (let x = 9; x <= 18; x++) for (let z = -3; z <= 3; z++) world.setBlock(new Vec3(x, 74, z), 'stone')
  const movedOwner = new goals.GoalNear(16.5, 75, 0.5, 0.8)
  const extended = await navigator.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, movedOwner)
  assert.ok(extended != null, 'connect the remembered mine exit to the owner outside the recorded area')
  assert.ok(movedOwner.isEnd(extended.path[extended.path.length - 1]))
  // Test delivery's construction-enabled fallback too: it must still prefer
  // the remembered cave entrance to carving a second exit.
  navigator.setMoveOptions({ canDig: true, canPlace: true })
  const travel = await navigator.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, owner)
  assert.ok(travel != null && travel.path.every((move: Move) => move.toBreak.length === 0 && move.toPlace.length === 0))
  navigator.setMoveOptions({ canDig: false, canPlace: false })
  await navigator.goto(owner)
  assert.ok(rig.bot.entity.position.distanceTo(new Vec3(0.5, 75, 0.5)) < 0.9)
  for (let step = 0; step <= 11; step++) {
    world.setBlock(new Vec3(step, 63 + step, 0), 'stone')
    for (let y = 64 + step; y <= 67 + step; y++) world.setBlock(new Vec3(step, y, 0), 'air')
  }
  const shortcut = await navigator.getPathFromToRaw(new Vec3(0.5, 64, 0.5), new Vec3(0, 0, 0), owner)
  assert.ok(shortcut != null && shortcut.path.every((move: Move) => move.x > -5),
    'an opened cave shortcut takes priority over the older remembered detour')
  rig.bot.emit('respawn')
  // Close the shortcut: a respawn must not reuse the old dimension's hints.
  for (let y = 70; y <= 73; y++) world.setBlock(new Vec3(6, y, 0), 'stone')
  assert.ok(await navigator.getPathFromToRaw(new Vec3(0.5, 64, 0.5), new Vec3(0, 0, 0), owner) == null,
    'respawn clears the remembered passages')
})

test('traversal memory stays bounded and does not connect distant recorded cells', () => {
  const memory = new TraversalMemory(8)
  for (let x = 0; x <= 10; x++) memory.remember(new Vec3(x, 64, 0))
  assert.equal(memory.size, 8)
  assert.equal(memory.contains(new Vec3(0, 64, 0)), false)
  assert.equal(memory.contains(new Vec3(10, 65, 1)), true)
  memory.remember(new Vec3(40, 64, 0))
  assert.equal(memory.contains(new Vec3(25, 64, 0)), false, 'a teleport cannot imply a passage between its endpoints')
  memory.clear()
  assert.equal(memory.contains(new Vec3(40, 64, 0)), false)
})

for (const version of ['1.20.4', '26.1.2']) test(`horizontal mining uses the cave around a wall before excavating on ${version}`, async (t) => {
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: true, canPlace: false, allowExcavatedDescent: true,
    excavationWidth: 2, excavationStairWidth: 2 } }))
  const navigator = rig.bot.pathfinder
  t.after(async () => { await navigator.destroy(); rig.stopPassivePhysics() })
  for (let z = -1; z <= 1; z++) for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(1, y, z), 'stone')
  world.setBlock(new Vec3(3, 64, 0), 'diamond_ore')
  // Even an instant-mine tool must not make a new tunnel mandatory when an
  // existing cave already connects to the ore's neighbouring feet cell.
  rig.bot.pathingUtil.digCost = () => 0
  const goal = new goals.GoalMiningApproach(new Vec3(3, 64, 0))
  const route = await navigator.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, goal)
  assert.ok(route != null && goal.isEnd(route.path[route.path.length - 1]))
  assert.ok(route.path.every((move: Move) => move.toBreak.length === 0 && move.toPlace.length === 0))
})
