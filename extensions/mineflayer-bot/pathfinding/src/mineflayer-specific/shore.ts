// SPDX-License-Identifier: GPL-3.0-only
import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Goal, GoalBlock, GoalCompositeAny, GoalFollowEntity, GoalNear } from './goals'
import type { Move } from './move'
import { getScaffoldCount } from '../utils'
import { Movement, sumExclusionAreas } from './movements/movement'
import { COST_INF, WALK_ONE_BLOCK_COST, WALK_ONE_IN_WATER_COST } from './movements/costs'
import type { World } from './world/worldInterface'

// Include the onward approach when choosing an exit, so a cheap shore on the
// opposite side of the player does not win just because it is closer to water.
class ShoreGoal extends GoalBlock {
  constructor (pos: Vec3, private readonly onwardCost: number) { super(pos.x, pos.y, pos.z) }
  override heuristic (node: Move): number { return super.heuristic(node) + this.onwardCost }
}

/** Find a dry starting point, including a step the bot can attach to a wall. */
export async function findShoreGoal (bot: Bot, world: World, goal: Goal, canceled: () => boolean): Promise<Goal | undefined> {
  if (!(goal instanceof GoalBlock || goal instanceof GoalNear || goal instanceof GoalFollowEntity)) return
  const origin = bot.entity.position.floored()
  if (goal.y <= origin.y + 2 || !world.getBlockInfo(origin).water) return
  let surface = origin.y
  while (surface < origin.y + 16 && world.getBlockInfo(new Vec3(origin.x, surface, origin.z)).water) surface++
  if (surface === origin.y + 16) return
  const settings = bot.pathfinder.defaultMoveSettings
  const canBuild = settings.canPlace && settings.allow1by1towers && getScaffoldCount(bot) > 0
  const faces = Movement.cardinalDirs.concat([new Vec3(0, -1, 0), new Vec3(0, 1, 0)])
  const candidates: Array<{ goal: ShoreGoal, score: number }> = []
  let foundRadius = Infinity
  for (let radius = 1; radius <= Math.min(64, foundRadius + 3); radius++) {
    if (canceled()) return
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue
      for (let y = surface - 1; y <= surface + 2; y++) {
        const pos = new Vec3(origin.x + dx, y, origin.z + dz)
        const feet = world.getBlockInfo(pos)
        if (!feet.walkthrough || !feet.safe || feet.liquid || feet.climbable) continue
        const head = world.getBlockInfo(pos.offset(0, 1, 0))
        const floor = world.getBlockInfo(pos.offset(0, -1, 0))
        if (!head.walkthrough || !head.safe || head.liquid) continue
        if (sumExclusionAreas(settings.exclusionAreasStep, feet) >= COST_INF) continue
        const buildStep = !floor.solidFull
        if (buildStep) {
          if (!canBuild || y !== surface || !floor.water || !floor.replaceable || !floor.safe) continue
          if (settings.placeCost + sumExclusionAreas(settings.exclusionAreasPlace, floor) >= COST_INF) continue
          if (!faces.some(face => { const anchor = world.getBlockInfo(floor.position.plus(face)); return anchor.solidFull && anchor.safe })) continue
        } else if (!floor.safe) continue
        if (!Movement.cardinalDirs.some(dir => {
          const takeoff = pos.plus(dir).offset(0, -1, 0)
          return world.getBlockInfo(takeoff).water && world.getBlockInfo(takeoff.offset(0, 1, 0)).walkthrough &&
            world.getBlockInfo(takeoff.offset(0, 2, 0)).walkthrough
        })) continue
        const onwardCost = Math.hypot(pos.x - goal.x, pos.z - goal.z) * WALK_ONE_BLOCK_COST
        const score = Math.hypot(pos.x - origin.x, pos.z - origin.z) * WALK_ONE_IN_WATER_COST + onwardCost +
          (buildStep ? settings.placeCost : 0)
        candidates.push({ goal: new ShoreGoal(pos, onwardCost), score })
        foundRadius = Math.min(foundRadius, radius)
        break
      }
    }
    // A large loaded ocean must not block physics, packets, or a stop command.
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  if (candidates.length === 0) return
  candidates.sort((a, b) => a.score - b.score)
  return new GoalCompositeAny(...candidates.slice(0, 32).map(candidate => candidate.goal))
}
