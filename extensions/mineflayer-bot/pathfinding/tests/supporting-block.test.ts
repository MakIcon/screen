import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createCacheWorld, createFlatWorld } from './setup'
import { installSupportingBlockPhysics, movementSupport } from '../src/mineflayer-specific/supportingBlockPhysics'

const { PlayerState } = require('prismarine-physics')
const idle = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }

for (const version of ['26.1.2', '1.19.4']) {
  test(`${version} uses its correct friction with only the heel over blue ice`, () => {
    const world = createFlatWorld(version, -64, { renderDistance: 1 })
    world.setBlock(new Vec3(0, 70, 0), 'blue_ice')
    const { rig, cacheWorld } = createCacheWorld(version, 71, new Vec3(1.15, 71, 0.5), { world })
    rig.stopPassivePhysics()
    rig.bot.entity.onGround = true; rig.bot.entity.velocity = new Vec3(0.3, -0.0784, 0)
    try {
      installSupportingBlockPhysics(rig.bot)
      const state = new PlayerState(rig.bot, idle)
      rig.bot.physics.simulatePlayer(state, world)
      const friction = version.startsWith('26.') ? 0.89999 : 0.546
      assert.ok(Math.abs(state.vel.x - 0.3 * friction) < 1e-8)
      assert.equal(world.getBlock(new Vec3(1, 70, 0))?.name, 'air', 'never fabricate a floor under the center')
      if (version.startsWith('26.')) {
        assert.ok(movementSupport(rig.bot, world, state)?.equals(new Vec3(0, 70, 0)))
        state.apply(rig.bot)
        // A new PlayerState each tick must retain the supporting block on the
        // final grounded tick after the heel has passed the ice face.
        const rebound = new PlayerState(rig.bot, { ...idle, forward: true, sprint: true, jump: true })
        rebound.yaw = -Math.PI / 2
        rig.bot.physics.simulatePlayer(rebound, world)
        const expected = (state.vel.x + 0.2 + 0.98 * 0.13 * 0.1627714 / friction ** 3) * friction
        assert.ok(Math.abs(rebound.vel.x - expected) < 1e-6, `rebound speed=${rebound.vel.x}, expected=${expected}`)
        assert.ok(!rebound.onGround && rebound.pos.y > 71)
      }
    } finally { cacheWorld.dispose() }
  })
}

test('a server position correction invalidates the cached supporting ice', () => {
  const world = createFlatWorld('26.1.2', -64, { renderDistance: 1 })
  world.setBlock(new Vec3(0, 70, 0), 'blue_ice'); world.setBlock(new Vec3(3, 70, 0), 'stone')
  const { rig, cacheWorld } = createCacheWorld('26.1.2', 71, new Vec3(1.15, 71, 0.5), { world })
  rig.stopPassivePhysics()
  rig.bot.entity.onGround = true; rig.bot.entity.velocity = new Vec3(0.3, -0.0784, 0)
  try {
    installSupportingBlockPhysics(rig.bot)
    const first = new PlayerState(rig.bot, idle)
    rig.bot.physics.simulatePlayer(first, world).apply(rig.bot)
    rig.bot.entity.position.set(3.5, 71, 0.5)
    const corrected = new PlayerState(rig.bot, idle)
    rig.bot.physics.simulatePlayer(corrected, world)
    assert.ok(Math.abs(corrected.vel.x - first.vel.x * 0.546) < 1e-8)
    assert.ok(movementSupport(rig.bot, world, corrected)?.equals(new Vec3(3, 70, 0)))
  } finally { cacheWorld.dispose() }
})

test('supporting-block friction cannot keep an airborne player above an empty gap', () => {
  const world = createFlatWorld('26.1.2', -64, { renderDistance: 1 })
  world.setBlock(new Vec3(0, 70, 0), 'blue_ice')
  const { rig, cacheWorld } = createCacheWorld('26.1.2', 71, new Vec3(2.5, 71, 0.5), { world })
  rig.stopPassivePhysics(); rig.bot.entity.onGround = false
  try {
    installSupportingBlockPhysics(rig.bot)
    const state = new PlayerState(rig.bot, idle)
    for (let tick = 0; tick < 5; tick++) rig.bot.physics.simulatePlayer(state, world)
    assert.ok(state.pos.y < 70.5 && !state.onGround)
    assert.equal(movementSupport(rig.bot, world, state), undefined)
    assert.equal(world.getBlock(new Vec3(2, 70, 0))?.name, 'air')
  } finally { cacheWorld.dispose() }
})
