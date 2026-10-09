import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'
import { predictMomentumJump } from '../src/mineflayer-specific/movements/momentum'

test('a blocked ice takeoff does not execute a walking prefix that stops on the ice', { timeout: 8000 }, async () => {
  const world = createFlatWorld('26.1.2', -64, { renderDistance: 2 })
  // Preserve the user's geometry, with a ceiling making the takeoff impossible.
  for (let x = 0; x <= 7; x++) world.setBlock(new Vec3(x, 70, 0), x === 7 ? 'ice' : 'cobblestone')
  for (let x = 13; x <= 14; x++) world.setBlock(new Vec3(x, 70, 0), 'cobblestone')
  world.setBlock(new Vec3(7, 73, 0), 'stone')
  const start = new Vec3(0.5, 71, 0.5)
  const { rig } = createCacheWorld('26.1.2', 71, start, { world })
  rig.bot.entity.onGround = true
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false },
    pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 0.1, routePrefixMs: 1, routePrefixLength: 16 } }))
  let jumped = false
  rig.bot.on('physicsTick', () => { jumped ||= rig.bot.getControlState('jump') })
  try {
    await assert.rejects(rig.bot.pathfinder.goto(new goals.GoalNear(13.5, 71, 0.5, 1)), /no verified route beyond the ice/)
    assert.equal(jumped, false, 'do not consume a runway hop before finding its continuation')
    assert.ok(rig.bot.entity.position.xzDistanceTo(start) < 0.01, `walked to ${rig.bot.entity.position}`)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

for (const scenario of [
  { block: 'ice', dir: new Vec3(1, 0, 0), atRim: false },
  { block: 'packed_ice', dir: new Vec3(-1, 0, 0), atRim: false },
  { block: 'frosted_ice', dir: new Vec3(0, 0, 1), atRim: false },
  { block: 'blue_ice', dir: new Vec3(0, 0, -1), atRim: false },
  { block: 'ice', dir: new Vec3(-1, 0, 0), atRim: true }
]) {
  test(`one ${scenario.block} and an eight-block runway cross five air columns ${scenario.dir}, at rim=${scenario.atRim}`, { timeout: 15000 }, async (t) => {
    const center = (i: number): Vec3 => new Vec3(0.5, 71, 0.5).plus(scenario.dir.scaled(i))
    const world = createFlatWorld('26.1.2', -64, { renderDistance: 2 })
    for (let i = 0; i <= 7; i++) world.setBlock(center(i).offset(0, -1, 0), i === 7 ? scenario.block : 'cobblestone')
    for (const i of [13, 14]) world.setBlock(center(i).offset(0, -1, 0), 'cobblestone')
    const { rig } = createCacheWorld('26.1.2', 71, center(scenario.atRim ? 7.576 : 0), { world })
    rig.bot.entity.onGround = true
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 },
      pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    let tick = 0, contactTick = -1, reboundTick = -1, previousGround = true, contactSpeed = 0, contactOffset = 0, lowest = 71
    const moves: any[] = []
    rig.bot.on('pathGenerated', (path: any) => moves.push(...path.path))
    rig.bot.on('physicsTick', () => {
      tick++
      const e = rig.bot.entity
      lowest = Math.min(lowest, e.position.y)
      const offset = e.position.minus(center(7)).dot(scenario.dir)
      if (e.onGround && !previousGround && offset >= 0.2 && offset < 0.5) {
        contactTick = tick; contactSpeed = e.velocity.dot(scenario.dir); contactOffset = offset
      }
      if (contactTick >= 0 && reboundTick < 0 && !e.onGround) reboundTick = tick
      previousGround = e.onGround
    })
    try {
      await rig.bot.pathfinder.goto(goals.GoalNear.fromVec(center(13), 1))
      assert.ok(moves.some(move => move.metadata?.momentumAirStrafe === true))
      assert.equal(reboundTick, contactTick + 1)
      assert.ok(contactSpeed > 0.28, `speed=${contactSpeed}, offset=${contactOffset}`)
      assert.ok(lowest >= 70.99, `fell to ${lowest}`)
      assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.floored().equals(center(13).floored()), String(rig.bot.entity.position))
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

for (const retarget of [false, true]) {
  test(`ice contact cannot interrupt a rebound through ${retarget ? 'a follow update' : 'goal proximity'}`, { timeout: 10000 }, async (t) => {
    const world = createFlatWorld('26.1.2', -64, { renderDistance: 2 })
    for (let x = 0; x <= 6; x++) world.setBlock(new Vec3(x, 63, 0), x === 6 ? 'ice' : 'stone')
    for (let x = 11; x <= 12; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
    const { rig } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { world })
    rig.bot.entity.onGround = true
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    const target = { position: new Vec3(11.5, 64, 0.5) }
    let touchedIce = false, previousGround = true, contactTick = -1, reboundTick = -1, tick = 0, braked = false
    rig.bot.on('physicsTick', () => {
      tick++
      const entity = rig.bot.entity
      if (!touchedIce && entity.onGround && !previousGround && entity.position.x >= 6.7 && entity.position.x < 7) {
        touchedIce = true; contactTick = tick
        if (retarget) { target.position.x = 12.7; rig.bot.emit('entityMoved', target) }
      }
      if (touchedIce && reboundTick < 0 && !entity.onGround) reboundTick = tick
      if (entity.position.x < 10.7 && rig.bot.pathfinder.currentExecutor?.canInterrupt === false) braked ||= rig.bot.getControlState('sneak')
      previousGround = entity.onGround
    })
    try {
      if (retarget) {
        await rig.bot.pathfinder.goto(goals.GoalFollowEntity.fromEntity(target, 0.8, { neverfinish: false }))
      } else {
        const path = await rig.bot.pathfinder.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, new goals.GoalBlock(11, 64, 0))
        assert.ok(path)
        // The radius includes the intermediate ice contact, but the active
        // verified movement must finish on its opposite landing platform.
        await rig.bot.pathfinder.perform(path, new goals.GoalNear(11.5, 64, 0.5, 5))
      }
      assert.equal(touchedIce, true)
      assert.equal(reboundTick, contactTick + 1)
      assert.equal(braked, false)
      assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.x >= 10.7, `stopped at ${rig.bot.entity.position}`)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

for (const scenario of [
  { version: '1.20.4', block: 'ice', dir: new Vec3(1, 0, 0), startAtRim: false },
  { version: '1.20.4', block: 'packed_ice', dir: new Vec3(-1, 0, 0), startAtRim: false },
  { version: '26.1.2', block: 'frosted_ice', dir: new Vec3(0, 0, 1), startAtRim: false },
  { version: '26.1.2', block: 'blue_ice', dir: new Vec3(0, 0, -1), startAtRim: false },
  { version: '26.1.2', block: 'ice', dir: new Vec3(1, 0, 0), startAtRim: true },
]) {
  test(`one ${scenario.block} at the runway rim rebounds immediately ${scenario.dir}, starts at rim=${scenario.startAtRim}`, { timeout: 16000 }, async (t) => {
    const world = createFlatWorld(scenario.version, -64, { renderDistance: 2 })
    const center = (i: number): Vec3 => new Vec3(0.5, 64, 0.5).plus(scenario.dir.scaled(i))
    for (let i = 0; i <= 6; i++) world.setBlock(center(i).offset(0, -1, 0), i === 6 ? scenario.block : 'stone')
    for (let i = 11; i <= 12; i++) world.setBlock(center(i).offset(0, -1, 0), 'stone')
    const { rig } = createCacheWorld(scenario.version, 64, center(scenario.startAtRim ? 6 : 0), { world })
    rig.bot.entity.onGround = true
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 },
      pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    const routes: any[] = []
    const contacts: { position: Vec3; velocity: Vec3; tick: number }[] = []
    let tick = 0
    let previousGround = true
    let previousPosition = rig.bot.entity.position.clone()
    let reboundTick = -1
    let lowest = 64
    rig.bot.on('pathGenerated', (result: any) => routes.push(...result.path))
    rig.bot.on('physicsTick', () => {
      tick++
      const entity = rig.bot.entity
      lowest = Math.min(lowest, entity.position.y)
      if (entity.onGround && !previousGround && world.getBlock(entity.position.offset(0, -1, 0))?.name === scenario.block) {
        contacts.push({ position: entity.position.clone(), velocity: entity.velocity.clone(), tick })
      }
      if (!entity.onGround && previousGround && world.getBlock(previousPosition.offset(0, -1, 0))?.name === scenario.block) reboundTick = tick
      previousGround = entity.onGround; previousPosition = entity.position.clone()
    })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(center(11).x, 64, center(11).z))
      assert.ok(routes.some(move => move.moveType.constructor.name === 'MomentumJump'), routes.map(move => move.moveType.constructor.name).join(','))
      assert.ok(routes.every(move => move.toPlace.length === 0 && move.toBreak.length === 0))
      const contact = contacts.find(contact => reboundTick === contact.tick + 1)
      assert.ok(contact, `must land and rebound within one tick: ${JSON.stringify({ contacts, reboundTick })}`)
      const rimOffset = contact.position.minus(center(6)).dot(scenario.dir)
      assert.ok(rimOffset >= 0.2 && rimOffset < 0.5, `must touch the last 0.3 blocks of the ice, offset=${rimOffset}`)
      assert.ok(contact.velocity.dot(scenario.dir) > 0.22, `must preserve the run-up hop velocity, got ${contact.velocity.dot(scenario.dir)}`)
      assert.ok(lowest >= 63.99, `fell to ${lowest}`)
      assert.equal(rig.bot.entity.onGround, true)
      assert.ok(rig.bot.entity.position.floored().equals(center(11).floored()))
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

test('ice contact timing and distance come from unmodified native physics', () => {
  const world = createFlatWorld('26.1.2', -64, { renderDistance: 2 })
  for (let x = 0; x <= 14; x++) world.setBlock(new Vec3(x, 63, 0), x >= 13 ? 'blue_ice' : 'stone')
  for (let x = 20; x <= 23; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
  const { rig, cacheWorld } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { world })
  try {
    const plan = predictMomentumJump(rig.bot, cacheWorld, rig.bot.entity.position, rig.bot.entity.velocity,
      new Vec3(14.5, 64, 0.5), new Vec3(20.5, 64, 0.5))
    assert.ok(plan)
    const landingIndex = plan.steps.findIndex((step, i) => i > 0 && step.onGround && !plan.steps[i - 1].onGround &&
      world.getBlock(step.position.offset(0, -1, 0))?.name === 'blue_ice')
    assert.ok(landingIndex > 0)
    const launch = plan.steps[landingIndex + 1]
    assert.ok(launch.jump && !launch.onGround, 'take off on the tick immediately following ice contact')
    const contact = plan.steps[landingIndex]
    assert.ok(Math.abs(contact.velocity.x - 0.2838275621) < 1e-6)
    const end = plan.steps[plan.steps.length - 1]
    assert.ok(end.onGround && end.position.x >= 20)
    assert.ok(Math.abs(end.position.x - contact.position.x - 5.0857006125) < 1e-6)
    assert.ok(rig.bot.entity.position.equals(new Vec3(0.5, 64, 0.5)))
    assert.ok(rig.bot.entity.velocity.equals(new Vec3(0, 0, 0)), 'prediction must never give the real bot artificial speed')
  } finally { cacheWorld.dispose(); rig.stopPassivePhysics() }
})

for (const constraint of ['short runway', 'ceiling', 'excluded runway', 'sprint disabled', 'jump sprint disabled']) {
  test(`momentum jump rejects ${constraint}`, async () => {
    const world = createFlatWorld('26.1.2', -64, { renderDistance: 2 })
    for (let x = constraint === 'short runway' ? 13 : 0; x <= 14; x++) {
      world.setBlock(new Vec3(x, 63, 0), x >= 13 ? 'blue_ice' : 'stone')
      if (constraint === 'ceiling') world.setBlock(new Vec3(x, 66, 0), 'stone')
    }
    for (let x = 20; x <= 23; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
    const { rig } = createCacheWorld('26.1.2', 64, new Vec3(13.5, 64, 0.5), { world })
    rig.bot.loadPlugin(createPlugin({ moveSettings: {
      canDig: false, canPlace: false,
      allowSprinting: constraint !== 'sprint disabled', allowJumpSprint: constraint !== 'jump sprint disabled',
      exclusionAreasStep: constraint === 'excluded runway' ? [block => block.position.x === 8 ? Infinity : 0] : []
    }, pathfinderSettings: { searchTimeoutMs: 1500 } }))
    try {
      const result = await rig.bot.pathfinder.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, new goals.GoalBlock(20, 64, 0))
      assert.equal(result, null)
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

test('live momentum prediction refuses an airborne or wet takeoff', () => {
  const world = createFlatWorld('26.1.2', -64, { renderDistance: 1 })
  for (const x of [0, 1, 7, 8]) world.setBlock(new Vec3(x, 63, 0), 'blue_ice')
  const { rig, cacheWorld } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { world })
  try {
    rig.bot.entity.velocity = new Vec3(0.38, 0.2, 0)
    for (const wet of [false, true]) {
      rig.bot.entity.onGround = wet
      rig.bot.entity.isInWater = wet
      assert.equal(predictMomentumJump(rig.bot, cacheWorld, rig.bot.entity.position, rig.bot.entity.velocity,
        new Vec3(1.5, 64, 0.5), new Vec3(7.5, 64, 0.5), true), undefined)
      assert.equal(rig.bot.entity.velocity.y, 0.2)
    }
  } finally { cacheWorld.dispose(); rig.stopPassivePhysics() }
})

for (const scenario of [
  { version: '1.20.4', block: 'ice', rim: 5, edge: 10, dir: new Vec3(1, 0, 0) },
  { version: '1.20.4', block: 'packed_ice', rim: 5, edge: 10, dir: new Vec3(-1, 0, 0) },
  { version: '26.1.2', block: 'frosted_ice', rim: 5, edge: 10, dir: new Vec3(0, 0, 1) },
  { version: '26.1.2', block: 'blue_ice', rim: 2, edge: 14, dir: new Vec3(0, 0, -1) },
]) {
  test(`stone run-up from rest, hop onto ${scenario.block}, then five air blocks ${scenario.dir}`, { timeout: 14000 }, async (t) => {
    const world = createFlatWorld(scenario.version, -64, { renderDistance: 2 })
    const position = (distance: number, y = 63): Vec3 => new Vec3(scenario.dir.x * distance, y, scenario.dir.z * distance)
    for (let i = 0; i <= scenario.edge; i++) world.setBlock(position(i), i > scenario.edge - scenario.rim ? scenario.block : 'stone')
    for (let i = scenario.edge + 6; i <= scenario.edge + 9; i++) world.setBlock(position(i), 'stone')
    const { rig } = createCacheWorld(scenario.version, 64, new Vec3(0.5, 64, 0.5), { world })
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 },
      pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    const routes: any[] = []
    const landings: { name: string; tick: number }[] = []
    const launches: { name: string; tick: number }[] = []
    let lowest = 64
    let tick = 0
    let previousGround = false
    let previousPosition = rig.bot.entity.position.clone()
    rig.bot.on('pathGenerated', (result: any) => routes.push(...result.path))
    rig.bot.on('physicsTick', () => {
      tick++
      const { position: pos, onGround } = rig.bot.entity
      lowest = Math.min(lowest, pos.y)
      if (onGround && !previousGround) landings.push({ name: world.getBlock(pos.offset(0, -1, 0))?.name ?? '', tick })
      if (!onGround && previousGround) launches.push({ name: world.getBlock(previousPosition.offset(0, -1, 0))?.name ?? '', tick })
      previousPosition = pos.clone(); previousGround = onGround
    })
    try {
      const destination = position(scenario.edge + 7, 64)
      await rig.bot.pathfinder.goto(new goals.GoalBlock(destination.x, destination.y, destination.z))
      assert.ok(routes.some(move => move.moveType.constructor.name === 'MomentumJump' && move.metadata.momentumWarmup !== false))
      assert.ok(routes.every(move => move.toPlace.length === 0 && move.toBreak.length === 0))
      assert.ok(launches.length >= 2, 'must build speed through actual jump inputs from rest')
      assert.ok(landings.some(landing => landing.name === scenario.block && launches.some(launch =>
        launch.name === scenario.block && launch.tick > landing.tick && launch.tick - landing.tick <= 2)),
      `must bounce off ice within two ticks: ${JSON.stringify({ landings, launches })}`)
      assert.ok(lowest >= 63.99, `fell to ${lowest}`)
      assert.equal(rig.bot.entity.onGround, true)
      assert.ok(rig.bot.entity.position.floored().equals(destination))
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

for (const scenario of [
  { version: '1.20.4', block: 'ice' },
  { version: '1.20.4', block: 'packed_ice' },
  { version: '26.1.2', block: 'blue_ice' },
]) {
  test(`two ${scenario.block} blocks preserve incoming speed across a five-air-block gap on ${scenario.version}`, { timeout: 14000 }, async (t) => {
    const world = createFlatWorld(scenario.version, -64, { renderDistance: 1 })
    for (let x = 0; x <= 6; x++) world.setBlock(new Vec3(x, 63, 0), x >= 5 ? scenario.block : 'stone')
    for (let x = 12; x <= 15; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
    const { rig } = createCacheWorld(scenario.version, 64, new Vec3(5.5, 64, 0.5), { world })
    // A valid incoming sprint-jump speed; the controller must preserve it.
    rig.bot.entity.velocity = new Vec3(0.38, -0.0784, 0)
    rig.bot.entity.onGround = true
    const Item = require('prismarine-item')(rig.mcData)
    rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64)
    rig.bot.inventory.slots[9]!.slot = 9
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: true, movementTimeoutMs: 3000 },
      pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30, maxVisitedNodes: 20000 } }))
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    const routes: any[] = []
    let lowest = 64
    rig.bot.on('pathGenerated', (result: any) => routes.push(...result.path))
    rig.bot.on('physicsTick', () => { lowest = Math.min(lowest, rig.bot.entity.position.y) })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(13, 64, 0))
      assert.ok(routes.some(move => move.moveType.constructor.name === 'MomentumJump'), routes.map(m => m.moveType.constructor.name).join(','))
      assert.ok(routes.every(move => move.toPlace.length === 0 && move.toBreak.length === 0))
      assert.ok(lowest >= 63.99, `missed the jump: ${lowest}`)
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(13, 64, 0)))
      assert.equal(rig.bot.entity.onGround, true)
      for (let x = 7; x <= 11; x++) assert.equal(world.getBlock(new Vec3(x, 63, 0))?.name, 'air')
    } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
  })
}

test('a five-block gap is not declared jumpable from a standing stone edge', async () => {
  const world = createFlatWorld('26.1.2', -64, { renderDistance: 1 })
  for (let x = 0; x <= 6; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
  world.setBlock(new Vec3(12, 63, 0), 'stone')
  const { rig } = createCacheWorld('26.1.2', 64, new Vec3(6.5, 64, 0.5), { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false }, pathfinderSettings: { searchTimeoutMs: 300 } }))
  try {
    const path = await rig.bot.pathfinder.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, new goals.GoalBlock(12, 64, 0))
    assert.equal(path, null)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('a long ice runway builds its own speed and jumps five air blocks from rest', { timeout: 16000 }, async (t) => {
  const world = createFlatWorld('26.1.2', -64, { renderDistance: 2 })
  for (let x = 0; x < 20; x++) world.setBlock(new Vec3(x, 63, 0), 'ice')
  for (let x = 25; x <= 29; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
  const { rig } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { world })
  const Item = require('prismarine-item')(rig.mcData)
  rig.bot.inventory.slots[9] = new Item(rig.mcData.itemsByName.cobblestone.id, 64)
  rig.bot.inventory.slots[9]!.slot = 9
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: true, movementTimeoutMs: 3000 },
    pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, routePrefixMs: 30 } }))
  t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
  const routes: any[] = []
  rig.bot.on('pathGenerated', (result: any) => routes.push(...result.path))
  try {
    await rig.bot.pathfinder.goto(new goals.GoalBlock(26, 64, 0))
    assert.ok(routes.some(move => move.moveType.constructor.name === 'MomentumJump'))
    assert.ok(routes.every(move => move.toPlace.length === 0))
    assert.ok(rig.bot.entity.position.floored().equals(new Vec3(26, 64, 0)))
    assert.equal(rig.bot.entity.onGround, true)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})
