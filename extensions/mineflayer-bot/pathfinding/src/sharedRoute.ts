import { Vec3 } from 'vec3'
import type { Bot } from 'mineflayer'
import type { World } from './mineflayer-specific/world/worldInterface'
import { MovementHandler, type ExecutorMap, type MovementOptions } from './mineflayer-specific/movements'
import type { Move } from './mineflayer-specific/move'
import { AStar, type Path } from './mineflayer-specific/algs'
import { CPathNode } from './abstract/node'
import type { Goal } from './mineflayer-specific/goals'
import type { TrafficAwareBot } from './traffic'

export interface RoutePoint { x: number, y: number, z: number, kind?: string, cost?: number, profile?: string }

export function routeProfile (settings: MovementOptions): string {
  return JSON.stringify(['allowJumpSprint', 'allowParkour', 'walkOnly', 'allowAirStrafe', 'allowSprinting',
    'allowLowCeilingJumps', 'canOpenDoors', 'maxDropDown', 'liquidCost', 'jumpCost', 'velocityKillCost']
    .map(key => settings[key as keyof MovementOptions]))
}

/** Rebuild directed steps with THIS bot's settings and live terrain/traffic. */
export async function replaySharedRoute (bot: Bot, world: World, movements: ExecutorMap,
  settings: MovementOptions, start: Move, goal: Goal, points: RoutePoint[], canceled: () => boolean,
  yieldControl: () => Promise<void>): Promise<Path | undefined> {
  if (points.length < 2 || points.length > 256) return
  if (points[0].profile != null && points[0].profile !== routeProfile(settings)) return
  const handler = MovementHandler.create(bot, world, movements, { ...settings, canDig: false, canPlace: false })
  handler.loadGoal(goal)
  const providers = handler.recognizedMovements
  const context = new AStar(start, handler, goal, 20, 5)
  let node = new CPathNode(0, goal.heuristic(start), start)
  const closed = new Set<string>()
  let cpuMs = 0, sliceStart = performance.now()
  for (const point of points.slice(1)) {
    if (canceled()) return
    const before = performance.now()
    handler.recognizedMovements = point.kind == null ? providers : providers.filter(p => p.constructor.name === point.kind)
    if (handler.recognizedMovements.length === 0) return
    const expected = new Vec3(point.x, point.y, point.z)
    const previous = node.data!
    const move = handler.getNeighbors(previous, closed).find(move => move.exitPos.distanceTo(expected) < 0.05 &&
      move.toBreak.length === 0 && move.toPlace.length === 0 && !move.moveType.requiresParkour)
    if (move == null || (point.cost != null && move.cost > point.cost + 0.001) ||
        ((bot as TrafficAwareBot).launcherTraffic?.cost(previous.exitPos, move.exitPos) ?? 0) > 0) return
    closed.add(previous.hash)
    node = new CPathNode(node.g + move.cost, goal.heuristic(move), move, node)
    cpuMs += performance.now() - before
    if (cpuMs > 20) return
    if (goal.isEnd(move)) {
      handler.recognizedMovements = providers
      const result = context.makeResult('success', node)
      context.visitedChunks = new Set(result.path.map(move => `${move.x >> 4},${move.z >> 4}`))
      return result
    }
    if (performance.now() - sliceStart >= ((bot as TrafficAwareBot).launcherTraffic?.workSliceMs ?? 5)) {
      await yieldControl()
      sliceStart = performance.now()
    }
  }
}
