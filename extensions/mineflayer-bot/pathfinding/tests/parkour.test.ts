import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, movementProviders } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'
import { loadMcData } from './setup/mc-data'

for (const dir of [new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)]) {
  test(`Neo around a two-block wall on a one-wide strip ${dir}`, { timeout: 10000 }, async () => {
    const world = createFlatWorld('1.20.4', -64, { renderDistance: 1 })
    const start = new Vec3(0.5, 64, 0.5)
    for (let i = 0; i < 10; i++) world.setBlock(new Vec3(dir.x * i, 63, dir.z * i), 'stone')
    for (let y = 64; y <= 65; y++) world.setBlock(new Vec3(dir.x * 3, y, dir.z * 3), 'stone')
    const { rig } = createCacheWorld('1.20.4', 64, start, { world })
    rig.bot.loadPlugin(createPlugin({
      moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 },
      pathfinderSettings: { searchTimeoutMs: 1000, tickTimeoutMs: 5 }
    }))
    const used: string[] = []
    let lowest = 64
    const facing: number[] = []
    const turns: number[] = []
    let previousYaw: number | undefined
    rig.bot.on('pathGenerated', (result: any) => used.push(...result.path.map((m: any) => m.moveType.constructor.name)))
    rig.bot.on('physicsTick', () => {
      lowest = Math.min(lowest, rig.bot.entity.position.y)
      const move = rig.bot.pathfinder.currentMove
      if (!(move?.moveType instanceof movementProviders.NeoProvider) || rig.bot.entity.onGround) { previousYaw = undefined; return }
      const delta = move.exitPos.minus(rig.bot.entity.position); delta.y = 0
      const yaw = rig.bot.entity.yaw
      facing.push(new Vec3(-Math.sin(yaw), 0, -Math.cos(yaw)).dot(delta.normalize()))
      if (previousYaw != null) turns.push(Math.abs(Math.atan2(Math.sin(yaw - previousYaw), Math.cos(yaw - previousYaw))))
      previousYaw = yaw
    })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(dir.x * 7, 64, dir.z * 7))
      assert.ok(used.includes('NeoProvider'), used.join(','))
      assert.ok(facing.length > 5)
      assert.ok(facing.every(dot => dot >= 0.45), `looked away from landing: ${facing}`)
      assert.ok(turns.every(angle => angle <= Math.PI / 3 + 0.01), `abrupt turn: ${turns}`)
      assert.ok(lowest >= 63.99, `fell to ${lowest}`)
      assert.equal(rig.bot.entity.onGround, true)
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(dir.x * 7, 64, dir.z * 7)))
      assert.equal(rig.bot.inventory.items().length, 0)
      assert.ok(rig.bot.pathfinder.movements.has(movementProviders.NeoProvider))
    } finally {
      await rig.bot.pathfinder.destroy()
      rig.stopPassivePhysics()
    }
  })
}

for (const scenario of [
  { name: 'Neo with a blocked left side on 26.1.2', version: '26.1.2', width: 1, blocked: true },
  { name: 'Neo around a wall two blocks long', version: '1.20.4', width: 2, blocked: false }
]) {
  test(scenario.name, { timeout: 10000 }, async () => {
    const world = createFlatWorld(scenario.version, -64, { renderDistance: 1 })
    for (let x = 0; x < 10; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
    for (let x = 3; x < 3 + scenario.width; x++) {
      for (let y = 64; y <= 65; y++) world.setBlock(new Vec3(x, y, 0), 'stone')
    }
    if (scenario.blocked) {
      for (let x = 1; x < 6; x++) for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(x, y, -1), 'stone')
    }
    const { rig } = createCacheWorld(scenario.version, 64, new Vec3(0.5, 64, 0.5), { world })
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 } }))
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(7, 64, 0))
      assert.ok(rig.bot.entity.position.y >= 64)
    } finally {
      await rig.bot.pathfinder.destroy()
      rig.stopPassivePhysics()
    }
  })
}

