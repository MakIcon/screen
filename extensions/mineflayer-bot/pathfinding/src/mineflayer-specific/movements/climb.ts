// SPDX-License-Identifier: GPL-3.0-only
// TypeScript adaptation of Botcraft PathfindingTask.cpp vertical movement and
// AdjustPosSpeed (https://github.com/adepierre/Botcraft). Modified for Mineflayer.
import { Vec3 } from 'vec3'
import { Move } from '../move'
import { Movement } from './movement'
import { MovementProvider } from './movementProvider'
import { MovementExecutor } from './movementExecutor'
import { Goal } from '../goals'
import { COST_INF, LADDER_UP_ONE_COST, LADDER_DOWN_ONE_COST } from './costs'
import { CancelError } from '../exceptions'
import { steerToPosition } from './controls'

const entryDirs = [...Movement.cardinalDirs, ...Movement.diagonalDirs]

/** Climbable cells support the player without a solid floor, as in Botcraft. */
export class Climb extends MovementProvider {
  movementDirs = Movement.cardinalDirs

  provideMovements (start: Move, storage: Move[], goal: Goal, closed: Set<string>): void {
    const feet = this.getBlockInfo(start, 0, 0, 0)
    const below = this.getBlockInfo(start, 0, -1, 0)
    const push = (offset: Vec3, mode: string): void => {
      const dest = start.cachedVec.plus(offset)
      if (closed.has(`${dest.x},${dest.y},${dest.z}`)) return
      const foot = this.getBlockInfoRaw(dest)
      const head = this.getBlockInfoRaw(dest.offset(0, 1, 0))
      if (foot.isInvalid || head.isInvalid || !foot.walkthrough || !head.walkthrough || !foot.safe || !head.safe) return
      const exclusion = this.exclusionStep(foot)
      if (exclusion >= COST_INF) return
      const travel = offset.y > 0 ? LADDER_UP_ONE_COST : offset.y < 0 ? LADDER_DOWN_ONE_COST : this.travelCost(Math.hypot(offset.x, offset.z))
      const move = Move.fromPrevious(travel + exclusion,
        dest.offset(0.5, 0, 0.5), start, this)
      move.metadata = { climbMode: mode }
      storage.push(move)
    }

    if (feet.climbable) {
      // Stay attached throughout ascent. The last ascent is combined with the
      // lateral exit, avoiding a fictitious stop in air above the ladder.
      if (this.getBlockInfo(start, 0, 1, 0).climbable) push(new Vec3(0, 1, 0), 'up')
      // A ladder's thin collision shape supports a final stop on its top. This
      // lets us jump onto a wall one block above the final rung, as in Botcraft.
      else if (feet.block?.name === 'ladder' && feet.dY === 1) push(new Vec3(0, 1, 0), 'crest')
      if (below.climbable || (below.walkthrough && this.getBlockInfo(start, 0, -2, 0).physical)) push(new Vec3(0, -1, 0), 'down')
      for (const dir of this.movementDirs) {
        const support = this.getBlockInfo(start, dir.x, 0, dir.z)
        if (support.solidFull && this.getBlockInfo(start, 0, 2, 0).walkthrough) push(dir.offset(0, 1, 0), 'exit')
        if (this.getBlockInfo(start, dir.x, -1, dir.z).solidFull) push(dir, 'exit')
      }
    } else if (below.climbable && feet.walkthrough) {
      push(new Vec3(0, -1, 0), 'down')
    }

    // Head-height ladders can be grabbed with a normal jump from solid ground.
    if (!feet.climbable && below.physical && this.getBlockInfo(start, 0, 1, 0).climbable) push(new Vec3(0, 1, 0), 'enter-up')

    for (const dir of entryDirs) {
      if (dir.x !== 0 && dir.z !== 0) {
        if (!this.getBlockInfo(start, dir.x, 0, 0).walkthrough || !this.getBlockInfo(start, dir.x, 1, 0).walkthrough ||
          !this.getBlockInfo(start, 0, 0, dir.z).walkthrough || !this.getBlockInfo(start, 0, 1, dir.z).walkthrough) continue
      }
      if (this.getBlockInfo(start, dir.x, 0, dir.z).climbable) push(dir, 'enter')
      else if (this.getBlockInfo(start, dir.x, -1, dir.z).climbable) push(dir.offset(0, -1, 0), 'enter')
      else if (below.physical && this.getBlockInfo(start, 0, 2, 0).walkthrough &&
        this.getBlockInfo(start, dir.x, 0, dir.z).walkthrough && this.getBlockInfo(start, dir.x, 1, dir.z).climbable) push(dir.offset(0, 1, 0), 'enter-up')
    }
  }
}

/** Tick-driven translation of Botcraft's Move and AdjustPosSpeed; never waits for ground while climbing. */
export class ClimbExecutor extends MovementExecutor {
  private leaving = false
  private started = 0
  private aim?: Vec3

