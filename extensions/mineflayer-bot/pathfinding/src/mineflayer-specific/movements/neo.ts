import { Vec3 } from 'vec3'
import { Move } from '../move'
import type { Goal } from '../goals'
import { Movement } from './movement'
import { MovementProvider } from './movementProvider'
import { MovementExecutor } from './movementExecutor'
import { CancelError } from '../exceptions'
import { COST_INF, JUMP_ONE_BLOCK_COST } from './costs'
import { posToYawPitchFromEye } from '../../utils'

const { PlayerState } = require('prismarine-physics')
const log = require('debug')('minecraft-pathfinding:neo')
type Steering = { yaw: number; forward: boolean; back: boolean; left: boolean; right: boolean }
type FlightStep = Steering & { jump: boolean; sneak: boolean; position: Vec3 }
type Flight = { state: any; steps: FlightStep[]; score: number; jumped: boolean }

function angularDifference (a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b))
}

// Rotate the input axes along with the camera, preserving the exact world-space
// acceleration. Braking uses back/strafe instead of turning away from the landing.
function steering (headingYaw: number, lookYaw: number, jumping = false): Steering {
  const quarter = jumping ? 0 : Math.round(angularDifference(lookYaw, headingYaw) / (Math.PI / 2))
  const axis = (quarter + 4) % 4
  return { yaw: headingYaw + quarter * Math.PI / 2, forward: axis === 0, right: axis === 1, back: axis === 2, left: axis === 3 }
}

/** Geometry from Rewrite's examples/neos, with both escape sides checked independently. */
export class NeoProvider extends MovementProvider {
  movementDirs = Movement.cardinalDirs

  provideMovements(node: Move, storage: Move[], _goal: Goal, closed: Set<string>): void {
    if (!this.getBlockInfo(node, 0, -1, 0).solidFull) return
    if (![0, 1, 2].every((y) => this.getBlockInfo(node, 0, y, 0).walkthrough)) return
    for (const dir of this.movementDirs) {
      for (let distance = 2; distance <= (this.settings.allowSprinting ? 3 : 2); distance++) {
        const feet = this.getBlockInfo(node, dir.x * distance, 0, dir.z * distance)
        if (closed.has(`${feet.position.x},${feet.position.y},${feet.position.z}`)) continue
        if (
          !this.getBlockInfo(feet.position, 0, -1, 0).solidFull ||
          ![0, 1, 2].every((y) => this.getBlockInfo(feet.position, 0, y, 0).walkthrough)
        )
          continue
        if (
          !Array.from({ length: distance - 1 }, (_, i) => i + 1).every(
            (step) =>
              this.getBlockInfo(node, dir.x * step, 0, dir.z * step).solidFull &&
              this.getBlockInfo(node, dir.x * step, 1, dir.z * step).solidFull
          )
        )
          continue
        const sides = [-1, 1].filter((sign) => {
          const side = new Vec3(-dir.z * sign, 0, dir.x * sign)
          for (let step = 0; step <= distance; step++) {
            for (let y = 0; y <= 2; y++) {
              if (
                !this.getBlockInfo(node, dir.x * step + side.x, y, dir.z * step + side.z)
                  .walkthrough
              )
                return false
            }
          }
          return true
        })
        if (sides.length === 0) continue
        const cost =
          JUMP_ONE_BLOCK_COST +
          this.travelCost(distance) +
          this.settings.jumpCost +
          this.exclusionStep(feet)
        if (cost >= COST_INF) continue
        const move = Move.fromPrevious(cost, feet.position.offset(0.5, 0, 0.5), node, this)
        move.metadata = { neoSides: sides, neoDir: dir, neoOrigin: node.cachedVec }
        storage.push(move)
      }
    }
  }
}

/** Plan a short flight with the same prismarine-physics engine that moves Mineflayer. */
export class NeoExecutor extends MovementExecutor {
  private flight: FlightStep[] = []
  private step = 0
  private flightListener?: () => void
  private complete = false
  private failure?: Error

  override reset(): void {
    if (this.flightListener != null) this.bot.off('physicsTick', this.flightListener)
    this.flightListener = undefined
    this.complete = false
    this.failure = undefined
    this.flight = []
    this.step = 0
    super.reset()
  }

  override isAlreadyCompleted(move: Move): boolean {
    return this.landed(move)
  }

  private landed(move: Move): boolean {
    const pos = this.bot.entity.position
    return (
      this.bot.entity.onGround &&
      Math.abs(pos.y - move.exitPos.y) < 0.05 &&
      pos.floored().equals(move.exitPos.floored())
    )
  }

