// SPDX-License-Identifier: GPL-3.0-only
import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Goal, GoalBlock, GoalCompositeAny, GoalFollowEntity, GoalNear } from './goals'
import { Move } from './move'
import { getScaffoldCount } from '../utils'
import { Movement, sumExclusionAreas } from './movements/movement'
import { COST_INF, WALK_ONE_IN_WATER_COST } from './movements/costs'
import type { World } from './world/worldInterface'
import { AStar, type Path } from './algs'
import { MovementHandler } from './movements/movementProvider'
import { IdleMovement } from './movements/movementProviders'
import { PlaceHandler } from './movements/interactionUtils'

// Include the onward approach when choosing an exit, so a cheap shore on the
// opposite side of the player does not win just because it is closer to water.
class ShoreGoal extends GoalBlock {
  constructor (pos: Vec3, private readonly onwardCost: number) { super(pos.x, pos.y, pos.z) }
  override heuristic (node: Move): number { return super.heuristic(node) + this.onwardCost }
}

/** A bank with a verified dry continuation, retained while swimming to it. */
export class ShoreRouteGoal extends GoalCompositeAny<readonly Goal[]> {
  constructor (exit: Goal, public readonly continuation: Path) { super(exit) }
}

/** Find a dry starting point, including a step the bot can attach to a wall. */
export async function findShoreGoal (bot: Bot, world: World, goal: Goal, canceled: () => boolean, rejected: readonly Goal[] = []): Promise<Goal | undefined> {
  if (!(goal instanceof GoalBlock || goal instanceof GoalNear || goal instanceof GoalFollowEntity)) return
  const origin = bot.entity.position.floored()
  if (goal.y <= origin.y + 2 || !world.getBlockInfo(origin).water) return
  let surface = origin.y
  while (surface < origin.y + 16 && world.getBlockInfo(new Vec3(origin.x, surface, origin.z)).water) surface++
  if (surface === origin.y + 16) return
  const settings = bot.pathfinder.defaultMoveSettings
  const canBuild = settings.canPlace && settings.allow1by1towers && getScaffoldCount(bot) > 0
  const faces = Movement.cardinalDirs.concat([new Vec3(0, -1, 0), new Vec3(0, 1, 0)])
  const candidates: Array<{ goal: ShoreGoal, score: number, buildStep: boolean }> = []
  let foundRadius = Infinity
  for (let radius = 1; radius <= Math.min(64, Math.max(16, foundRadius + 12)); radius++) {
    if (canceled()) return
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue
      for (let y = surface - 1; y <= surface + 2; y++) {
        const pos = new Vec3(origin.x + dx, y, origin.z + dz)
        if (rejected.some(exit => exit.isEnd({ x: pos.x, y: pos.y, z: pos.z } as Move))) continue
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
        const onwardCost = goal.heuristic({ x: pos.x, y: pos.y, z: pos.z, exitPos: pos } as Move)
        const score = Math.hypot(pos.x - origin.x, pos.z - origin.z) * WALK_ONE_IN_WATER_COST + onwardCost +
          (buildStep ? settings.placeCost : 0)
        candidates.push({ goal: new ShoreGoal(pos, onwardCost), score, buildStep })
        foundRadius = Math.min(foundRadius, radius)
        break
      }
    }
    // A large loaded ocean must not block physics, packets, or a stop command.
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  if (candidates.length === 0) return
  // An existing landing beside a proposed step is reachable by the same water
  // approach. Swim onto that landing instead of constructing an extra step.
  const exits = candidates.filter(candidate => !candidate.buildStep || !candidates.some(other =>
    !other.buildStep && other.goal.y === candidate.goal.y &&
    Math.abs(other.goal.x - candidate.goal.x) + Math.abs(other.goal.z - candidate.goal.z) === 1))
  exits.sort((a, b) => a.score - b.score)
  // A nearby ledge may have no route up at all. Probe the onward route using
  // the same providers, inventory and virtual placement as the real search.
  // Restrict probes to dry routes so returning to water does not make every
  // isolated island appear to be a useful shore. Unknown/long routes remain
  // candidates; the probe's small budget is not proof of unreachability.
  const deadline = performance.now() + 700
  const regions = new Set<string>()
  const failed = new Set<ShoreGoal>()
  let probes = 0
  for (const candidate of exits) {
    if (failed.has(candidate.goal)) continue
    if (canceled()) return
    if (performance.now() >= deadline || probes >= 12) break
    const exit = candidate.goal
    const region = `${Math.floor(exit.x / 4)}:${exit.y}:${Math.floor(exit.z / 4)}`
    if (regions.has(region)) continue
    regions.add(region); probes++
    const pos = new Vec3(exit.x + 0.5, exit.y, exit.z + 0.5)
    const start = Move.startMove(new IdleMovement(bot, world), pos, new Vec3(0, 0, 0), getScaffoldCount(bot) - (candidate.buildStep ? 1 : 0))
    if (candidate.buildStep) start.toPlace.push(PlaceHandler.fromVec(pos.floored().offset(0, -1, 0), 'solid'))
    // These probes explicitly require a dry continuation. Don't simulate
    // water jumps only to discard them below; that exhausts the probe budget
    // before it can distinguish an isolated ledge from a usable shore.
    const handler = MovementHandler.create(bot, world, bot.pathfinder.getActiveMappings().movements,
      { ...settings, allowWaterDrop: false, allowBucketWaterDrop: false, infiniteLiquidDropdownDistance: false })
    handler.loadGoal(goal)
    const neighbors = handler.getNeighbors.bind(handler)
    handler.getNeighbors = (move, closed) => neighbors(move, closed).filter(next =>
      !world.getBlockInfo(next.exitPos).water && next.metadata?.waterLanding !== true)
    const search = new AStar(start, handler, goal, Math.min(300, deadline - performance.now()), 3)
    search.maxVisitedNodes = 8000
    let result
    do {
      if (canceled()) return
      result = search.compute()
      if (result.status === 'partial') await new Promise<void>(resolve => setImmediate(resolve))
    } while (result.status === 'partial')
    if (result.status === 'success') return new ShoreRouteGoal(candidate.goal, result)
    if (result.status === 'noPath') {
      failed.add(candidate.goal)
      if (!candidate.buildStep) {
        // One exhausted dry search also proves that the other exits on this
        // same isolated patch do not provide an onward route.
        for (const other of exits) {
          if (!other.buildStep && search.closedDataSet.has(`${other.goal.x},${other.goal.y},${other.goal.z}`)) failed.add(other.goal)
        }
      }
    }
  }
  const remaining = exits.filter(candidate => !failed.has(candidate.goal))
  if (remaining.length === 0) return
  return new GoalCompositeAny(...remaining.slice(0, 32).map(candidate => candidate.goal))
}
