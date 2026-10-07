import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, movementProviders } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'
import { loadMcData } from './setup/mc-data'

for (const scenario of [
  ...['ladder', 'twisting_vines', 'weeping_vines', 'vine'].map(name => ({ name, version: '1.20.4' })),
  { name: 'ladder', version: '26.1.2' },
  { name: 'twisting_vines', version: '26.1.2' }
]) {
  const { name, version } = scenario
  test(`Botcraft movement climbs six blocks of ${name} on ${version}, exits and descends`, { timeout: 18000 }, async () => {
    const world = createFlatWorld(version, -64, { renderDistance: 1 })
    for (let x = -2; x <= 2; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
    for (let y = 64; y <= 69; y++) world.setBlock(new Vec3(1, y, 0), 'stone')
    world.setBlock(new Vec3(2, 69, 0), 'stone')
    const { mcData, Block } = loadMcData(version)
    let id = mcData.blocksByName[name].minStateId
    if (name === 'ladder' || name === 'vine') {
      for (let state = id; state <= mcData.blocksByName[name].maxStateId; state++) {
        const props = Block.fromStateId(state, 0).getProperties()
        if ((name === 'ladder' ? props.facing === 'west' && !props.waterlogged : props.east && !props.up && !props.north && !props.south && !props.west)) { id = state; break }
      }
    }
    for (let y = 64; y <= 69; y++) {
      world.setBlock(new Vec3(0, y, 0), name.includes('_vines') && y < 69 ? `${name}_plant` : id)
    }
    const { rig } = createCacheWorld(version, 64, new Vec3(-1.5, 64, 0.5), { world })
    rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 } }))
    // Climbing must also work when optional parkour is disabled.
    for (const [provider] of rig.bot.pathfinder.movements) {
      if (/Parkour|Ladder|Neo|AroundCorner/.test(provider.name)) rig.bot.pathfinder.dropMovement(provider)
    }
    const used: string[] = []
    rig.bot.on('pathGenerated', (result: any) => used.push(...result.path.map((m: any) => m.moveType.constructor.name)))
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(2, 70, 0))
      assert.ok(used.includes(movementProviders.Climb.name), used.join(','))
      assert.equal(rig.bot.entity.onGround, true)
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(2, 70, 0)), `position=${rig.bot.entity.position}`)
      await rig.bot.pathfinder.goto(new goals.GoalBlock(-2, 64, 0))
      assert.equal(rig.bot.entity.onGround, true)
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(-2, 64, 0)), `position=${rig.bot.entity.position}`)
    } finally {
      await rig.bot.pathfinder.destroy()
      rig.stopPassivePhysics()
    }
  })
}

test('a goal halfway up twisting vines holds its height and can be stopped', { timeout: 7000 }, async () => {
  const world = createFlatWorld('1.20.4', -64, { renderDistance: 1 })
  world.setBlock(new Vec3(0, 63, 0), 'stone')
  for (let y = 64; y <= 69; y++) world.setBlock(new Vec3(0, y, 0), y === 69 ? 'twisting_vines' : 'twisting_vines_plant')
  const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5), { world })
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 } }))
  try {
    await rig.bot.pathfinder.goto(new goals.GoalBlock(0, 67, 0))
    await rig.bot.waitForTicks(10)
    assert.equal(Math.floor(rig.bot.entity.position.y), 67)
    assert.ok(rig.bot.getControlState('sneak'))
    await rig.bot.pathfinder.stop()
    assert.equal(rig.bot.getControlState('jump'), false)
    assert.equal(rig.bot.getControlState('sneak'), false)
  } finally {
    await rig.bot.pathfinder.destroy()
    rig.stopPassivePhysics()
  }
})
