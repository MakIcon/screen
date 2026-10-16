/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-var-requires, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/restrict-template-expressions, @typescript-eslint/explicit-function-return-type */
import { Vec3 } from 'vec3'
import * as goals from '../goals'
import { Move } from '../move'
import { CancelError, NavigationError } from '../exceptions'
import { BlockInfo } from '../world/cacheWorld'
import { BreakHandler, PlaceHandler } from './interactionUtils'
import { AABB, AABBUtils } from '@nxg-org/mineflayer-util-plugin'
import { CompleteOpts, InitAlignOpts, MovementExecutor } from './movementExecutor'
import { JumpCalculator, ParkourJumpHelper, getUnderlyingBBs, leavingBlockLevel, stateLookAt } from './movementUtils'
import { ControlStateHandler, EPhysicsCtx } from '@nxg-org/mineflayer-physics-util'
import { printBotControls } from '../../utils'
import type { Block, RayType } from '../../types'
import { botSmartMovement, botStrafeMovement, steerToPosition } from './controls'
import { clearBodySegment, supportedWalkSegment, needsWalkSneak } from '../navigationGeometry'
import { getSupportedStartPos } from '../../utils'

const debug = require('debug')
const logIdle = debug('minecraft-pathfinding:movementExecutors:Idle')
const logFwd = debug('minecraft-pathfinding:movementExecutors:NewForward')
const logOldFwd = debug('minecraft-pathfinding:movementExecutors:Forward')
const logJump = debug('minecraft-pathfinding:movementExecutors:ForwardJump')
const logDrop = debug('minecraft-pathfinding:movementExecutors:ForwardDropDown')
const logDown = debug('minecraft-pathfinding:movementExecutors:StraightDown')
const logUp = debug('minecraft-pathfinding:movementExecutors:StraightUp')
const logParkour = debug('minecraft-pathfinding:movementExecutors:Parkour')

export class IdleMovementExecutor extends MovementExecutor {
  provideMovements (start: Move, storage: Move[]): void { }
  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    logIdle('performInit called')
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    return true
  }
}

export class NewForwardExecutor extends MovementExecutor {
  private cornerSneaking = false

  override reset (): void { this.cornerSneaking = false; super.reset() }

  private async correctCorner (move: Move): Promise<boolean> {
    const pos = this.bot.entity.position
    if (!this.bot.entity.onGround || this.doWaterLogic() || this.toBreakLen() > 0 || this.toPlaceLen() > 0 ||
        (clearBodySegment(this.world, pos, move.exitPos, 0.599) && supportedWalkSegment(this.world, pos, move.exitPos))) {
      if (this.cornerSneaking) { this.bot.setControlState('sneak', false); this.cornerSneaking = false }
      return false
    }
    // Predicted completion may switch to the next leg while we still hug the
    // old block's edge. Centre on that supported cell before making the turn.
    const entry = move.entryPos.clone(); entry.y = pos.y
    const supportedEntry = supportedWalkSegment(this.world, entry, entry)
    const center = supportedEntry && clearBodySegment(this.world, pos, entry, 0.599)
      ? entry : getSupportedStartPos(this.world, pos).floored().offset(0.5, 0, 0.5)
    center.y = pos.y
    if (pos.xzDistanceTo(center) < 0.08) throw new CancelError('Forward: waypoint is blocked from its approach')
    if (!clearBodySegment(this.world, pos, center, 0.599)) throw new CancelError('Forward: cannot recenter at a blocked corner')
    await this.lookAtPathPos(center)
    steerToPosition(this.bot, center, 0.1, 0.04)
    this.bot.setControlState('sprint', false)
    this.bot.setControlState('jump', false)
    this.cornerSneaking = needsWalkSneak(this.world, this.bot.entity.position, this.bot.entity.velocity)
    this.bot.setControlState('sneak', this.cornerSneaking)
    return true
  }

  protected isComplete (startMove: Move, endMove?: Move, opts?: CompleteOpts): boolean {
    if (this.toPlaceLen() > 0 || this.toBreakLen() > 0 || this.cI != null) return false
    if (!this.doWaterLogic() && (!this.bot.entity.onGround ||
        !supportedWalkSegment(this.world, this.bot.entity.position, startMove.exitPos))) return false
    return super.isComplete(startMove, endMove, { ticks: 2 })
  }

  private isBridge (move: Move): boolean {
    return !this.doWaterLogic() && move.toPlace.length > 0 && move.toBreak.length === 0 &&
      move.toPlace.every(place => place.type === 'solid' && Math.abs(place.y - (move.entryPos.y - 1)) < 0.01)
  }

  private async placeBridge (move: Move): Promise<void> {
    const revision = this.bot.pathfinder.navigationRevision
    const reject = (place: PlaceHandler, reason: string): never => {
      this.bot.pathfinder.rejectPlacement(place.vec, revision)
      throw new NavigationError('placement', reason)
    }
    for (const place of this.toPlace()) {
      if (!place.needToPerform(this.bot)) continue
      const anchors = [new Vec3(-1, 0, 0), new Vec3(1, 0, 0), new Vec3(0, 0, -1), new Vec3(0, 0, 1)]
        .map(dir => this.world.getBlockInfo(place.vec.plus(dir)))
        .filter(block => block.solidFull && block.safe && Math.abs(block.height - move.entryPos.y) < 0.2)
        .sort((a, b) => this.bot.entity.position.xzDistanceTo(a.position.offset(0.5, 1, 0.5)) -
          this.bot.entity.position.xzDistanceTo(b.position.offset(0.5, 1, 0.5)))
      const anchor = anchors[0]
      if (anchor == null) reject(place, 'Bridge: no confirmed placement support')
      const center = anchor.position.offset(0.5, 1, 0.5)
      const direction = place.vec.minus(anchor.position); direction.y = 0; direction.normalize()
      const rim = center.plus(direction.scaled(0.72))
      const deadline = performance.now() + this.settings.movementTimeoutMs
      let info
      do {
        if (this.aborted || this.bot.pathfinder.abortCalculation) throw new CancelError('Bridge placement canceled')
        if (performance.now() >= deadline) reject(place, 'Bridge: cannot reach the exposed placement face')
        if (!this.bot.entity.onGround || Math.abs(this.bot.entity.position.y - move.entryPos.y) > 0.2) {
          throw new CancelError('Bridge: lost its supported approach')
        }
        this.bot.setControlState('sneak', true)
        this.bot.setControlState('sprint', false)
        this.bot.setControlState('jump', false)
        info = await place.performInfo(this.bot, 0)
        if (info.raycasts.length > 0) break
        await this.lookAtPathPos(rim)
        steerToPosition(this.bot, rim, 0.08, 0.025)
        await this.bot.waitForTicks(1)
      } while (true)
      for (const control of ['forward', 'back', 'left', 'right'] as const) this.bot.setControlState(control, false)
      // Never walk over a speculative bridge floor. Each next click face and
      // the subsequent walking segment require the server-confirmed block.
      await this.performInteraction(place, { info, predictBlock: false })
      if (place.needToPerform(this.bot)) reject(place, 'Bridge placement was not confirmed')
    }
    this.bot.setControlState('sneak', needsWalkSneak(this.world, this.bot.entity.position, this.bot.entity.velocity))
  }

  private async faceForward (): Promise<boolean> {
    // console.log('called faceForward!')
    if (this.doWaterLogic()) return true
    const eyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0)
    const placementVecs = this.toPlace().map((p) => AABB.fromBlock(p.vec))
    const near = placementVecs.some((p) => p.distanceToVec(eyePos) < PlaceHandler.reach + 2)

