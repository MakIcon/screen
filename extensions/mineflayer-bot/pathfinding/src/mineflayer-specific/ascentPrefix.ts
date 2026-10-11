import { Vec3 } from 'vec3'
import { reconstructPath } from '../abstract/algorithms'
import type { Path } from './algs'
import type { GoalBlock, GoalNear, GoalFollowEntity } from './goals'
import type { Move } from './move'
import type { BlockInfo } from './world/cacheWorld'
import type { World } from './world/worldInterface'

/** Keep a supported ascent when a bounded search cannot yet finish the mountain route. */
export function selectAscentPrefix (result: Path, world: World, goal: GoalBlock | GoalNear | GoalFollowEntity, start: Vec3,
  maxLength: number, visits: ReadonlyMap<string, number>): Move[] | undefined {
  const context = result.context
  const target = new Vec3(goal.x, goal.y, goal.z)
  const detourLimit = start.xzDistanceTo(target) + 4
  // The coefficient winners all prefer a lower heuristic. A stair that first
  // goes sideways beneath the player may have none, despite a valid ascent in
  // the frontier. Inspect a bounded number of its cheapest rising candidates.
  const uphillFrontier = Array.from(context.openDataMap.values()).filter(node => node.data != null &&
    node.data.exitPos.y >= start.y + 0.9 && node.data.exitPos.xzDistanceTo(target) <= detourLimit)
    .sort((a, b) => a.g - b.g).slice(0, 32)
  const candidates = [result.path, ...[
    context.bestNode0, context.bestNode1, context.bestNode2, context.bestNode3,
    context.bestNode4, context.bestNode5, context.bestNode6, context.bestNode
  ].map(node => reconstructPath(node)), ...uphillFrontier.map(node => reconstructPath(node))]
  let best: Move[] | undefined
  let bestCost = Infinity
  for (const candidate of candidates) {
    const first = candidate[0]
    if (first == null || first.entryPos.xzDistanceTo(start) > 0.8 || Math.abs(first.entryPos.y - start.y) > 0.2) continue
    const startHeuristic = goal.heuristic({ ...first, x: Math.floor(start.x), y: Math.floor(start.y),
      z: Math.floor(start.z), exitPos: start } as Move)
    const changes = new Map<string, BlockInfo>()
    const getBlock = (pos: Vec3): BlockInfo => changes.get(pos.floored().toString()) ?? world.getBlockInfo(pos)
    let cost = 0
    for (let index = 0; index < Math.min(candidate.length, maxLength); index++) {
      const move = candidate[index]
      if (move.remainingBlocks < 0 || !Number.isFinite(move.cost)) break
      if (move.exitPos.y < start.y - 0.2) break // Keep the elevation already gained.
      cost += move.cost
      for (const interaction of [...move.toBreak, ...move.toPlace]) changes.set(interaction.vec.toString(), interaction.blockInfo)
      if (move.exitPos.y < start.y + 0.9 || (visits.get(move.hash) ?? 0) >= 2) continue
      const directProgress = goal.heuristic(move) < startHeuristic - 0.5
      const uphillDetour = move.exitPos.y <= Math.ceil(goal.y) && move.exitPos.xzDistanceTo(target) <= detourLimit
      if (!directProgress && !uphillDetour) continue
      const feet = getBlock(move.exitPos)
      const head = getBlock(move.exitPos.offset(0, 1, 0))
      const floor = getBlock(move.exitPos.offset(0, -0.01, 0))
      // Interactions were checked by the movement provider, including allowed
      // digging, inventory and exclusions. Check the resulting foothold, not
      // the unmodified mountain or the still-unplaced scaffold in the world.
      if (move.metadata?.waterLanding === true || !feet.walkthrough || !head.walkthrough ||
          !feet.safe || !head.safe || feet.liquid || head.liquid ||
          !floor.physical || !floor.safe || Math.abs(floor.height - move.exitPos.y) > 0.2) continue
      if (cost < bestCost) { best = candidate.slice(0, index + 1); bestCost = cost }
      break
    }
  }
  return best
}
