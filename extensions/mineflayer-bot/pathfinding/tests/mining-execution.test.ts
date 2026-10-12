import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { BreakHandler } from '../src/mineflayer-specific/movements/interactionUtils'
import { createCacheWorld } from './setup'

test('mining waits for actual reach and an exposed face before starting a block', async () => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5))
  rig.bot.loadPlugin(createPlugin())
  try {
    world.setBlock(new Vec3(8, 65, 0), 'iron_ore')
    const distant = BreakHandler.fromVec(new Vec3(8, 65, 0), 'solid')
    assert.equal((await distant.performInfo(rig.bot)).ticks, Infinity, 'server cannot mine from eight blocks away')
    world.setBlock(new Vec3(3, 65, 0), 'iron_ore')
    world.setBlock(new Vec3(1, 65, 0), 'stone')
    const hidden = BreakHandler.fromVec(new Vec3(3, 65, 0), 'solid')
    assert.equal((await hidden.performInfo(rig.bot)).ticks, Infinity, 'the obstruction must be mined first')
    world.setBlock(new Vec3(1, 65, 0), 'air')
    assert.equal((await hidden.performInfo(rig.bot)).ticks, 0)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})

test('walking through a supported two-high tunnel does not tap sneak at its turns or destination', { timeout: 9000 }, async () => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.69, 64, 0.5))
  for (let x = -1; x <= 14; x++) {
    for (const z of [-1, 1]) for (let y = 64; y <= 66; y++) world.setBlock(new Vec3(x, y, z), 'stone')
    world.setBlock(new Vec3(x, 66, 0), 'stone')
  }
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false, movementTimeoutMs: 3000 } }))
  let sneaks = 0
  const setControl = rig.bot.setControlState
  rig.bot.setControlState = (name: string, value: boolean) => {
    if (name === 'sneak' && value && !rig.bot.getControlState('sneak')) sneaks++
    setControl(name, value)
  }
  try {
    await rig.bot.pathfinder.goto(new goals.GoalBlock(12, 64, 0))
    assert.ok(rig.bot.entity.position.x > 12)
    assert.equal(sneaks, 0, `sneak taps=${sneaks}`)
  } finally { await rig.bot.pathfinder.destroy(); rig.stopPassivePhysics() }
})