    // console.log('this.currentMove?.toPlace.length === 0 || !near', this.currentMove?.toPlace.length === 0 || !near)
    // console.log(this.currentMove.toPlace.length, this.toPlace().length, placementVecs.map((p) => p.distanceToVec(eyePos)), near, this.currentMove?.toPlace.length === 0 && !near)
    return this.currentMove?.toPlace.length === 0 || !near
  }

  override async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if (this.isBridge(thisMove) && this.toPlaceLen() > 0) {
      for (const control of ['forward', 'back', 'left', 'right', 'sprint', 'jump'] as const) this.bot.setControlState(control, false)
      this.bot.setControlState('sneak', true)
      return this.bot.entity.onGround && Math.abs(this.bot.entity.position.y - thisMove.entryPos.y) < 0.2
    }
    if (await this.correctCorner(thisMove)) return false
    if (this.doWaterLogic()) {
      this.bot.setControlState('jump', false)
      return await super.align(thisMove, tickCount, goal)
      // this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.entryPos.y)
    }

    const faceForward = await this.faceForward()
    let target
    if (faceForward) {
      target = thisMove.entryPos.floored().translate(0.5, 0, 0.5)
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      target = offset
    }

    return await this.landAlign(thisMove, tickCount, goal)
  }

  async landAlign (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    const faceForward = await this.faceForward()

    const opts: InitAlignOpts = { enterExitInterp: true }

    // need to shift positional data downward if in air.
    if ((!this.bot.entity.onGround || this.bot.getControlState('jump')) && !(this.bot.entity as any).isInWater) {
      opts.customBB = AABBUtils.getEntityAABB(this.bot.entity)
      opts.customBB.expand(0, -1.3, 0) // generous check for alignment if jumping.
    }

    const target = thisMove.entryPos.floored().translate(0.5, 0, 0.5)
    if (faceForward) {
      // A rim retreat may begin facing the void. Turn toward the safe route
      // before alignment starts applying forward movement.
      await this.lookAtPathPos(thisMove.exitPos)
      // await this.postInitAlignToPath(thisMove)
      // void this.lookAt(target);
      this.bot.setControlState('forward', true)
      this.bot.setControlState('back', false)
      this.bot.setControlState('left', false)
      this.bot.setControlState('right', false)
      if (this.toPlaceLen() === 0) this.bot.setControlState('sneak', this.bot.entity.onGround &&
        needsWalkSneak(this.world, this.bot.entity.position, this.bot.entity.velocity))
      if (this.bot.food <= 6) this.bot.setControlState('sprint', false)
      else this.bot.setControlState('sprint', this.settings.allowSprinting)
    } else {
      const offset = this.bot.entity.position.minus(target).plus(this.bot.entity.position)
      // await this.postInitAlignToPath(thisMove, { lookAt: offset })
      void this.lookAt(offset)
      this.bot.setControlState('forward', false)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('back', true)
    }

    // return this.isComplete(thisMove, thisMove, {entry: true})
    // console.log("align", this.bot.entity.position, thisMove.exitPos, this.bot.entity.position.xzDistanceTo(thisMove.exitPos), this.bot.entity.onGround)
    // return this.bot.entity.position.distanceTo(thisMove.entryPos) < 0.2 && this.bot.entity.onGround;

    return this.isInitAligned(thisMove, target, opts)
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    // console.log('ForwardMove', thisMove.exitPos, thisMove.toPlace.length, thisMove.toBreak.length)

    if (this.doWaterLogic()) this.bot.setControlState('jump', false)
    else {
      this.bot.clearControlStates()
      this.bot.setControlState('sneak', this.bot.entity.onGround &&
        needsWalkSneak(this.world, this.bot.entity.position, this.bot.entity.velocity))
    }

    if (this.isBridge(thisMove) && this.toPlaceLen() > 0) await this.placeBridge(thisMove)

    const faceForward = await this.faceForward()

    if (faceForward) {
      await this.postInitAlignToPath(thisMove)
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      // console.log('here!', thisMove.exitPos, this.bot.entity.position, offset)
      await this.postInitAlignToPath(thisMove, { lookAt: offset })
    }
  }

  // TODO: clean this up.
  private canJump (thisMove: Move, currentIndex: number, path: Move[]): boolean {
    if (this.doWaterLogic()) {
      if (this.bot.entity.position.y < thisMove.exitPos.y) {
        return true
      } else {
        return false
      }
    }

    if (!this.settings.allowJumpSprint) return false
    if (!this.bot.entity.onGround) return false
    // The shared low-ceiling controller owns head-hit jumps and its toggle.
    if (!clearBodySegment(this.world, this.bot.entity.position, this.bot.entity.position, 0.599, 2.25)) return false
    if (this.toBreakLen() > 0 || this.toPlaceLen() > 0) return false

    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (xzVel.norm() < 0.14) return false

    // console.log("hey");
    const ctx = EPhysicsCtx.FROM_BOT(this.sim.ctx, this.bot)
    this.sim.simulateUntil(
      (state, ticks) => (ticks > 0 && state.onGround) || state.isCollidedHorizontally,
      () => { },
      (state) => {
        state.control.set('jump', true)
      },
      ctx,
      this.world,
      20
    )

    if (ctx.state.pos.y > thisMove.entryPos.y) return false

    const nextPos = path[++currentIndex]
    let offset = 0.4
    if (currentIndex < path.length) {
      if (nextPos.toPlace.length > 0 || nextPos.toBreak.length > 0) offset = 0.8

      // handle potential collisions here.
      if (nextPos.exitPos.y > thisMove.entryPos.y) {
        offset = 0.8
      }

      if (nextPos.exitPos.y - thisMove.entryPos.y > 2) {
        offset = 0.8
      }
    }

    if (thisMove.entryPos.xzDistanceTo(ctx.state.pos) > thisMove.entryPos.xzDistanceTo(thisMove.exitPos) - offset) {
      return false
    }

    if (ctx.state.isCollidedHorizontally) return false
    if (!ctx.state.onGround) return false
    const landing = ctx.state.pos.offset(0, thisMove.entryPos.y - ctx.state.pos.y, 0)
    // A ground-contact prediction alone also accepts a rim landing. Leave
    // room to brake before the next bend, and keep the complete foot corridor
    // supported during this optional sprint hop. Dedicated parkour owns gaps.
    const brakingRoom = Math.hypot(ctx.state.vel.x, ctx.state.vel.z) * 3 + 0.3
    return landing.xzDistanceTo(thisMove.exitPos) > brakingRoom &&
      supportedWalkSegment(this.world, this.bot.entity.position, landing)
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.cI == null && await this.correctCorner(thisMove)) return false
    if (this.cI instanceof BreakHandler && this.cI.isPerforming && !this.cI.allowExit) {
      // Keep the exposed face under the crosshair until the server confirms
      // it. Route steering must not turn away or walk out of mining reach.
      for (const control of ['forward', 'back', 'left', 'right', 'sprint', 'jump'] as const) this.bot.setControlState(control, false)
      return false
    }
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot))) {
      return false
    } else if (this.cI == null) {
      const test = await this.interactNeeded(5)
      if (test != null) {
        if (test instanceof BreakHandler) {
          for (const control of ['forward', 'back', 'left', 'right', 'sprint', 'jump'] as const) this.bot.setControlState(control, false)
        }
        this.startInteraction(test)
        return false
      }
    }

    // Keep travelling through a reached water waypoint. Steering back toward
    // its centre before the runner advances destroys sprint-swim momentum.
    if (this.doWaterLogic() && this.isComplete(thisMove)) return true

    // if (tickCount > 160) throw new CancelError("ForwardMove: tickCount > 160");

    if (
      (!this.bot.entity.onGround &&
        !this.bot.getControlState('jump') &&
        !this.doWaterLogic() &&
        this.canJump(thisMove, currentIndex, path)) ||
      this.bot.entity.position.y < Math.round(thisMove.entryPos.y) - 1
    ) {
      // console.log(this.bot.entity.position, thisMove.entryPos)
      throw new CancelError(`ForwardMove: not on ground. Target pos: ${thisMove.exitPos}, us: ${this.bot.entity.position}`)
    }

    const faceForward = await this.faceForward()

    if (faceForward) {
      // Release a previous placement's crouch only after the actual feet and
      // momentum fit the walking corridor. Open ground still runs at full speed.
      if (this.toPlaceLen() === 0) this.bot.setControlState('sneak', this.bot.entity.onGround &&
        needsWalkSneak(this.world, this.bot.entity.position, this.bot.entity.velocity))
      const jump = this.canJump(thisMove, currentIndex, path)
      this.bot.setControlState('jump', jump)
      await this.postInitAlignToPath(thisMove)
      return this.isComplete(thisMove)
    } else {
      const offset = this.bot.entity.position.minus(thisMove.exitPos).plus(this.bot.entity.position)
      await this.postInitAlignToPath(thisMove, { lookAt: offset })
      return this.isComplete(thisMove)
    }
  }
}