test('ladder-assisted parkour climbs to a landing two blocks higher', { timeout: 12000 }, async () => {
  const world = createFlatWorld('1.20.4', -64, { renderDistance: 1 })
  for (let x = 0; x <= 1; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
  for (let y = 63; y <= 65; y++) world.setBlock(new Vec3(4, y, 0), 'stone')
  const { mcData, Block } = loadMcData('1.20.4')
  const ladder = mcData.blocksByName.ladder
  let stateId = ladder.minStateId
  for (let state = ladder.minStateId; state <= ladder.maxStateId; state++) {
    const props = Block.fromStateId(state, 0).getProperties()
    if (props.facing === 'west' && !props.waterlogged) { stateId = state; break }
  }
  for (let y = 64; y <= 65; y++) world.setBlock(new Vec3(3, y, 0), stateId)
  const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5), { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 } }))
  const used: string[] = []
  rig.bot.on('pathGenerated', (result: any) => used.push(...result.path.map((m: any) => m.moveType.constructor.name)))
  try {
    await rig.bot.pathfinder.goto(new goals.GoalBlock(4, 66, 0))
    assert.ok(used.some(name => name.startsWith('Ladder')), used.join(','))
    assert.ok(rig.bot.entity.position.y >= 65.99)
  } finally {
    await rig.bot.pathfinder.destroy()
    rig.stopPassivePhysics()
  }
})

test('following a moving player finishes the Neo flight before retargeting', { timeout: 8500 }, async () => {
  const world = createFlatWorld('1.20.4', -64, { renderDistance: 1 })
  for (let x = 0; x < 10; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
  for (let y = 64; y <= 65; y++) world.setBlock(new Vec3(3, y, 0), 'stone')
  const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5), { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 } }))
  const target = { position: new Vec3(7, 64, 0.5) }
  let moved = false
  let failure: unknown
  let lowest = 64
  rig.bot.on('physicsTick', () => {
    lowest = Math.min(lowest, rig.bot.entity.position.y)
    if (!moved && rig.bot.pathfinder.currentMove?.moveType instanceof movementProviders.NeoProvider && rig.bot.entity.position.y > 64.1) {
      moved = true
      target.position.x = 8.5
      rig.bot.emit('entityMoved', target)
    }
  })
  const running = rig.bot.pathfinder.goto(goals.GoalFollowEntity.fromEntity(target, 0.8, { neverfinish: true })).catch((error: unknown) => { failure = error })
  try {
    await rig.bot.waitForTicks(100)
    assert.equal(failure, undefined)
    assert.equal(moved, true)
    assert.ok(lowest >= 63.99, `fell to ${lowest}`)
    assert.ok(rig.bot.entity.position.distanceTo(target.position) <= 0.9, `position=${rig.bot.entity.position}`)
    await rig.bot.pathfinder.stop()
    await running
  } finally {
    await rig.bot.pathfinder.destroy()
    rig.stopPassivePhysics()
  }
})

for (const scenario of [
  { name: 'forward gap', landing: new Vec3(5, 64, 0), source: 3 },
  { name: 'one-block-up gap', landing: new Vec3(4, 65, 0), source: 3 },
  { name: 'one-block-down gap', landing: new Vec3(5, 63, 0), source: 3 },
  { name: 'asymmetric diagonal gap', landing: new Vec3(2, 64, 1), source: 1 }
]) {
  test(`parkour crosses a ${scenario.name} without inventory blocks`, { timeout: 10000 }, async () => {
    const world = createFlatWorld('1.20.4', -64, { renderDistance: 1 })
    for (let x = 0; x < scenario.source; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
    const landing = scenario.landing
    world.setBlock(landing.offset(0, -1, 0), 'stone')
    const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5), { world })
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 } }))
    try {
      await rig.bot.pathfinder.goto(goals.GoalBlock.fromVec(landing))
      assert.ok(rig.bot.entity.position.floored().equals(landing), `position=${rig.bot.entity.position}`)
      assert.equal(rig.bot.entity.onGround, true)
    } finally {
      await rig.bot.pathfinder.destroy()
      rig.stopPassivePhysics()
    }
  })
}
