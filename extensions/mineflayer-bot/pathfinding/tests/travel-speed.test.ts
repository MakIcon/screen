import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, installSurfaceSwimming } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'
const { PlayerState: LivePlayerState } = require('prismarine-physics')

for (const version of ['1.20.4', '26.1.2']) {
  test(`ocean cruising retains sprint speed across partial routes on ${version}`, { timeout: 14000 }, async (t) => {
    const world = createFlatWorld(version, 56, { renderDistance: 3 })
    for (let x = -4; x <= 40; x++) for (let z = -4; z <= 4; z++) {
      for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), 'water')
    }
    const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 62, 0.5), { world })
    rig.bot.loadPlugin(createPlugin({
      moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 },
      pathfinderSettings: { tickTimeoutMs: 1, routePrefixMs: 1, routePrefixLength: 6 },
    }))
    const dispose = installSurfaceSwimming(rig.bot)
    const speeds: number[] = []
    let interruptions = 0, prefixes = 0
    rig.bot.on('pathGenerated', (path: any) => { if (path.status === 'partial') prefixes++ })
    rig.bot.on('physicsTick', () => {
      const entity = rig.bot.entity
      if (entity.position.x < 5 || entity.position.x > 28) return
      speeds.push(Math.hypot(entity.velocity.x, entity.velocity.z))
      if (!entity.swimming || !rig.bot.getControlState('forward') || !rig.bot.getControlState('sprint') || rig.bot.getControlState('sneak')) interruptions++
    })
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(32, 63, 0))
      const mean = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length
      assert.ok(prefixes >= 2, `partial routes=${prefixes}`)
      assert.ok(speeds.length >= 90, `cruise samples=${speeds.length}`)
      assert.ok(mean > 0.17, `average cruise speed=${mean}, interruptions=${interruptions}`)
      assert.ok(mean < 0.178, `unexpected speed boost=${mean}`)
      assert.equal(interruptions, 0, 'no braking, crouching or lost swim pose between route prefixes')
      assert.equal(rig.bot.getControlState('forward'), false, 'stop at the final goal')
      assert.equal(rig.bot.getControlState('sprint'), false)
    } finally { await rig.bot.pathfinder.destroy(); dispose(); rig.stopPassivePhysics() }
  })

  for (const diagonal of [false, true]) {
    test(`four-block ${diagonal ? 'diagonal' : 'forward'} takeoff survives catch-up physics ticks on ${version}`, { timeout: 5000 }, async () => {
      const world = createFlatWorld(version, -64, { renderDistance: 1 })
      world.setBlock(new Vec3(0, 63, 0), 'stone')
      const landing = new Vec3(diagonal ? 4 : 5, 64, diagonal ? 4 : 0)
      world.setBlock(landing.offset(0, -1, 0), 'stone')
      const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), { world })
      rig.bot.physicsEnabled = false
      rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 2000 } }))
      let done = false, failure: unknown, lowest = 64
      const running = rig.bot.pathfinder.goto(goals.GoalBlock.fromVec(landing)).catch((error: unknown) => { failure = error }).finally(() => { done = true })
      try {
        for (let batch = 0; batch < 100 && !done; batch++) {
          await new Promise<void>(resolve => setImmediate(resolve))
          // Real Mineflayer runs catch-up steps in one event-loop turn. The
          // route runner cannot await camera/init promises between these ticks.
          for (let tick = 0; tick < 4 && !done; tick++) {
            const controls = Object.fromEntries(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak'].map(key => [key, rig.bot.getControlState(key as any)]))
            const state = new LivePlayerState(rig.bot, controls)
            rig.bot.physics.simulatePlayer(state, world).apply(rig.bot)
            lowest = Math.min(lowest, rig.bot.entity.position.y)
            rig.bot.emit('physicsTick')
          }
        }
        assert.equal(failure, undefined)
        assert.equal(done, true, `route did not finish at ${rig.bot.entity.position}`)
        await running
        assert.ok(lowest >= 63.99, `fell to ${lowest}`)
        assert.equal(rig.bot.entity.onGround, true)
        assert.ok(rig.bot.entity.position.floored().equals(landing))
      } finally { await rig.bot.pathfinder.stop(); await running; await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
    })

    test(`sprint parkour crosses ${diagonal ? 'a four-by-four diagonal' : 'four empty blocks'} on ${version}`, { timeout: 8000 }, async () => {
      const world = createFlatWorld(version, -64, { renderDistance: 1 })
      for (let x = -5; x <= 0; x++) for (let z = -5; z <= (diagonal ? 0 : 2); z++) world.setBlock(new Vec3(x, 63, z), 'stone')
      const landing = new Vec3(diagonal ? 4 : 5, 64, diagonal ? 4 : 0)
      world.setBlock(landing.offset(0, -1, 0), 'stone')
      const { rig } = createCacheWorld(version, 64, new Vec3(-2.5, 64, diagonal ? -2.2 : 0.2), { world })
      rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 2000 } }))
      const dispose = installSurfaceSwimming(rig.bot)
      let lowest = 64, jumped = false
      rig.bot.on('physicsTick', () => {
        lowest = Math.min(lowest, rig.bot.entity.position.y)
        if (rig.bot.entity.position.y > 64.2) jumped = true
      })
      try {
        await rig.bot.pathfinder.goto(goals.GoalBlock.fromVec(landing))
        assert.equal(jumped, true)
        assert.ok(lowest >= 63.99, `fell to ${lowest}`)
        assert.equal(rig.bot.entity.onGround, true)
        assert.ok(rig.bot.entity.position.floored().equals(landing), `position=${rig.bot.entity.position}`)
      } finally { await rig.bot.pathfinder.destroy(); dispose(); rig.stopPassivePhysics() }
    })
  }

  test(`swimming preserves server movement attributes for subsequent parkour on ${version}`, { timeout: 8500 }, async (t) => {
    const world = createFlatWorld(version, 56, { renderDistance: 1 })
    for (let x = -10; x < 0; x++) for (let z = -3; z <= 3; z++) for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), 'water')
    for (let x = 0; x <= 2; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
    world.setBlock(new Vec3(7, 63, 0), 'stone')
    const { rig } = createCacheWorld(version, 64, new Vec3(-7.5, 62, 0.5), { world })
    const key = version === '1.20.4' ? 'generic.movement_speed' : 'minecraft:movement_speed'
    const modifier = { uuid: '11111111-1111-4111-8111-111111111111', amount: 0.1, operation: 2 }
    rig.bot.entity.attributes[key] = { value: 0.12, modifiers: [modifier] }
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 2000 } }))
    const dispose = installSurfaceSwimming(rig.bot)
    t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(0, 64, 0))
      assert.equal(rig.bot.entity.attributes[key].value, 0.12)
      assert.ok(rig.bot.entity.attributes[key].modifiers.some((entry: any) => entry.uuid === modifier.uuid && entry.amount === modifier.amount))
      assert.equal(rig.bot.entity.height, 1.8)
      assert.equal(rig.bot.entity.crouching, false)
      await rig.bot.pathfinder.goto(new goals.GoalBlock(7, 64, 0))
      assert.equal(rig.bot.entity.onGround, true)
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(7, 64, 0)))
      assert.equal(rig.bot.entity.attributes[key].value, 0.12)
    } finally { await rig.bot.pathfinder.destroy(); dispose(); rig.stopPassivePhysics() }
  })
}