export class ForwardJumpExecutor extends MovementExecutor {
  jumpInfo!: ReturnType<JumpCalculator['findJumpPoint']>

  private readonly shitter: JumpCalculator = new JumpCalculator(this.sim, this.bot, this.world, this.simCtx)
  private flag = false

  protected isComplete (startMove: Move, endMove?: Move): boolean {
    return super.isComplete(startMove, endMove, { ticks: 0 })
  }

  override async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if (super.doWaterLogic()) {
      this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.entryPos.y)
    }

    return await super.align(thisMove, tickCount, goal)
  }

  align1 (thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    const bb = AABBUtils.getEntityAABBRaw({ position: this.bot.entity.position, width: 0.6, height: 1.8 })

    if (this.flag) {
      void this.lookAt(thisMove.entryPos.floored().offset(0.5, 0, 0.5))
      this.bot.setControlState('forward', true)
      this.bot.setControlState('back', false)
      this.bot.setControlState('sprint', true)

      const bl = this.getBlockInfo(thisMove.entryPos.floored(), 0, -1, 0)
      const bigBBs = bl.getBBs().map((b) => b.extend(0, 10, 0))

      return bigBBs.some((b) => b.contains(bb)) && this.bot.entity.onGround
    } else if (this.bot.entity.onGround) {
      if (thisMove.toPlace.length === 0) {
        this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos)
        if (this.jumpInfo === null) {
          this.flag = true
          return false
        }
      }
      return true
    }
    return false
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.flag = false
    this.bot.clearControlStates()
    if (thisMove.toPlace.length > 0) this.bot.setControlState('sneak', true)

    logJump('performInit')

    if (thisMove.toBreak.length > 0) {
      await this.bot.clearControlStates()
      for (const breakH of this.toBreak()) {
        const start = performance.now()
        await this.performInteraction(breakH)
        logJump(`[${performance.now() - start}ms] break block ${breakH.blockInfo.position} completed.`)
      }
    }

    // Adjacent supported stairs can be placed safely before the takeoff.
    // Planning these as ground moves avoids excavating a whole wall instead.
    for (const place of this.toPlace()) {
      if (place.y >= thisMove.entryPos.y) {
        const center = thisMove.entryPos.floored().offset(0.5, 0, 0.5)
        // After attaching the lower stair at the rim, step back so the upper
        // block does not overlap the player's body.
        while (this.bot.entity.position.xzDistanceTo(center) > 0.07 || Math.hypot(this.bot.entity.velocity.x, this.bot.entity.velocity.z) > 0.015) {
          if (this.aborted || this.bot.pathfinder.abortCalculation) throw new CancelError('Stair placement canceled')
          steerToPosition(this.bot, center, 0.035)
          this.bot.setControlState('sneak', true); this.bot.setControlState('jump', false)
          await this.bot.waitForTicks(1)
        }
        this.bot.setControlState('forward', false); this.bot.setControlState('back', false)
        this.bot.setControlState('left', false); this.bot.setControlState('right', false)
      }
      await this.performInteraction(place)
    }
    this.bot.setControlState('sneak', false)
    this.jumpInfo = this.shitter.findJumpPoint(thisMove.exitPos)

    if (this.jumpInfo === null) {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('jump', true)
      this.bot.setControlState('sprint', true)
    }
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot))) {
      // NOTE: During a jump, we DO NOT want to clear control states or set sneak,
      // otherwise the bot will lose its momentum and fall straight down!
      return false
    }

    if (this.cI == null) {
      const remaining = this.getRemainingPlaces()

      if (remaining.length > 0) {
        let batchExecuted = false

        for (const p of remaining) {
          const info = await p.performInfo(this.bot, 5)

          if (info.ticks === 0) {
            logJump(`Block ${p.vec} is visible NOW. Rapid-placing mid-air.`)
            // Maintain jump momentum, do not clear controls here

            await this.performInteraction(p, { info, predictBlock: true, noAwait: true }) // fire and forget, we just want to trigger the placement and get out of the way
            batchExecuted = true
          } else if (info.ticks < Infinity) {
            if (!batchExecuted) {
              logJump(`Block ${p.vec} visible in ${info.ticks} ticks. Triggering background interaction.`)
              this.startInteraction(p, { info, predictBlock: true })
            }
            break
          } else {
            break
          }
        }

        // Let the movement physics tick process even if we fired a placement packet
      }
    }

    void this.postInitAlignToPath(thisMove)

    if (this.jumpInfo != null) {
      if (tickCount >= this.jumpInfo.backTick) {
        this.bot.setControlState('forward', false)
        this.bot.setControlState('back', true)
      }

      if (tickCount >= this.jumpInfo.sprintTick) {
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('forward', true)
      } else {
        this.bot.setControlState('sprint', false)
        this.bot.setControlState('forward', false)
      }
      if (tickCount >= this.jumpInfo.jumpTick) {
        this.bot.setControlState('jump', this.bot.entity.position.y - thisMove.entryPos.y < 0.8)
      } else {
        this.bot.setControlState('jump', false)
      }
    }

    if (this.bot.entity.position.y - thisMove.exitPos.y < -1.25) throw new CancelError('ForwardJumpMove: too low (1)')

    if (tickCount > (this.jumpInfo?.jumpTick ?? 0) && this.bot.entity.onGround) {
      this.bot.setControlState('jump', false)
      this.bot.setControlState('sprint', true)

      if (this.bot.entity.position.y - thisMove.exitPos.y < -0.25) {
        throw new CancelError(`ForwardJumpMove: too low (2) ${this.bot.entity.position.y} ${thisMove.exitPos.y}`)
      }
    }

    return this.isComplete(thisMove)
  }
}

export class NewForwardJumpExecutor extends ForwardJumpExecutor {
  private swimming = false
  private jumpRequested = false

  override reset (): void { this.swimming = false; this.jumpRequested = false; super.reset() }

  private adjacentStep (move: Move): boolean {
    const delta = move.exitPos.minus(move.entryPos)
    return delta.y > 0 && delta.y <= 1.25 && Math.abs(delta.x) + Math.abs(delta.z) <= 1.01
  }

  protected override isComplete (move: Move, end: Move = move): boolean {
    if (this.world.getBlockInfo(end.exitPos).water) return super.isComplete(move, end)
    const pos = this.bot.entity.position
    // Touching the landing edge in flight is not supported arrival.
    return this.toPlaceLen() === 0 && this.toBreakLen() === 0 && this.cI == null &&
      this.bot.entity.onGround && Math.abs(pos.y - end.exitPos.y) < 0.15 && pos.xzDistanceTo(end.exitPos) < 0.45
  }

