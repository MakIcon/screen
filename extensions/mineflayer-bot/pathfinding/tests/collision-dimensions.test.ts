import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin } from '../src'
import { createCacheWorld } from './setup'

const { PlayerState } = require('prismarine-physics')

// Vanilla constructs the player's AABB from a float width, promoted to double.
// A decimal 0.3 half-width lets the client enter a wall by ~1.2e-8 blocks.
// 26.1 rejects that step as CLIPPED_INTO_BLOCK and repeatedly teleports back.
for (const origin of [0, -647, 1039]) for (const axis of ['x', 'z'] as const) for (const direction of [-1, 1]) {
  test(`26.1 wall contact uses the server AABB: ${axis}, direction ${direction}, origin ${origin}`, () => {
    const start = new Vec3(origin + 0.5, 64, origin + 0.5)
    const { rig, world } = createCacheWorld('26.1.2', 64, start, { renderDistance: 1 })
    rig.bot.physicsEnabled = false
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false } }))
    const wall = origin + (direction < 0 ? -1 : 1)
    for (let y = 64; y <= 66; y++) {
      const pos = new Vec3(origin, y, origin)
      pos[axis] = wall
      world.setBlock(pos, 'stone')
    }
    const halfWidth = Math.fround(0.6) / 2
    try {
      for (let tick = 0; tick < 20; tick++) {
        rig.bot.entity.velocity[axis] = direction * 0.15
        const controls = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
        rig.bot.physics.simulatePlayer(new PlayerState(rig.bot, controls), world).apply(rig.bot)
        const edge = rig.bot.entity.position[axis] + direction * halfWidth
        assert.ok(direction < 0 ? edge >= origin - 1e-12 : edge <= origin + 1 + 1e-12,
          `server would reject tick ${tick}: position=${rig.bot.entity.position}, edge=${edge}`)
      }
      assert.equal(rig.bot.entity.isCollidedHorizontally, true)
    } finally { rig.stopPassivePhysics() }
  })
}
