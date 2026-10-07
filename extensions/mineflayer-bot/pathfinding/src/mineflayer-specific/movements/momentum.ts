// SPDX-License-Identifier: GPL-3.0-only
import { Vec3 } from 'vec3'
import type { Bot } from 'mineflayer'
import { Move } from '../move'
import type { Goal } from '../goals'
import type { World } from '../world/worldInterface'
import { Movement } from './movement'
import { MovementProvider } from './movementProvider'
import { MovementExecutor } from './movementExecutor'
import { steerToPosition } from './controls'
import { CancelError } from '../exceptions'
import { COST_INF, WALK_ONE_BLOCK_COST } from './costs'

const { PlayerState } = require('prismarine-physics')
const log = require('debug')('minecraft-pathfinding:momentum')
const slippery = new Set(['ice', 'packed_ice', 'blue_ice', 'frosted_ice', 'slime_block'])
type Step = { position: Vec3; yaw: number; jump: boolean; forward: boolean; back: boolean }

/** Native Mineflayer physics includes surface friction, effects and live velocity. */
function predict (bot: Bot, world: World, from: Vec3, velocity: Vec3, edge: Vec3, target: Vec3, warmup = false): Step[] | undefined {
  warmup &&= from.xzDistanceTo(edge) >= 3
  log('predict %O -> %O edge=%O warmup=%s velocity=%O', from, target, edge, warmup, velocity)
  const dir = target.minus(edge); dir.y = 0; dir.normalize()
  const yaw = Math.atan2(-dir.x, -dir.z)
  const controls = { forward: true, back: false, left: false, right: false, jump: false, sneak: false, sprint: true }
  const state = new PlayerState(bot, controls)
  state.pos = from.clone(); state.vel = velocity.clone(); state.yaw = yaw
  state.onGround = true; state.isInWater = false; state.isInLava = false
  state.vel.y = Math.min(state.vel.y, -0.0784)
  state.jumpTicks = 0; state.jumpQueued = false
  const steps: Step[] = []
  let launched = false
  for (let tick = 0; tick < 140; tick++) {
    // Simulate the next running tick and take off before losing ice friction.
    let jump = false
    // Sprint on the runway first, then hop onto the ice so landing preserves
    // airborne momentum. A hop from rest wastes most of that acceleration.
    const warmupJump = warmup && tick > 0 && state.onGround && edge.minus(state.pos).dot(dir) >= 6
    if (!launched && state.onGround && !warmupJump) {
      const preview = Object.assign(Object.create(Object.getPrototypeOf(state)), state, {
        pos: state.pos.clone(), vel: state.vel.clone(), control: { ...controls, jump: false }
      })
      ;(bot.physics as any).simulatePlayer(preview, { getBlock: (pos: Vec3) => world.getBlock(pos) })
      // Friction is sampled below the center: waiting until the entire box
      // leaves the ice applies ordinary friction and loses the stored speed.
      const block = world.getBlockInfo(preview.pos.offset(0, -0.05, 0))
      const supported = block.physical && block.height >= edge.y - 0.05
      jump = !supported
    }
    if (jump) { launched = true; log('launch at %O velocity=%O', state.pos, state.vel) }
    const remaining = target.minus(state.pos).dot(dir)
    const back = launched && remaining < 0.55
    state.control = { ...controls, jump: jump || warmupJump, forward: !back, back }
    ;(bot.physics as any).simulatePlayer(state, { getBlock: (pos: Vec3) => world.getBlock(pos) })
    if (state.isInWater || state.isInLava || state.isCollidedHorizontally || state.pos.y < edge.y - 0.05) { log('rejected tick=%s at %O onGround=%s horizontal=%s', tick, state.pos, state.onGround, state.isCollidedHorizontally); return }
    steps.push({ position: state.pos.clone(), yaw, jump: jump || warmupJump, forward: !back, back })
    if (launched && state.onGround) {
      if (state.pos.floored().equals(target.floored())) { log('landed in %s ticks at %O', steps.length, state.pos); return steps }
      if (state.pos.xzDistanceTo(target) > 0.85) return
    }
    if (!launched && !state.onGround && !warmup) return
  }
}

