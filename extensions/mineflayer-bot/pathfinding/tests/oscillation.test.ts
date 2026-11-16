import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld } from './setup'

// Two ledges one step apart, side by side: a route that keeps sending the bot
// from one to the other is motion without progress and must end with an error.
for (const raised of [true, false]) {
  test(`${raised ? 'jumping' : 'level pacing'} between two neighbouring ledges ${raised ? 'is stopped as an oscillation' : 'remains ordinary work'}`, { timeout: 60000 }, async (t) => {
    const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(4.5, 65, 0.5))
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowSprinting: false } }))
    world.setBlock(new Vec3(4, 64, 0), 'stone')
    world.setBlock(new Vec3(5, 64, 0), 'stone')
    if (raised) world.setBlock(new Vec3(5, 65, 0), 'stone')
    t.after(async () => { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() })
    const ledges = [new Vec3(5, raised ? 66 : 65, 0), new Vec3(4, 65, 0)]
    let hops = 0
    let failure: any
    // A caller retrying a goal that alternates with the bot's own position,
    // as a crowded container approach does, starts a new goto for every hop.
    for (; hops < 14 && failure == null; hops++) {
      try { await rig.bot.pathfinder.goto(goals.GoalBlock.fromVec(ledges[hops % 2])) } catch (error) { failure = error }
    }
    if (!raised) { assert.equal(failure, undefined); return }
    assert.equal(failure?.name, 'NavigationError', String(failure))
    assert.equal(failure.reason, 'oscillation')
    assert.ok(hops <= 9, `stopped after ${hops} hops`)
    assert.ok(rig.bot.entity.onGround, 'ends standing on a ledge, not mid-jump')
  })
}
