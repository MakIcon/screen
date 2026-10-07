import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals } from '../src'
import { createCacheWorld, createFlatWorld } from './setup'
import { loadMcData } from './setup/mc-data'
import { ClimbExecutor } from '../src/mineflayer-specific/movements/climb'
import { COST_INF } from '../src/mineflayer-specific/movements/costs'

function ladderState (version: string, facing: string): number {
  const { mcData, Block } = loadMcData(version)
  const ladder = mcData.blocksByName.ladder
  for (let id = ladder.minStateId; id <= ladder.maxStateId; id++) {
    const props = Block.fromStateId(id, 0).getProperties()
    if (props.facing === facing && !props.waterlogged) return id
  }
  throw new Error(`Missing ladder state ${facing}`)
}

for (const canDig of [false, true]) {
  test(`ladder beside azalea reaches the narrow wall top with digging ${canDig}`, { timeout: 14000 }, async () => {
    const version = '26.1.2'
    const world = createFlatWorld(version, 64, { renderDistance: 1 })
    const state = ladderState(version, 'west')
    for (let y = 64; y <= 69; y++) {
      world.setBlock(new Vec3(1, y, 0), 'cobblestone')
      world.setBlock(new Vec3(0, y, 0), state)
    }
    world.setBlock(new Vec3(-1, 64, 1), 'azalea')
    world.setBlock(new Vec3(-2, 65, 1), 'azalea_leaves')
    const { rig } = createCacheWorld(version, 64, new Vec3(-1.2, 64, -0.2), { world })
    rig.bot.loadPlugin(createPlugin({
      moveSettings: { canDig, canPlace: false, movementTimeoutMs: 3000 },
      pathfinderSettings: { searchTimeoutMs: 2500, tickTimeoutMs: 5, maxVisitedNodes: 20000, routePrefixMs: 30, routePrefixLength: 16 }
    }))
    const routes: Array<Array<{ provider: string, breaks: number, x: number, y: number, z: number }>> = []
    rig.bot.on('pathGenerated', (result: any) => {
      routes.push(result.path.map((m: any) => ({ provider: m.moveType.constructor.name, breaks: m.toBreak.length, x: m.x, y: m.y, z: m.z })))
    })
    const dug: Vec3[] = []
    const dig = rig.bot.dig
    rig.bot.dig = (block: any, ...args: any[]) => { dug.push(block.position.clone()); return dig(block, ...args) }
    try {
      await rig.bot.pathfinder.goto(new goals.GoalBlock(1, 70, 0))
      assert.ok(rig.bot.entity.position.floored().equals(new Vec3(1, 70, 0)), `position=${rig.bot.entity.position}`)
      assert.equal(rig.bot.entity.onGround, true)
      const firstClimb = routes[0].find(m => m.provider === 'Climb')
      assert.ok(firstClimb != null && firstClimb.x === 0 && firstClimb.y === 64 && firstClimb.z === 0, 'Enter the base of the ladder directly')
      assert.ok(routes.flat().every(m => m.breaks === 0 && !/Jump|LadderLanding/.test(m.provider)), 'Do not detour onto azalea or mine through the wall')
      assert.deepEqual(dug, [])
      assert.equal(world.getBlock(new Vec3(-1, 64, 1))?.name, 'azalea')
      assert.equal(world.getBlock(new Vec3(1, 69, 0))?.name, 'cobblestone')
    } finally {
      await rig.bot.pathfinder.destroy()
      rig.stopPassivePhysics()
    }
  })
}

for (const facing of ['west', 'east', 'north', 'south']) {
  for (const gap of ['bottom', 'top', 'none']) {
    test(`ladder ${facing} with ${gap} gap reaches the wall top without digging`, { timeout: 10000 }, async () => {
      const version = '26.1.2'
      const world = createFlatWorld(version, 64, { renderDistance: 1 })
      const wall: Record<string, Vec3> = { west: new Vec3(1, 0, 0), east: new Vec3(-1, 0, 0), north: new Vec3(0, 0, 1), south: new Vec3(0, 0, -1) }
      const dir = wall[facing]
      for (let y = 64; y <= 67; y++) {
        world.setBlock(dir.offset(0, y, 0), 'cobblestone')
        if ((gap !== 'bottom' || y !== 64) && (gap !== 'top' || y !== 67)) world.setBlock(new Vec3(0, y, 0), ladderState(version, facing))
      }
      const { rig } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5), { world })
      rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 3000 }, pathfinderSettings: { searchTimeoutMs: 500 } }))
      for (const [provider] of rig.bot.pathfinder.movements) {
        if (/Parkour|Ladder|Neo|AroundCorner/.test(provider.name)) rig.bot.pathfinder.dropMovement(provider)
      }
      const goal = dir.offset(0, 68, 0)
      try {
        const result = await rig.bot.pathfinder.getPathFromToRaw(rig.bot.entity.position, rig.bot.entity.velocity, new goals.GoalBlock(goal.x, goal.y, goal.z))
        assert.equal(result?.status, 'success')
        await rig.bot.pathfinder.goto(new goals.GoalBlock(goal.x, goal.y, goal.z))
        assert.ok(rig.bot.entity.position.floored().equals(goal), `position=${rig.bot.entity.position}`)
        assert.equal(rig.bot.entity.onGround, true)
      } finally {
        await rig.bot.pathfinder.destroy()
        rig.stopPassivePhysics()
      }
    })
  }
}

test('digging preserves every ladder orientation and its backing wall, but can break ordinary obstacles', async () => {
  const version = '26.1.2'
  const { rig, world } = createCacheWorld(version, 64, new Vec3(0.5, 64, 0.5))
  rig.bot.loadPlugin(createPlugin({ moveSettings: { canDig: true } }))
  const controller = new ClimbExecutor(rig.bot, rig.bot.pathfinder.world, { canDig: true })
  try {
    for (const [i, facing] of ['west', 'east', 'north', 'south'].entries()) {
      const support = new Vec3(i * 4, 65, 4)
      const dirs: Record<string, Vec3> = { west: new Vec3(-1, 0, 0), east: new Vec3(1, 0, 0), north: new Vec3(0, 0, -1), south: new Vec3(0, 0, 1) }
      const ladder = support.plus(dirs[facing])
      world.setBlock(support, 'cobblestone')
      world.setBlock(ladder, ladderState(version, facing))
      assert.equal(controller.breakCost(controller.getBlockInfoRaw(ladder)), COST_INF, facing)
      assert.equal(controller.breakCost(controller.getBlockInfoRaw(support)), COST_INF, facing)
    }
    const ordinary = new Vec3(0, 65, 8)
    world.setBlock(ordinary, 'cobblestone')
    assert.ok(controller.breakCost(controller.getBlockInfoRaw(ordinary)) < COST_INF)
    controller.settings.canDig = false
    assert.equal(controller.breakCost(controller.getBlockInfoRaw(ordinary)), COST_INF)
  } finally {
    await rig.bot.pathfinder.destroy()
    rig.stopPassivePhysics()
  }
})