  override async align (move: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if (this.doWaterLogic()) { this.swimming = true; return true }
    if (move.toPlace.length > 0 && this.bot.entity.onGround) {
      const dir = move.exitPos.minus(move.entryPos); dir.y = 0; dir.normalize()
      const center = move.entryPos.floored().offset(0.5, 0, 0.5)
      // The side face below a pillar is occluded from its center. Sneak out to
      // the supported rim before clicking that face to start a stair.
      const target = move.toPlace[0].y < move.entryPos.y ? center.plus(dir.scaled(0.72)) : center
      this.bot.entity.yaw = Math.atan2(-dir.x, -dir.z)
      steerToPosition(this.bot, target, 0.035)
      this.bot.setControlState('jump', false); this.bot.setControlState('sprint', false); this.bot.setControlState('sneak', true)
      return this.bot.entity.position.xzDistanceTo(target) < 0.065 && Math.hypot(this.bot.entity.velocity.x, this.bot.entity.velocity.z) < 0.015
    }
    return await super.align(move, tickCount, goal)
  }

  override async performInit (move: Move, index: number, path: Move[]): Promise<void> {
    if (this.swimming) {
      this.bot.clearControlStates()
      this.bot.setControlState('jump', true)
      if (this.toPlaceLen() > 0) {
        // A fast swim prefix can end inside the future step's column. Retreat
        // to its water approach before placing; it cannot be placed through
        // the swimmer's body, even if a predicted later frame is clear.
        const center = move.entryPos.clone()
        await this.lookAtPathPos(center)
        while (this.bot.entity.position.xzDistanceTo(center) > 0.12 || Math.hypot(this.bot.entity.velocity.x, this.bot.entity.velocity.z) > 0.035) {
          if (this.aborted || this.bot.pathfinder.abortCalculation) throw new CancelError('Water step placement canceled')
          steerToPosition(this.bot, center, 0.06)
          this.bot.setControlState('sprint', false)
          await this.bot.waitForTicks(1)
        }
        this.bot.setControlState('forward', false); this.bot.setControlState('back', false)
        this.bot.setControlState('left', false); this.bot.setControlState('right', false)
      }
      for (const interaction of [...this.toBreak(), ...this.toPlace()]) await this.performInteraction(interaction, { predictBlock: false })
      await this.postInitAlignToPath(move, { sprint: false })
    } else if (this.adjacentStep(move) && this.toPlaceLen() === 0) {
      this.bot.clearControlStates()
      while (this.toBreakLen() > 0) {
        const target = await this.interactNeeded(0)
        if (!(target instanceof BreakHandler)) throw new CancelError('No exposed block in the planned ascent')
        await this.performInteraction(target)
      }
      this.jumpRequested = false
    } else await super.performInit(move, index, path)
  }

  override async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean> {
    if (this.swimming || super.doWaterLogic()) {
      if (this.bot.entity.onGround && !this.doWaterLogic()) this.swimming = false
      else {
        this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.exitPos.y)
        await this.postInitAlignToPath(thisMove, { sprint: false })
        return this.isComplete(thisMove)
      }
    }
    if (this.adjacentStep(thisMove) && this.toPlaceLen() === 0 && this.toBreakLen() === 0 && this.cI == null) {
      if (this.isComplete(thisMove)) { this.bot.setControlState('jump', false); return true }
      const pos = this.bot.entity.position
      if (pos.y < thisMove.entryPos.y - 0.5) throw new CancelError('ForwardJump: fell below the takeoff')
      const direction = thisMove.exitPos.minus(thisMove.entryPos); direction.y = 0; direction.normalize()
      const side = Math.abs((pos.x - thisMove.exitPos.x) * direction.z - (pos.z - thisMove.exitPos.z) * direction.x)
      const lateralSpeed = Math.abs(this.bot.entity.velocity.x * direction.z - this.bot.entity.velocity.z * direction.x)
      const approach = thisMove.exitPos.clone()
      if (this.bot.entity.onGround && side > 0.2) {
        // Correct the approach along the face before jumping into its corner.
        if (direction.x !== 0) approach.x = pos.x
        else approach.z = pos.z
      }
      await this.lookAtPathPos(approach)
      steerToPosition(this.bot, approach, this.bot.entity.onGround ? 0.18 : 0.2, 0.045, true)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', false)
      // MovementAscend's approach rule, using actual ground contact rather
      // than a simulated takeoff tick. Releasing jump allows another attempt
      // after a head collision or a server position correction.
      const jump = this.bot.entity.onGround && pos.y < thisMove.exitPos.y - 0.05 &&
        pos.xzDistanceTo(thisMove.exitPos) <= 1.25 && side <= 0.2 && lateralSpeed <= 0.1 && !this.jumpRequested
      this.bot.setControlState('jump', jump)
      this.jumpRequested = jump
      return false
    }
    return await super.performPerTick(thisMove, tickCount, currentIndex, path)
  }
}

export class ForwardDropDownExecutor extends MovementExecutor {
  private guardingFloor = false
  override reset (): void { this.guardingFloor = false; super.reset() }

  private holdExcavation (): void {
    for (const control of ['forward', 'back', 'left', 'right', 'sprint', 'jump'] as const) this.bot.setControlState(control, false)
    this.bot.setControlState('sneak', this.guardingFloor)
  }
  protected override isComplete (move: Move, end: Move = move): boolean {
    if (this.world.getBlockInfo(end.exitPos).water) return super.isComplete(move, end)
    const pos = this.bot.entity.position
    return this.toPlaceLen() === 0 && this.toBreakLen() === 0 && this.cI == null &&
      this.bot.entity.onGround && Math.abs(pos.y - end.exitPos.y) < 0.15 && pos.xzDistanceTo(end.exitPos) < 0.45
  }
  private waterLanded (move: Move): boolean {
    const pos = this.bot.entity.position
    return (this.bot.entity as any).isInWater === true && pos.y >= move.exitPos.y - 0.5 &&
      this.bot.entity.velocity.y >= -0.1 && pos.xzDistanceTo(move.exitPos) < 0.4
  }

  override isAlreadyCompleted (move: Move, tickCount: number, goal: goals.Goal): boolean {
    return move.metadata?.waterLanding === true ? this.waterLanded(move) : super.isAlreadyCompleted(move, tickCount, goal)
  }
  private handleSneak (thisMove: Move) {
    if (super.doWaterLogic()) {
      this.bot.setControlState('sneak', this.bot.entity.position.y > thisMove.exitPos.y && !this.bot.entity.onGround)
    }
  }