export class MomentumJump extends MovementProvider {
  movementDirs = Movement.cardinalDirs
  provideMovements (node: Move, storage: Move[], _goal: Goal, closed: Set<string>): void {
    if (!this.settings.allowSprinting || !this.settings.allowJumpSprint) return
    const floor = this.getBlockInfo(node, 0, -1, 0)
    if (!floor.solidFull || this.getBlockInfo(node, 0, 0, 0).liquid) return
    const nodeOrigin = node.cachedVec.offset(0.5, 0, 0.5)
    for (const dir of this.movementDirs) {
      let ahead = 0
      let origin = nodeOrigin
      while (ahead < 24) {
        const next = origin.plus(dir)
        if (!this.getBlockInfo(next, 0, -1, 0).solidFull || ![0, 1, 2].every(y => this.getBlockInfo(next, 0, y, 0).walkthrough)) break
        origin = next; ahead++
      }
      if (this.getBlockInfo(origin, dir.x, -1, dir.z).physical) continue
      let runup = 0
      let boosted = slippery.has(this.getBlockInfo(origin, 0, -1, 0).block?.name ?? '') || node.exitVel.xzDistanceTo(new Vec3(0, 0, 0)) > 0.32
      for (let distance = 1; distance <= 24; distance++) {
        const pos = origin.minus(dir.scaled(distance))
        if (!this.getBlockInfo(pos, 0, -1, 0).solidFull || !this.getBlockInfo(pos, 0, 0, 0).walkthrough || !this.getBlockInfo(pos, 0, 1, 0).walkthrough) break
        runup = distance
        boosted ||= slippery.has(this.getBlockInfo(pos, 0, -1, 0).block?.name ?? '')
      }
      if (!boosted) continue
      for (let distance = 2; distance <= 9; distance++) {
        const pos = origin.plus(dir.scaled(distance))
        if (![0, 1, 2].every(y => this.getBlockInfo(pos, 0, y, 0).walkthrough)) break
        if (!this.getBlockInfo(pos, 0, -1, 0).solidFull) continue
        if (distance < 6 || closed.has(`${Math.floor(pos.x)},${pos.y},${Math.floor(pos.z)}`)) break
        for (let backup = ahead; backup <= runup; backup++) {
          const from = origin.minus(dir.scaled(backup))
          const velocity = backup === ahead ? node.exitVel : new Vec3(0, 0, 0)
          const direct = predict(this.bot, this.world, from, velocity, origin, pos)
          const flight = direct ?? predict(this.bot, this.world, from, velocity, origin, pos, true)
          if (flight == null) continue
          const visited = new Map<string, Vec3>()
          for (const step of flight) visited.set(step.position.floored().toString(), step.position.floored())
          // Runway/flight exclusions also apply to long jumps, not just the landing.
          let extraCost = 0
          for (const position of visited.values()) extraCost += this.exclusionStep(this.getBlockInfoRaw(position))
          const cost = flight.length + (backup - ahead) * WALK_ONE_BLOCK_COST + extraCost
          if (cost >= COST_INF) break
          const move = Move.fromPrevious(cost, pos, node, this)
          move.metadata = { momentumEdge: origin, momentumRunup: from, momentumWarmup: direct == null }
          storage.push(move)
          break
        }
        break
      }
    }
  }
}

export class MomentumJumpExecutor extends MovementExecutor {
  private steps: Step[] = []
  private index = 0
  private listener?: () => void
  private landed = false
  private failure?: Error
  override reset (): void {
    if (this.listener != null) this.bot.off('physicsTick', this.listener)
    this.listener = undefined; this.steps = []; this.index = 0; this.landed = false; this.failure = undefined
    super.reset()
  }
  override align (move: Move): boolean {
    const edge: Vec3 = move.metadata!.momentumEdge
    this.steps = predict(this.bot, this.world, this.bot.entity.position, this.bot.entity.velocity, edge, move.exitPos) ??
      predict(this.bot, this.world, this.bot.entity.position, this.bot.entity.velocity, edge, move.exitPos, move.metadata!.momentumWarmup) ?? []
    if (this.steps.length > 0 && this.bot.entity.onGround) return true
    const target: Vec3 = move.metadata!.momentumRunup
    this.bot.entity.yaw = Math.atan2(edge.x - move.exitPos.x, edge.z - move.exitPos.z)
    steerToPosition(this.bot, target, 0.07)
    this.bot.setControlState('jump', false); this.bot.setControlState('sprint', false)
    this.bot.setControlState('sneak', true)
    if (this.bot.entity.position.xzDistanceTo(target) < 0.08 && this.bot.entity.velocity.xzDistanceTo(new Vec3(0, 0, 0)) < 0.015) {
      this.steps = predict(this.bot, this.world, this.bot.entity.position, this.bot.entity.velocity, edge, move.exitPos, move.metadata!.momentumWarmup) ?? []
      if (this.steps.length === 0) throw new CancelError('Momentum jump: no safe flight with the available speed and runway')
      return true
    }
    return false
  }
  async performInit (move: Move): Promise<void> {
    this.index = 0
    const apply = (): void => {
      const step = this.steps[this.index++]
      if (step == null) { this.failure = new CancelError('Momentum jump: missed the landing'); return }
      this.bot.clearControlStates(); this.bot.entity.yaw = step.yaw; this.bot.entity.pitch = 0
      this.bot.setControlState('sprint', true); this.bot.setControlState('jump', step.jump)
      this.bot.setControlState('forward', step.forward); this.bot.setControlState('back', step.back)
    }
    const listener = (): void => {
      if (this.aborted || this.bot.pathfinder.abortCalculation) { this.bot.off('physicsTick', listener); return }
      const previous = this.steps[this.index - 1]
      if (previous != null && previous.position.distanceTo(this.bot.entity.position) > 0.4) this.failure = new CancelError('Momentum jump: server position differs from the predicted flight')
      if (this.index > 0 && this.bot.entity.onGround && this.bot.entity.position.floored().equals(move.exitPos.floored())) this.landed = true
      if (this.landed || this.failure != null) { this.bot.off('physicsTick', listener); this.listener = undefined; this.bot.clearControlStates(); return }
      apply()
    }
    apply(); this.listener = listener; this.bot.on('physicsTick', listener)
  }
  performPerTick (move: Move): boolean {
    if (this.failure != null) throw this.failure
    if (!this.landed) return false
    steerToPosition(this.bot, move.exitPos, 0.1)
    this.bot.setControlState('jump', false); this.bot.setControlState('sprint', false)
    return this.bot.entity.onGround && this.bot.entity.position.xzDistanceTo(move.exitPos) < 0.3 && this.bot.entity.velocity.xzDistanceTo(new Vec3(0, 0, 0)) < 0.06
  }
}