  private direction(move: Move): Vec3 {
    if (move.metadata?.neoDir != null) return move.metadata.neoDir
    const dir = move.exitPos.minus(move.entryPos)
    dir.y = 0
    return dir.normalize()
  }

  override align(move: Move): boolean {
    const dir = this.direction(move)
    const sign = move.metadata?.neoSides[0] ?? 1
    const side = new Vec3(-dir.z * sign, 0, dir.x * sign)
    const origin: Vec3 = move.metadata?.neoOrigin ?? move.entryPos.floored()
    const target = origin.offset(0.5, 0, 0.5).plus(side.scaled(0.73)).minus(dir.scaled(0.2))
    const delta = target.minus(this.bot.entity.position)
    const velocity = this.bot.entity.velocity
    this.bot.clearControlStates()
    this.bot.setControlState('sneak', true)
    if (
      Math.hypot(delta.x, delta.z) < 0.045 &&
      Math.hypot(velocity.x, velocity.z) < 0.005 &&
      this.bot.entity.onGround
    )
      return true
    // Counter momentum instead of waiting for velocity to decay to almost zero.
    const aim = delta.minus(new Vec3(velocity.x, 0, velocity.z).scaled(2))
    const view = posToYawPitchFromEye(this.bot.entity.position, 1.62, move.exitPos.offset(0, 0.15, 0))
    const input = steering(Math.atan2(-aim.x, -aim.z), view.yaw)
    this.bot.entity.yaw = input.yaw
    this.bot.entity.pitch = view.pitch
    for (const control of ['forward', 'back', 'left', 'right'] as const) this.bot.setControlState(control, input[control] && Math.hypot(aim.x, aim.z) > 0.015)
    if (this.bot.entity.position.y < move.entryPos.y - 0.2)
      throw new CancelError('Neo: takeoff support was lost')
    return false
  }

  async performInit(move: Move): Promise<void> {
    this.bot.clearControlStates()
    this.bot.setControlState('sneak', true)
    this.flight = await this.planFlight(move)
    if (this.aborted || this.bot.pathfinder.abortCalculation) return
    if (this.flight.length === 0)
      throw new CancelError('Neo: no collision-free flight to the landing block')
    this.step = 0
    this.applyStep(this.flight[this.step++], move)
    // Mineflayer can emit several catch-up ticks in one event-loop turn.
    // Flight controls must advance synchronously on every one of them.
    const flightListener = (): void => {
      if (
        this.flightListener !== flightListener ||
        this.aborted ||
        this.bot.pathfinder.abortCalculation
      )
        return
      try {
        this.advanceFlight(move)
      } catch (error) {
        this.failure = error as Error
        log('flight failed: %s at %O', this.failure.message, this.bot.entity.position)
      }
      if (this.complete || this.failure != null) {
        this.bot.off('physicsTick', flightListener)
        this.flightListener = undefined
        this.bot.clearControlStates()
      }
    }
    this.flightListener = flightListener
    this.bot.on('physicsTick', flightListener)
  }

  private applyStep(step: FlightStep, move: Move): void {
    this.bot.clearControlStates()
    this.bot.entity.yaw = step.yaw
    this.bot.entity.pitch = posToYawPitchFromEye(this.bot.entity.position, 1.62, move.exitPos.offset(0, 0.15, 0)).pitch
    this.bot.setControlState('sprint', this.settings.allowSprinting)
    for (const control of ['forward', 'back', 'left', 'right'] as const) this.bot.setControlState(control, step[control])
    this.bot.setControlState('jump', step.jump)
    this.bot.setControlState('sneak', step.sneak)
  }

  performPerTick(move: Move): boolean {
    if (this.failure != null) throw this.failure
    return this.complete
  }

  private advanceFlight(move: Move): void {
    if (this.landed(move)) {
      this.complete = true
      return
    }
    if (this.bot.entity.position.y < move.exitPos.y - 0.2)
      throw new CancelError('Neo: landing was missed')
    const previous = this.flight[this.step - 1]
    if (previous != null && previous.position.distanceTo(this.bot.entity.position) > 0.4) {
      throw new CancelError('Neo: server position differs from the predicted flight')
    }
    const next = this.flight[this.step++]
    if (next == null) throw new CancelError('Neo: flight ended without landing')
    this.applyStep(next, move)
  }