  override async align (thisMove: Move, tickCount?: number, goal?: goals.Goal, lookTarget?: Vec3): Promise<boolean> {
    if (thisMove.metadata?.waterLanding === true) return true
    if (this.getRemainingBreaks().some(block => block.y < thisMove.entryPos.y)) {
      this.guardingFloor = true
      // A descending excavation must start from the old support's centre.
      // Ordinary ledge alignment moves toward the exit and can put the feet
      // on the very floor block that is about to be removed.
      const center = thisMove.entryPos.floored().offset(0.5, 0, 0.5)
      steerToPosition(this.bot, center, 0.06, 0.03)
      this.bot.setControlState('sneak', true)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('jump', false)
      return this.bot.entity.onGround && this.bot.entity.position.xzDistanceTo(center) < 0.1 &&
        Math.hypot(this.bot.entity.velocity.x, this.bot.entity.velocity.z) < 0.02
    }
    const pos = this.bot.entity.position
    const direction = thisMove.exitPos.minus(thisMove.entryPos)
    const length = Math.hypot(direction.x, direction.z)
    if (!this.doWaterLogic() && this.bot.entity.onGround && this.toBreakLen() === 0 && this.toPlaceLen() === 0 &&
        length > 0 && pos.y <= thisMove.entryPos.y + 0.15 && pos.y > thisMove.exitPos.y + 0.15) {
      const dx = pos.x - thisMove.entryPos.x; const dz = pos.z - thisMove.entryPos.z
      const along = (dx * direction.x + dz * direction.z) / length
      const side = Math.abs(dx * direction.z - dz * direction.x) / length
      if (along >= -0.3 && along <= length + 0.3 && side <= 0.18) {
        // At a crouched rim the feet can be over the next cell while their
        // hitbox still rests on the old step. Generic alignment requires the
        // floor under that next cell and never finishes. A supported point on
        // this verified descent is already aligned, including an intermediate
        // stair reached while planning. Let the descent executor release sneak.
        for (const control of ['forward', 'back', 'left', 'right', 'sprint', 'jump'] as const) this.bot.setControlState(control, false)
        this.bot.setControlState('sneak', needsWalkSneak(this.world, pos, this.bot.entity.velocity))
        await this.lookAtPathPos(thisMove.exitPos)
        return true
      }
    }
    this.handleSneak(thisMove)
    return await super.align(thisMove, tickCount, goal, lookTarget)
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    if (thisMove.metadata?.waterLanding === true) return
    if (this.getRemainingBreaks().length > 0) {
      this.holdExcavation()
      return
    }
    await this.postInitAlignToPath(thisMove)
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (thisMove.metadata?.waterLanding === true && this.toBreakLen() === 0 && this.toPlaceLen() === 0) {
      if (this.waterLanded(thisMove)) return true
      if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) > 0.4) await this.lookAtPathPos(thisMove.exitPos)
      steerToPosition(this.bot, thisMove.exitPos, 0.08)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', false)
      this.bot.setControlState('jump', this.doWaterLogic())
      return false
    }
    if (this.cI instanceof BreakHandler && this.cI.isPerforming && !this.cI.allowExit) {
      this.holdExcavation()
      return false
    }
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot, 0))) {
      // If we are locked by an interaction, freeze so we don't accidentally fall early.
      this.holdExcavation()
      return false
    }

    if (this.cI == null) {
      // 1. Process Sequential Breaks (Must wait for server digging)
      const remainingBreaks = this.getRemainingBreaks()
      if (remainingBreaks.length > 0) {
        // A downward step lists its landing floor first, but that floor is
        // hidden behind the wall at feet height. Clear an exposed planned
        // block first, retaining the same step and support throughout.
        const breakTarget = await this.interactNeeded(0)
        if (!(breakTarget instanceof BreakHandler)) throw new CancelError('No exposed block in the planned descending step')
        logDrop(`[ForwardDrop] Block ${breakTarget.vec} needs breaking. Triggering background interaction.`)
        this.holdExcavation()
        this.startInteraction(breakTarget)
        return false
      }

      // 2. Process Concurrent Rapid-Placements
      const remainingPlaces = this.getRemainingPlaces()
      if (remainingPlaces.length > 0) {
        let batchExecuted = false

        for (const p of remainingPlaces) {
          const info = await p.performInfo(this.bot, 5)

          if (info.ticks === 0) {
            logDrop(`[ForwardDrop] Block ${p.vec} is visible NOW. Rapid-placing.`)
            this.bot.clearControlStates()

            await this.performInteraction(p, { info, predictBlock: true, noAwait: true }) // fire and forget, we just want to trigger the placement and get out of the way
            batchExecuted = true
          } else if (info.ticks < Infinity) {
            if (!batchExecuted) {
              logDrop(`[ForwardDrop] Block ${p.vec} visible in ${info.ticks} ticks. Triggering background interaction.`)
              this.startInteraction(p, { info, predictBlock: true })
            }
            break
          } else {
            break
          }
        }

        if (batchExecuted) return false
      }
    }

    if (!this.doWaterLogic()) {
      // Walk fully off the old support before centring on the lower landing.
      // Predictive walking/braking can reverse at the lip before the fall.
      await this.lookAtPathPos(thisMove.exitPos)
      steerToPosition(this.bot, thisMove.exitPos, 0.18, 0.045, true)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', false)
      this.bot.setControlState('jump', false)
    } else await this.postInitAlignToPath(thisMove)

    this.handleSneak(thisMove)
    return this.isComplete(thisMove)
  }
}

export class StraightDownExecutor extends MovementExecutor {
  align (thisMove: Move): boolean {
    this.bot.clearControlStates()
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    if (this.bot.entity.position.xzDistanceTo(thisMove.exitPos) < 0.2 && xzVel.norm() < 0.1) {
      return true
    }

    void this.lookAt(thisMove.exitPos)

    // provided that velocity is not pointing towards goal OR distance to goal is greater than 0.5
    // adjust as quickly as possible to goal.
    if (xzVel.normalize().dot(this.bot.util.getViewDir()) <= 0 || this.bot.entity.position.distanceTo(thisMove.exitPos) > 0.5) {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', true)
      this.bot.setControlState('sneak', false)

      // if velocity is already heading towards the goal, slow down.
    } else {
      this.bot.setControlState('forward', true)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('sneak', true)
    }
    return false
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    // Initialization logic cleared; breaks are dynamically handled in performPerTick
  }

  async performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): Promise<boolean | number> {
    if (this.cI != null && !(await this.cI.allowExternalInfluence(this.bot, 0))) {
      this.bot.clearControlStates()
      return false
    }

    if (this.cI == null) {
      const remainingBreaks = this.getRemainingBreaks()
      if (remainingBreaks.length > 0) {
        const breakTarget = remainingBreaks[0]
        logDown(`[StraightDown] Block ${breakTarget.vec} needs breaking. Triggering background interaction.`)
        this.bot.clearControlStates()
        this.startInteraction(breakTarget)
        return false
      }
    }

    if ((this.bot.entity as any).isInWater as boolean) {
      return tickCount > 0 && this.bot.entity.position.y <= thisMove.exitPos.y
    }

    if (this.bot.entity.position.y < thisMove.exitPos.y) throw new CancelError('StraightDown: too low')

    return tickCount > 0 && this.bot.entity.onGround && this.bot.entity.position.y === thisMove.exitPos.y
  }
}

export class StraightUpExecutor extends MovementExecutor {
  private static readonly CENTER_EPS = 0.2
  private static readonly STOP_DIST = 0.08
  private static readonly STOP_SPEED = 0.03

  private _getEntryCenter (thisMove: Move): Vec3 {
    return thisMove.entryPos.floored().offset(0.5, 0, 0.5)
  }

  private _getExitCenter (thisMove: Move): Vec3 {
    return thisMove.exitPos.floored().offset(0.5, 0, 0.5)
  }

  private _getHorizontalOffsetTo (center: Vec3): Vec3 {
    const pos = this.bot.entity.position
    return new Vec3(center.x - pos.x, 0, center.z - pos.z)
  }

  private _getHorizontalVelocity (): Vec3 {
    const vel = this.bot.entity.velocity
    return new Vec3(vel.x, 0, vel.z)
  }

  private _isHorizontallyCentered (thisMove: Move): boolean {
    return this.bot.entity.position.xzDistanceTo(this._getEntryCenter(thisMove)) <= StraightUpExecutor.CENTER_EPS
  }

  private _isHorizontalMotionSmall (): boolean {
    return this._getHorizontalVelocity().norm() <= StraightUpExecutor.STOP_SPEED
  }

  private _facePoint (point: Vec3): void {
    const pos = this.bot.entity.position
    const dx = point.x - pos.x
    const dz = point.z - pos.z
    this.bot.entity.yaw = Math.atan2(-dx, -dz)
  }

  /**
   * Predict a short-horizon intercept point so that when we are already carrying
   * horizontal momentum, we correct for where we are going, not just where we are.
   *
   * Using a target slightly "behind" current travel helps botSmartMovement decide
   * to hold back when we would otherwise overshoot from forward momentum.
   */
  private _getAirborneCorrectionTarget (thisMove: Move): Vec3 {
    const center = this._getEntryCenter(thisMove)
    const pos = this.bot.entity.position
    const vel = this._getHorizontalVelocity()
    const speed = vel.norm()
    const dist = pos.xzDistanceTo(center)

    if (speed < 1e-4) {
      return center
    }

    // Conservative prediction horizon:
    // - stronger correction when moving faster
    // - less prediction when already very close to center
    let horizon = 1.0
    if (speed > 0.17) horizon = 2.0
    if (dist < 0.3) horizon = 0.0
    if (speed < 0.02) horizon = 0.0

    return center.minus(vel.scaled(horizon))
  }

