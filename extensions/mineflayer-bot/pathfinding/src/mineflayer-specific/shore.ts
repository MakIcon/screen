// SPDX-License-Identifier: GPL-3.0-only
import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Goal, GoalBlock, GoalCompositeAny, GoalFollowEntity, GoalNear } from './goals'
import type { World } from './world/worldInterface'

/** Give a high goal a dry starting point instead of repeatedly aiming up from open water. */
export async function findShoreGoal (bot: Bot, world: World, goal: Goal, canceled: () => boolean): Promise<Goal | undefined> {
  if (!(goal instanceof GoalBlock || goal instanceof GoalNear || goal instanceof GoalFollowEntity)) return
  const origin = bot.entity.position.floored()
  if (goal.y <= origin.y + 2 || !world.getBlockInfo(origin).water) return
  let surface = origin.y
  while (surface < origin.y + 16 && world.getBlockInfo(new Vec3(origin.x, surface, origin.z)).water) surface++
  if (surface === origin.y + 16) return
  const candidates: GoalBlock[] = []
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
        if (!head.walkthrough || !head.safe || head.liquid || !floor.solidFull || !floor.safe) continue
        if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([x, z]) => world.getBlockInfo(pos.offset(x, -1, z)).water)) continue
        candidates.push(GoalBlock.fromVec(pos))
        foundRadius = Math.min(foundRadius, radius)
        break
      }
    }
    // A large loaded ocean must not block physics, packets, or a stop command.
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  if (candidates.length === 0) return
  candidates.sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z))
  return new GoalCompositeAny(...candidates.slice(0, 32))
}