  private async planFlight(move: Move): Promise<FlightStep[]> {
    const dir = this.direction(move)
    const sign = move.metadata?.neoSides[0] ?? 1
    const side = new Vec3(-dir.z * sign, 0, dir.x * sign)
    const source: Vec3 = move.metadata?.neoOrigin ?? move.entryPos.floored()
    const origin = source.offset(0.5, 0, 0.5)
    const distance = move.exitPos.xzDistanceTo(origin)
    const physicsWorld = { getBlock: (position: Vec3) => this.world.getBlock(position) }
    const controls = {
      forward: true,
      back: false,
      left: false,
      right: false,
      sneak: false,
      sprint: this.settings.allowSprinting,
      jump: true
    }
    const initial = new PlayerState(this.bot, controls)
    log(
      'planning from %O velocity=%O onGround=%s jumpTicks=%s',
      initial.pos,
      initial.vel,
      initial.onGround,
      initial.jumpTicks
    )
    let beam: Flight[] = [{ state: initial, steps: [], score: 0, jumped: false }]
    // Bounded beam; only run it for an actual Neo, never for every A* neighbor.
    const deadline = performance.now() + 750
    for (let tick = 0; tick < 22 && beam.length > 0; tick++) {
      if (this.aborted || this.bot.pathfinder.abortCalculation || performance.now() > deadline)
        return []
      const candidates: Flight[] = []
      for (const flight of beam) {
        const progress = flight.state.pos.minus(origin).dot(dir)
        const angles =
          progress < distance - 0.2
            ? [110, 75, 45, 20, 0, -20, -45, -75, -110]
            : [-150, -110, -75, -45, 0, 75, 150]
        for (const angle of angles) {
          const launches =
            !flight.jumped && flight.state.onGround && tick < 4 ? [true, false] : [false]
          for (const jump of launches) {
            const rad = (angle * Math.PI) / 180
            const heading = dir.scaled(Math.cos(rad)).plus(side.scaled(Math.sin(rad)))
            const look = move.exitPos.minus(flight.state.pos)
            const lookYaw = Math.atan2(-look.x, -look.z)
            const input = steering(Math.atan2(-heading.x, -heading.z), lookYaw, jump)
            if (jump && Math.abs(angularDifference(input.yaw, lookYaw)) > Math.PI / 3) continue
            const turn = Math.abs(angularDifference(input.yaw, flight.state.yaw))
            if (flight.jumped && turn > Math.PI / 3) continue
            const { yaw, ...buttons } = input
            const state = Object.assign(
              Object.create(Object.getPrototypeOf(initial)),
              flight.state,
              {
                pos: flight.state.pos.clone(),
                vel: flight.state.vel.clone(),
                yaw,
                control: { ...controls, ...buttons, jump, sneak: flight.jumped && flight.state.onGround }
              }
            )
            ;(this.bot.physics as any).simulatePlayer(state, physicsWorld)
            if (
              state.isCollidedHorizontally ||
              state.isInWater ||
              state.isInLava ||
              state.pos.y < move.exitPos.y - 0.05
            )
              continue
            const jumped = flight.jumped || jump
            if (!jumped && !state.onGround) continue
            const steps = [
              ...flight.steps,
              { ...input, jump, sneak: state.control.sneak, position: state.pos.clone() }
            ]
            const offset = state.pos.minus(origin)
            const along = offset.dot(dir)
            const across = offset.dot(side)
            if (jumped && tick > 2 && state.onGround) {
              if (
                state.pos.floored().equals(move.exitPos.floored()) &&
                state.pos.xzDistanceTo(move.exitPos) < 0.65
              )
                return steps
              if (along < distance - 0.3) continue
            }
            // Stay outside the wall until the full player box has cleared its back face.
            const desiredAcross = along < distance - 0.2 ? 0.85 : 0
            const future = state.pos.plus(state.vel.scaled(3))
            const score =
              future.xzDistanceTo(move.exitPos) +
              Math.abs(across - desiredAcross) * 0.3 +
              Math.max(0, -along) * 2 + turn * 0.02
            candidates.push({ state, steps, score, jumped })
          }
        }
      }
      candidates.sort((a, b) => a.score - b.score)
      const seen = new Set<string>()
      beam = []
      let launchesKept = 0
      let flightsKept = 0
      for (const candidate of candidates) {
        if (candidate.jumped ? flightsKept >= 48 : launchesKept >= 16) continue
        const { pos, vel } = candidate.state
        const key =
          `${candidate.jumped}:` +
          [pos.x, pos.z, vel.x * 2, vel.z * 2].map((n) => Math.round(n * 12)).join(',')
        if (seen.has(key)) continue
        seen.add(key)
        beam.push(candidate)
        if (candidate.jumped) flightsKept++
        else launchesKept++
        if (beam.length === 64) break
      }
      // Keep packets, stop commands and physics responsive during flight planning.
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
    return []
  }
}