  /**
   * Ground centering:
   * - face entry center
   * - use smart forward/back + strict strafing
   * - sprint only when farther away
   */
  private _applyGroundCentering (thisMove: Move): boolean {
    const center = this._getEntryCenter(thisMove)
    const offset = this._getHorizontalOffsetTo(center)
    const dist = offset.norm()
    const speed = this._getHorizontalVelocity().norm()

    this.bot.clearControlStates()
    this._facePoint(center)

    if (dist <= StraightUpExecutor.CENTER_EPS && speed <= StraightUpExecutor.STOP_SPEED) {
      return true
    }

    const shouldSprint = dist > 0.35
    botSmartMovement(this.bot, center, shouldSprint)
    botStrafeMovement(this.bot, center, true)

    return false
  }

  /**
   * Airborne / rising / water correction:
   * - keep jump held
   * - steer with velocity-aware targeting
   * - allow smartMovement to choose forward vs back
   * - allow strict strafe to counter lateral drift
   */
  private _applyVerticalAscentControls (thisMove: Move): boolean {
    const center = this._getEntryCenter(thisMove)
    const correctionTarget = this._getAirborneCorrectionTarget(thisMove)
    const distToCenter = this._getHorizontalOffsetTo(center).norm()
    const speed = this._getHorizontalVelocity().norm()

    this.bot.clearControlStates()
    this.bot.setControlState('jump', true)

    // If we are basically centered and no longer sliding, stop injecting horizontal input.
    if (distToCenter <= StraightUpExecutor.CENTER_EPS && speed <= StraightUpExecutor.STOP_SPEED) {
      return true
    }

    this._facePoint(correctionTarget)

    // Let the existing utility decide whether this should be forward, back, or neither.
    botSmartMovement(this.bot, correctionTarget, false)
    botStrafeMovement(this.bot, correctionTarget, true)

    return false
  }

  isAlreadyCompleted (thisMove: Move, tickCount: number, goal: goals.Goal): boolean {
    return this.bot.entity.position.y >= thisMove.exitPos.y
  }

  override async align (thisMove: Move): Promise<boolean> {
    const inWater = (this.bot.entity as any).isInWater as boolean

    if (!this.bot.entity.onGround || inWater) {
      return this._applyVerticalAscentControls(thisMove)
    }

    return this._applyGroundCentering(thisMove)
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this.bot.clearControlStates()

    for (const breakH of this.toBreak()) {
      await this.lookAt(breakH.vec.offset(0.5, 0.5, 0.5))
      await this.performInteraction(breakH)
    }

    if (thisMove.toPlace.length > 1) {
      throw new CancelError('StraightUp: toPlace.length > 1')
    }

    const place = thisMove.toPlace[0]
    if (place != null) {
      await this.lookAt(place.vec.offset(0.5, 0.5, 0.5))
      this.bot.setControlState('jump', true)
      await this.performInteraction(place)
    }
  }

  performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    if (this.bot.entity.position.y < thisMove.entryPos.y) {
      throw new CancelError('StraightUp: too low')
    }

    const inWater = (this.bot.entity as any).isInWater as boolean

    if (!this.bot.entity.onGround || inWater) {
      this._applyVerticalAscentControls(thisMove)
    } else {
      this._applyGroundCentering(thisMove)
    }

    // Preserve jump until we have reached required height.
    this.bot.setControlState('jump', this.bot.entity.position.y < thisMove.exitPos.y)

    if (inWater) {
      return tickCount > 0 && this.bot.entity.position.y >= thisMove.exitPos.y
    }

    return tickCount > 0 &&
      this.bot.entity.onGround &&
      this.bot.entity.position.y >= thisMove.exitPos.y
  }
}

export class ParkourForwardExecutor extends MovementExecutor {
  private readonly shitterTwo: ParkourJumpHelper = new ParkourJumpHelper(this.bot, this.world)

  private executing = false
  private hasLeftGround = false
  private lockedYaw: number | null = null
  private backingUp = false
  private backupSettling = false
  private backupAttempted = false
  private backupTarget: Vec3 | null = null
  private _lookAtInFlight: Promise<void> | null = null
  private _pendingLookTarget: Vec3 | null = null
  private tickControls?: () => void
  private tickFailure?: Error

  override get canInterrupt (): boolean { return !this.executing || (this.hasLeftGround && this.bot.entity.onGround) }

  protected static readonly APPROACH_YAW_EPS: number = 0.16 // ~9.2 deg — generous for cardinal jumps

  override reset (): void {
    this.stopTickControls()
    this.tickFailure = undefined
    this.executing = false
    this.hasLeftGround = false
    this.lockedYaw = null
    this.backingUp = false
    this.backupSettling = false
    this.backupAttempted = false
    this.backupTarget = null
    this._pendingLookTarget = null
    super.reset()
  }

  private stopTickControls (): void {
    if (this.tickControls != null) this.bot.off('physicsTick', this.tickControls)
    this.tickControls = undefined
  }

  private startTickControls (): void {
    if (this.tickControls != null) return
    const move = this.currentMove
    const listener = (): void => {
      if (this.currentMove !== move || this.aborted || this.bot.pathfinder.abortCalculation) {
        this.stopTickControls()
        return
      }
      try {
        const target = this._getTargetEyeVec(this._getTargetBlock(move))
        if (this.backingUp) {
          const state = this._advanceBackup(move)
          if (state === 'backing') return
          if (state === 'failed') throw new CancelError('ParkourExecutor: backup failed')
          this._tryApproachWhenAligned(target)
        }
        if (!this.executing) {
          if (this.bot.entity.onGround && this._isYawAlignedForApproach(target) &&
              this.shitterTwo.simForwardMove(this._getTargetBlock(move), target)) this._startJumpExecution(target)
          return
        }
        if (!this.bot.entity.onGround && this.bot.entity.position.y > move.entryPos.y + 0.05) this.hasLeftGround = true
        if (this.hasLeftGround && this.bot.entity.onGround) {
          this.bot.setControlState('jump', false)
          this.bot.setControlState('sprint', false)
          this.bot.setControlState('sneak', true)
          steerToPosition(this.bot, move.exitPos, 0.08)
          return
        }
        this._lockCurrentYaw(this._desiredYawTo(target))
        this._applySmartControls(target, !this.hasLeftGround && move.exitPos.y >= move.entryPos.y)
      } catch (error) {
        this.tickFailure = error instanceof Error ? error : new Error(String(error))
        this.stopTickControls()
      }
    }
    // Mineflayer may emit several catch-up ticks before an awaited runner step
    // resumes. Commit the takeoff and airborne inputs at every physics boundary.
    this.tickControls = listener
    this.bot.prependListener('physicsTick', listener)
  }

  protected isComplete (startMove: Move, endMove?: Move, opts: CompleteOpts = {}): boolean {
    // Predicting contact can finish the jump one tick before its real landing.
    // Starting the next Neo's crouch/sideways alignment in that airborne tick
    // cancels the remaining flight and can send a narrow landing into a fall.
    const target = endMove ?? startMove
    if (!this.bot.entity.onGround && !((this.bot.entity as any).isInWater && this.world.getBlockInfo(target.exitPos).water)) return false
    return super.isComplete(startMove, endMove, { ...opts, ticks: 0 })
  }

  private _debugLog (...args: any[]): void {
    logParkour(...args)
  }

  private _lockCurrentYaw (targetYaw: number): void {
    this.lockedYaw = targetYaw
  }

  private _clearLockedYaw (): void {
    this.lockedYaw = null
  }

  private _applyLockedYaw (): void {
    if (this.lockedYaw != null) {
      this.bot.entity.yaw = this.lockedYaw
    }
  }

  private _applySmartControls (target: Vec3, jump: boolean): void {
    this._applyLockedYaw()
    botSmartMovement(this.bot, target, this.settings.allowSprinting)
    botStrafeMovement(this.bot, target, true)
    this.bot.setControlState('jump', jump)
    this.bot.setControlState('sneak', false)
  }

