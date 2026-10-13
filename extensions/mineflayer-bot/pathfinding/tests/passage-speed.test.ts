import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'

for (const version of ['1.20.4', '26.1.2']) {
  for (const rise of [0, 1, -1]) {
    test(`narrow ${rise === 0 ? 'tunnel' : rise > 0 ? 'upstairs' : 'downstairs'} maintains travel speed on ${version}`, { timeout: 15000 }, async (t) => {
      const world = createFlatWorld(version, 48, { renderDistance: 1 })
      const height = (x: number) => 64 + rise * Math.max(0, Math.min(10, x - 1))
      for (let x = -2; x <= 14; x++) {
        for (let y = 48; y < height(x); y++) world.setBlock(new Vec3(x, y, 0), 'stone')
        for (const z of [-1, 1]) for (let y = height(x); y <= height(x) + 3; y++) world.setBlock(new Vec3(x, y, z), 'stone')
        world.setBlock(new Vec3(x, Math.max(height(x - 1), height(x)) + (rise === 0 ? 2 : 3), 0), 'stone')
      }
      const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), { world })
      rig.bot.loadPlugin(createPlugin({ moveSettings: {
        canDig: false, canPlace: false, allowJumpSprint: false, maxDropDown: 1, movementTimeoutMs: 3000
      } }))
      let ticks = 0, crouched = 0, backward = 0
      rig.bot.on('physicsTick', () => {
        if (rig.bot.entity.position.x < 1 || rig.bot.entity.position.x > 11) return
        ticks++
        if (rig.bot.getControlState('sneak')) crouched++
        if (rig.bot.getControlState('back')) backward++
      })
      t.signal.addEventListener('abort', () => { void rig.bot.pathfinder.stop() }, { once: true })
      try {
        await rig.bot.pathfinder.goto(new goals.GoalBlock(12, height(12), 0))
        t.diagnostic(`travel ticks=${ticks}, crouched=${crouched}, backward=${backward}`)
        assert.ok(rig.bot.entity.onGround && rig.bot.entity.position.x > 12)
        assert.equal(crouched, 0, 'walls and solid stairs do not require crouching')
        assert.ok(ticks <= (rise > 0 ? 125 : rise < 0 ? 80 : 45), `travel took ${ticks} ticks`)
      } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
    })
  }
}