  override reset (): void { this.leaving = false; this.started = 0; this.aim = undefined; super.reset() }
  override isAlreadyCompleted (move: Move): boolean { return this.reached(move) }
  align (): boolean { return true }
  performInit (move: Move, currentIndex: number, path: Move[]): void {
    this.started = performance.now()
    const mode = move.metadata?.climbMode
    if (mode === 'enter' || mode === 'enter-up' || mode === 'exit') this.aim = move.exitPos
    else {
      // Find the column exit once per move, without slicing the remaining path
      // and rescanning it on every physics tick of a tall ladder.
      for (let i = currentIndex + 1; i < path.length; i++) {
        if (path[i].exitPos.xzDistanceTo(move.entryPos) > 0.7) { this.aim = path[i].exitPos; break }
      }
    }
  }

  private reached (move: Move): boolean {
    const pos = this.bot.entity.position
    const attached = this.getBlockInfoRaw(pos).climbable
    if (move.metadata?.climbMode === 'crest') return this.bot.entity.onGround && pos.y >= move.exitPos.y - 0.02 && pos.xzDistanceTo(move.exitPos) < 0.24
    if (move.metadata?.climbMode === 'exit') return this.bot.entity.onGround && pos.y >= move.exitPos.y - 0.02 && pos.xzDistanceTo(move.exitPos) < 0.4
    const dy = move.exitPos.y - move.entryPos.y
    const heightReached = dy > 0 ? pos.y >= move.exitPos.y : dy < 0 ? pos.y <= move.exitPos.y + 0.1 : Math.abs(pos.y - move.exitPos.y) < 0.2
    return pos.xzDistanceTo(move.exitPos) < 0.22 && heightReached && (attached || this.bot.entity.onGround)
  }

  // Botcraft projects the error and velocity onto the forward/left axes. This
  // keeps a fixed climbing yaw and corrects drift with strafing, not head spins.
  public adjustPosition (target: Vec3, limit = 0.1): void {
    steerToPosition(this.bot, target, limit)
  }

  private columnAnchor (target: Vec3, mode: unknown): Vec3 {
    let block = this.getBlockInfoRaw(target).block
    if (block?.name !== 'ladder') block = this.getBlockInfoRaw(target.offset(0, -1, 0)).block
    if (block?.name !== 'ladder') return target
    const facing = block.getProperties().facing
    const away: Record<string, Vec3> = { west: new Vec3(-0.16, 0, 0), east: new Vec3(0.16, 0, 0), north: new Vec3(0, 0, -0.16), south: new Vec3(0, 0, 0.16) }
    // Clear the ladder's thin top collision shape before descending, while the
    // feet remain inside its climbable cell. Otherwise the player stands on it.
    const outward = away[String(facing)] ?? new Vec3(0, 0, 0)
    // For a crest, overlap the rung's top instead of stepping off into air.
    return mode === 'crest' ? target.minus(outward) : mode === 'down' ? target.plus(outward) : target
  }

  async performPerTick (move: Move): Promise<boolean> {
    if (this.reached(move)) {
      const next = this.bot.pathfinder.currentPath?.[this.bot.pathfinder.currentIndex + 1]
      // Keep vanilla climbing speed through consecutive rungs. Sneaking at
      // every block kills vertical momentum and makes vines especially slow.
      if (next?.moveType instanceof Climb && next.entryPos.xzDistanceTo(move.exitPos) < 0.3 &&
        next.exitPos.y > move.exitPos.y && this.bot.getControlState('jump')) return true
      this.bot.clearControlStates()
      // Sneak arrests downward velocity when the next climbing step is prepared.
      this.bot.setControlState('sneak', !this.bot.entity.onGround)
      return true
    }
    if (performance.now() - this.started > this.settings.movementTimeoutMs + 1000) throw new CancelError('Climbing failed to reach the next step')
    const pos = this.bot.entity.position
    const mode = move.metadata?.climbMode
    const up = mode === 'up' || mode === 'enter-up' || mode === 'crest' || (mode === 'exit' && move.exitPos.y > move.entryPos.y)
    const target = mode === 'exit' && up && !this.leaving ? move.entryPos : move.exitPos
    if (mode === 'exit' && up && pos.y >= move.exitPos.y - 0.01) this.leaving = true
    const aim = this.aim
    if (aim != null && aim.xzDistanceTo(pos) > 0.3) await this.lookAtPathPos(aim)
    this.adjustPosition(this.leaving ? move.exitPos : this.columnAnchor(target, move.exitPos.y < move.entryPos.y ? 'down' : mode))
    this.bot.setControlState('sprint', false)
    this.bot.setControlState('sneak', false)
    this.bot.setControlState('jump', up && (!this.leaving || pos.y < move.exitPos.y))
    if (pos.y < Math.min(move.entryPos.y, move.exitPos.y) - 1.25) throw new CancelError('Lost the climbable column')
    return false
  }
}