  private async _queueLookAtSync (target: Vec3): Promise<void> {
    this._pendingLookTarget = target.offset(0, this.bot.entity.position.y + 1.62 - target.y, 0)

    if (this._lookAtInFlight != null) {
      return await this._lookAtInFlight
    }

    this._lookAtInFlight = (async () => {
      try {
        while (this._pendingLookTarget != null) {
          const nextTarget = this._pendingLookTarget
          this._pendingLookTarget = null
          await this.lookAt(nextTarget, true)
        }
      } finally {
        this._lookAtInFlight = null
      }
    })()

    return await this._lookAtInFlight
  }

  private _clearBackupState (): void {
    this.backingUp = false
    this.backupSettling = false
    this.backupTarget = null
  }

  private _getTargetBlock (thisMove: Move): Vec3 {
    return thisMove.exitPos.offset(0, -1, 0)
  }

  private _getTargetEyeVec (target: Vec3): Vec3 {
    return this.shitterTwo.findGoalVertex(AABB.fromBlockPos(target))
  }

  private _getUnderlyingBbs (thisMove: Move): AABB[] {
    const bbs = getUnderlyingBBs(this.world, this.bot.entity.position, 0.6)
    if (bbs.length === 0) {
      bbs.push(AABB.fromBlockPos(thisMove.entryPos.offset(0, -1, 0)))
    }
    return bbs
  }

  private _getBackupTarget (thisMove: Move): Vec3 | null {
    const target = this._getTargetBlock(thisMove)
    const targetEyeVec = this._getTargetEyeVec(target)

    const pos = thisMove.entryPos
    // if (!this.bot.entity.onGround) {
    //   pos.translate(0, (pos.floored().y - pos.y), 0)
    //   pos.y = Math.round(pos.y)
    // }

    const backupTarget = this.shitterTwo.findViableBackupVertex(target, targetEyeVec, pos)
    this._debugLog(
      'backup target check:',
      'pos', pos,
      'target:', target,
      'eye:', targetEyeVec,
      'result:', backupTarget,
      'bbs', getUnderlyingBBs(this.bot.pathfinder.world, pos, 0.6)
    )
    return backupTarget
  }

  private _shouldSneakDuringBackup (thisMove: Move, target: Vec3): boolean {
    const entryBB = AABB.fromBlockPos(thisMove.entryPos)
    const botPos = this.bot.entity.position

    if (botPos.xzDistanceTo(target) < 0.1) return true

    const controls = ControlStateHandler.COPY_BOT(this.bot).set('sneak', false).set('jump', false)
    const ectx = this.simForward({ ticks: 2, controls })
    // console.log(ectx.state.pos, ectx.state.control, ectx.state.pos.y, this.bot.entity.position.y, !ectx.state.onGround)
    return ectx.state.pos.y < this.bot.entity.position.y && !ectx.state.onGround
  }

  private _applyBackupControls (thisMove: Move, target: Vec3): void {
    this._lockCurrentYaw(this._desiredYawTo(target))
    void this._queueLookAtSync(target)
    this._applyLockedYaw()
    steerToPosition(this.bot, target, 0.025)
    this.bot.setControlState('jump', false)
    this.bot.setControlState('sprint', false)
    this.bot.setControlState('sneak', true)
  }

  private _startBackup (thisMove: Move): boolean {
    this.stopTickControls()
    this.backupTarget ??= this._getBackupTarget(thisMove)
    if (this.backupTarget == null) {
      this._debugLog('backup start failed: no backup target')
      return false
    }

    this.backingUp = true
    this.backupAttempted = true
    this._debugLog('backup start:', this.backupTarget)
    this._applyBackupControls(thisMove, this.backupTarget)
    this.startTickControls()
    return true
  }

  private _advanceBackup (thisMove: Move): 'backing' | 'recheck' | 'jump' | 'failed' {
    this.backupTarget ??= this._getBackupTarget(thisMove)
    if (this.backupTarget == null) {
      // this._debugLog('backup advance failed: no backup target')
      return 'failed'
    }

    const dist = this.bot.entity.position.xzDistanceTo(this.backupTarget)
    const xzVel = this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0)
    this._debugLog(
      'backup advance:',
      'target:', this.backupTarget,
      'pos:', this.bot.entity.position,
      'dist:', dist,
      'xzVel:', xzVel,
      'settling:', this.backupSettling
    )

    if (dist > 0.08) {
      this.backupSettling = false
      this._applyBackupControls(thisMove, this.backupTarget)
      return 'backing'
    }

    this.backupSettling = true
    this.bot.clearControlStates()
    this.bot.setControlState('sneak', this._shouldSneakDuringBackup(thisMove, this.backupTarget))

    if (xzVel.norm() > 0.003) {
      this._debugLog(
        'backup advance: waiting for velocity to settle',
        'target:', this.backupTarget,
        'xzVel:', xzVel.norm()
      )
      return 'backing'
    }

    this._clearBackupState()
    this._clearLockedYaw()
    this.bot.clearControlStates()
    this.bot.setControlState('sneak', true)
    this._debugLog('backup recheck: reached target, retrying jump state')
    return 'recheck'
  }

  private _getJumpState (thisMove: Move): {
    target: Vec3
    targetEyeVec: Vec3
    canDirectJump: boolean
    canJumpFromEdge: boolean
    fallOffEdge: boolean
  } {
    const target = this._getTargetBlock(thisMove)
    const targetEyeVec = this._getTargetEyeVec(target)
    const bbs = this._getUnderlyingBbs(thisMove)

    const fallOffEdge = thisMove.entryPos.y > thisMove.exitPos.y && this.shitterTwo.simFallOffEdge(target)
    if (fallOffEdge) return { target, targetEyeVec, canDirectJump: false, canJumpFromEdge: false, fallOffEdge: true }

    return {
      target,
      targetEyeVec,
      canDirectJump: this.shitterTwo.simForwardMove(target, targetEyeVec),
      canJumpFromEdge: this.shitterTwo.simJumpFromEdge(bbs, target),
      fallOffEdge: false
    }
  }

  private _debugJumpState (
    label: string,
    jumpState: {
      target: Vec3
      targetEyeVec: Vec3
      canDirectJump: boolean
      canJumpFromEdge: boolean
      fallOffEdge: boolean
    }
  ): void {
    (this as any)._lastTime ??= 0

    this._debugLog(label, performance.now() - (this as any)._lastTime)
    this._debugLog(
      'can we make it?',
      'jump right now:', jumpState.canDirectJump,
      'jump at ledge:', jumpState.canJumpFromEdge,
      'fallOffEdge:', jumpState.fallOffEdge
    )
    this._debugLog(
      'current bot info:',
      this.bot.entity.yaw,
      this.bot.entity.position,
      this.bot.entity.velocity
    )
    this._debugLog(
      'yaw info:',
      this._yawDeltaAbs(this._desiredYawTo(jumpState.targetEyeVec)) * (180 / Math.PI),
      jumpState.targetEyeVec
    );

    (this as any)._lastTime = performance.now()
  }

  private _clearApproachControls (): void {
    this.bot.setControlState('forward', false)
    this.bot.setControlState('back', false)
    this.bot.setControlState('left', false)
    this.bot.setControlState('right', false)
    this.bot.setControlState('jump', false)
    this.bot.setControlState('sprint', false)
    this.bot.setControlState('sneak', this.bot.entity.onGround)
  }

  private _startJumpExecution (target: Vec3): void {
    this.lockedYaw = this._desiredYawTo(target)
    this.executing = true
    this.hasLeftGround = false
    this._applySmartControls(target, true)
    this.startTickControls()
  }

  protected _desiredYawTo (target: Vec3): number {
    const dx = target.x - this.bot.entity.position.x
    const dz = target.z - this.bot.entity.position.z
    return Math.atan2(-dx, -dz)
  }

  protected _yawDeltaAbs (targetYaw: number): number {
    let delta = targetYaw - this.bot.entity.yaw
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    return Math.abs(delta)
  }

  protected _isYawAlignedForApproach (target: Vec3): boolean {
    const wantedYaw = this._desiredYawTo(target)
    return this._yawDeltaAbs(wantedYaw) <= ParkourForwardExecutor.APPROACH_YAW_EPS
  }

  private _tryApproachWhenAligned (targetEyeVec: Vec3): boolean {
    void this._queueLookAtSync(targetEyeVec)

    if (!this._isYawAlignedForApproach(targetEyeVec)) {
      this._clearApproachControls()
      return false
    }

    this._applySmartControls(targetEyeVec, false)
    this.startTickControls()
    return true
  }

  async align (thisMove: Move, tickCount: number, goal: goals.Goal): Promise<boolean> {
    if (this.tickFailure != null) throw this.tickFailure
    if (this.executing) return true
    if (!this.bot.entity.onGround && !this.tooLowCheck(thisMove)) {
      // A runway hop or the first contact tick must settle before deciding
      // that the takeoff needs a retreat. Airborne backup predictions are wrong.
      this.bot.setControlState('jump', false)
      return false
    }
    this.executing = false
    this.hasLeftGround = false
    this._clearLockedYaw()

    while (true) {
      if (this.tooLowCheck(thisMove)) {
        const botY = this.getTooLowCheckY()
        throw new CancelError(`y level: too low! ${botY}, ${thisMove.entryPos.y} ${thisMove.exitPos.y}`)
      }

      if (this.backingUp) {
        const backupState = this._advanceBackup(thisMove)
        if (backupState === 'backing') return false
        if (backupState === 'jump') continue
        if (backupState === 'failed') {
          this.bot.clearControlStates()
          throw new CancelError('ParkourExecutor: backup failed')
        }
      }

      const jumpState = this._getJumpState(thisMove)
      const { targetEyeVec, canDirectJump, canJumpFromEdge, fallOffEdge } = jumpState

      void this._queueLookAtSync(targetEyeVec)

      this._debugJumpState('align', jumpState)

      if (fallOffEdge) {
        this.executing = true
        this._lockCurrentYaw(this._desiredYawTo(targetEyeVec))
        this._applySmartControls(targetEyeVec, false)
        return true
      }

      if (canDirectJump) {
        if (!this._isYawAlignedForApproach(targetEyeVec)) {
          this._clearApproachControls()
          return false
        }

        this._clearBackupState()
        this._startJumpExecution(targetEyeVec)
        return true
      }

      if (canJumpFromEdge) {
        this._clearBackupState()
        this._lockCurrentYaw(this._desiredYawTo(targetEyeVec))
        this._tryApproachWhenAligned(targetEyeVec)
        return false
      }

      if (!this.bot.entity.onGround && this.tooLowCheck(thisMove)) {
        const botY = this.getTooLowCheckY()
        throw new CancelError(`Too low y level! bot: ${botY} | target: ${thisMove.entryPos.y}`)
      }

      if (this.bot.entity.onGround) {
        this.bot.clearControlStates()
      }

      if (this.backupAttempted) {
        this._clearBackupState()
        this.bot.clearControlStates()
        this.bot.setControlState('sneak', true)
        if (this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0).norm() < 0.003) {
          throw new CancelError('ParkourExecutor: will not make this jump after backing up!')
        }
      }

      if (this._startBackup(thisMove)) return false

      this.bot.clearControlStates()
      throw new CancelError('ParkourExecutor: will not make this jump!')
    }
  }

  async performInit (thisMove: Move, currentIndex: number, path: Move[]): Promise<void> {
    this._clearLockedYaw()
    this._clearBackupState()
    this.backupAttempted = false

    const target = this._getTargetBlock(thisMove)
    const targetEyeVec = this._getTargetEyeVec(target)
    void this._queueLookAtSync(targetEyeVec)
  }

  performPerTick (thisMove: Move, tickCount: number, currentIndex: number, path: Move[]): boolean | Promise<boolean> {
    if (this.tickFailure != null) throw this.tickFailure
    const target = this._getTargetBlock(thisMove)
    const targetEyeVec = this._getTargetEyeVec(target)

    if (this.tooLowCheck(thisMove)) throw new CancelError('ParkourExecutor: missed the landing')

    if (this.executing) {
      if (!this.bot.entity.onGround && this.bot.entity.position.y > thisMove.entryPos.y + 0.05) this.hasLeftGround = true
      if (this.hasLeftGround && this.bot.entity.onGround) {
        this.bot.setControlState('jump', false)
        this.bot.setControlState('sprint', false)
        this.bot.setControlState('sneak', true)
        steerToPosition(this.bot, thisMove.exitPos, 0.08)
        return this.isComplete(thisMove)
      }
      // printBotControls(this.bot, logParkour)
      this._lockCurrentYaw(this._desiredYawTo(targetEyeVec))
      this._applySmartControls(targetEyeVec, !this.hasLeftGround && thisMove.exitPos.y >= thisMove.entryPos.y)
      return this.isComplete(thisMove)
    }

    const jumpState = this._getJumpState(thisMove)
    const { canDirectJump, canJumpFromEdge, fallOffEdge } = jumpState

    this._debugJumpState('tick', jumpState)

    void this._queueLookAtSync(targetEyeVec)

    if (canDirectJump || fallOffEdge) {
      if (!this._isYawAlignedForApproach(targetEyeVec)) {
        this._clearApproachControls()
        return false
      }
      this._clearBackupState()
      if (canDirectJump) this._startJumpExecution(targetEyeVec)
      else this._applySmartControls(targetEyeVec, false)

      return false
    }

    if (canJumpFromEdge) {
      this._clearBackupState()
      this._clearLockedYaw()
      this._tryApproachWhenAligned(targetEyeVec)
      return false
    }

    if (!this.bot.entity.onGround) {
      this._clearLockedYaw()
      throw new CancelError('ParkourExecutor: missed jump window')
    }

    if (this.backupAttempted) {
      this._clearBackupState()
      this.bot.clearControlStates()
      throw new CancelError('ParkourExecutor: will not make this jump after backing up!')
    }

    if (this._startBackup(thisMove)) return false

    this._clearLockedYaw()
    this.bot.clearControlStates()
    throw new CancelError('ParkourExecutor: will not make this jump!')
  }
}

/**
 * Executor for diagonal (intercardinal) parkour jumps.
 *
 * Inherits all physics-simulation and jump-execution logic from
 * ParkourForwardExecutor — the only meaningful difference is a tighter
 * yaw-alignment threshold.
 *
 * Why tighter?  In a cardinal jump the hitbox approaches the gap head-on, so
 * a few degrees of misalignment just costs a little forward momentum.  In a
 * diagonal jump the corners of the hitbox are only 0.3 blocks away from the
 * two side-blocks (the "inner corners" of the L-shape).  A misalignment of
 * more than ~6° can push the hitbox into those corners and abort the jump
 * with a horizontal collision, so we require closer alignment before we
 * commit to the sprint-jump.
 */
export class ParkourDiagonalExecutor extends ParkourForwardExecutor {
  /** ~6.9 deg — tighter than the cardinal 9.2 deg to avoid corner clipping. */
  protected static override readonly APPROACH_YAW_EPS = 0.12

  /**
   * Resolve the yaw-alignment check using this class's tighter epsilon.
   * TypeScript static dispatch means the parent's _isYawAlignedForApproach
   * already reads `ParkourForwardExecutor.APPROACH_YAW_EPS`, so we
   * override the instance method to point at the subclass constant instead.
   */
  protected override _isYawAlignedForApproach (target: Vec3): boolean {
    const wantedYaw = this._desiredYawTo(target)
    return this._yawDeltaAbs(wantedYaw) <= ParkourDiagonalExecutor.APPROACH_YAW_EPS
  }
}
