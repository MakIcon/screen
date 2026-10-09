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
const ice = new Set(['ice', 'packed_ice', 'blue_ice', 'frosted_ice'])

export function isIceBlock (name?: string): boolean { return name != null && ice.has(name) }
type Step = { position: Vec3; velocity: Vec3; onGround: boolean; yaw: number; jump: boolean; forward: boolean; back: boolean; right: boolean }
type Warmup = false | { firstHopTick: number; chain: boolean }
type Flight = { steps: Step[]; warmup: Warmup; rimRebound: boolean; runup?: Vec3; airStrafe?: boolean }
type HopCandidate = { tick: number; distance: number }

/** Native Mineflayer physics includes surface friction, effects and live velocity. */
function predict (bot: Bot, world: World, from: Vec3, velocity: Vec3, edge: Vec3, target: Vec3, warmup: Warmup = false, live = false, candidates?: HopCandidate[], airStrafe = false, contacts?: number[]): Step[] | undefined {
  log('predict %O -> %O edge=%O warmup=%s velocity=%O', from, target, edge, warmup, velocity)
  const dir = target.minus(edge); dir.y = 0; dir.normalize()
  const yaw = Math.atan2(-dir.x, -dir.z)
  const controls = { forward: true, back: false, left: false, right: false, jump: false, sneak: false, sprint: true }
  const state = new PlayerState(bot, controls)
  state.pos = from.clone(); state.vel = velocity.clone(); state.yaw = yaw
  if (live) {
    if (!state.onGround || state.isInWater || state.isInLava) return
  } else {
    state.onGround = true; state.isInWater = false; state.isInLava = false
    state.vel.y = Math.min(state.vel.y, -0.0784)
    state.jumpTicks = 0; state.jumpQueued = false
  }
  const steps: Step[] = []
  let launched = false
  let hopped = false
  let wasAirborne = false
  for (let tick = 0; tick < 140; tick++) {
    // Simulate the next running tick and take off before losing ice friction.
    let jump = false
    // Sprint on the runway first, then hop onto the ice so landing preserves
    // airborne momentum. A hop from rest wastes most of that acceleration.
    const distance = edge.minus(state.pos).dot(dir)
    if (!launched && state.onGround && wasAirborne && Math.abs(distance) < 1.5) contacts?.push(-distance)
    if (!launched && state.onGround && distance >= 1 && distance <= 7) candidates?.push({ tick, distance })
    const warmupJump = !launched && state.onGround && warmup !== false &&
      (tick === warmup.firstHopTick || (hopped && warmup.chain && distance >= (airStrafe ? 3 : 3.5)))
    if (warmupJump) hopped = true
    if (!launched && state.onGround && !warmupJump) {
      const preview = Object.assign(Object.create(Object.getPrototypeOf(state)), state, {
        pos: state.pos.clone(), vel: state.vel.clone(), control: { ...controls, jump: false }
      })
      ;(bot.physics as any).simulatePlayer(preview, { getBlock: (pos: Vec3) => world.getBlock(pos) })
      // Friction is sampled below the center: waiting until the entire box
      // leaves the ice applies ordinary friction and loses the stored speed.
      const block = world.getBlockInfo(preview.pos.offset(0, -0.05, 0))
      const supported = block.physical && block.height >= edge.y - 0.05
      // A preparatory hop must rebound on contact with the last part of the
      // ice block, before a walking tick consumes its incoming momentum.
      const rimContact = wasAirborne && isIceBlock(world.getBlock(state.pos.offset(0, -0.05, 0))?.name) &&
        distance <= -0.2 && distance > -0.5
      jump = rimContact || !supported
    }
    if (jump) { launched = true; log('launch at %O velocity=%O', state.pos, state.vel) }
    const remaining = target.minus(state.pos).dot(dir)
    const back = launched && remaining < 0.55
    // Diagonal air inputs normalize to full acceleration. Rotate the view so
    // their resultant still follows the runway; keep sprint-jump impulses straight.
    const right = airStrafe && !state.onGround && !back
    state.yaw = yaw + (right ? Math.PI / 4 : 0)
    state.control = { ...controls, jump: jump || warmupJump, forward: !back, back, right }
    wasAirborne = !state.onGround
    ;(bot.physics as any).simulatePlayer(state, { getBlock: (pos: Vec3) => world.getBlock(pos) })
    if (!launched && wasAirborne && state.pos.y <= edge.y + 0.01 && Math.abs(state.pos.minus(edge).dot(dir)) < 1.5) {
      contacts?.push(state.pos.minus(edge).dot(dir))
    }
    if (state.isInWater || state.isInLava || state.isCollidedHorizontally || state.pos.y < edge.y - 0.05) { log('rejected tick=%s at %O onGround=%s horizontal=%s', tick, state.pos, state.onGround, state.isCollidedHorizontally); return }
    steps.push({ position: state.pos.clone(), velocity: state.vel.clone(), onGround: state.onGround, yaw: state.yaw, jump: jump || warmupJump, forward: !back, back, right })
    if (launched && state.onGround) {
      if (state.pos.floored().equals(target.floored())) { log('landed in %s ticks at %O', steps.length, state.pos); return steps }
      if (state.pos.xzDistanceTo(target) > 0.85) return
    }
    if (!launched && !state.onGround && warmup === false) return
  }
}

/** Search actual input ticks: running, a timed hop onto the rim, then takeoff.
 * Ice retains speed; it never supplies an invented velocity or extra jump impulse.
 */
function reboundsAtRim (world: World, edge: Vec3, target: Vec3, steps: Step[]): boolean {
  const dir = target.minus(edge); dir.y = 0; dir.normalize()
  return steps.some((step, i) => {
    if (i < 2 || !step.jump || step.onGround) return false
    const contact = steps[i - 1]
    const rimOffset = contact.position.minus(edge).dot(dir)
    return contact.onGround && !steps[i - 2].onGround && rimOffset >= 0.2 && rimOffset < 0.5 &&
      isIceBlock(world.getBlock(contact.position.offset(0, -0.05, 0))?.name)
  })
}

export function predictMomentumJump (bot: Bot, world: World, from: Vec3, velocity: Vec3, edge: Vec3, target: Vec3, live = false, accept: (steps: Step[]) => boolean = () => true, refineRunup = false): Flight | undefined {
  let fallback: Flight | undefined
  const candidates: HopCandidate[] = []
  const direct = predict(bot, world, from, velocity, edge, target, false, live, candidates)
  if (direct != null && accept(direct)) {
    fallback = { steps: direct, warmup: false, rimRebound: false }
    // Keep a bot already moving onto the rim in motion, including an incoming
    // hop whose landing happened before this movement started.
    if (from.xzDistanceTo(edge) < 1.5 && velocity.xzDistanceTo(new Vec3(0, 0, 0)) > 0.32) return fallback
  }
  // Roughly one sprint-jump before the rim is a useful search order, not a
  // distance guarantee. Every candidate still runs through native collisions.
  candidates.sort((a, b) => Math.abs(a.distance - 4.5) - Math.abs(b.distance - 4.5))
  for (const { tick } of candidates) {
    const warmup = { firstHopTick: tick, chain: false }
    const steps = predict(bot, world, from, velocity, edge, target, warmup, live)
    if (steps != null && accept(steps)) {
      if (reboundsAtRim(world, edge, target, steps)) return { steps, warmup, rimRebound: true }
      fallback ??= { steps, warmup, rimRebound: false }
    }
  }
  // A longer runway can build momentum with repeated hops. Vary the first
  // takeoff over one ordinary jump's duration to land on a short ice rim.
  if (from.xzDistanceTo(edge) >= 6) {
    for (let firstHopTick = 0; firstHopTick <= 12; firstHopTick++) {
      const warmup = { firstHopTick, chain: true }
      const steps = predict(bot, world, from, velocity, edge, target, warmup, live)
      if (steps != null && accept(steps)) {
        if (reboundsAtRim(world, edge, target, steps)) return { steps, warmup, rimRebound: true }
        fallback ??= { steps, warmup, rimRebound: false }
      }
    }
  }
  if (fallback != null) return fallback
  const warmups: Warmup[] = [false, ...candidates.map(({ tick }) => ({ firstHopTick: tick, chain: false }))]
  if (from.xzDistanceTo(edge) >= 6) for (let tick = 0; tick <= 12; tick++) warmups.push({ firstHopTick: tick, chain: true })
  const dir = target.minus(edge); dir.y = 0; dir.normalize()
  for (const warmup of warmups) {
    const contacts: number[] = []
    const steps = predict(bot, world, from, velocity, edge, target, warmup, live, undefined, true, contacts)
    if (steps != null && accept(steps)) return { steps, warmup, rimRebound: reboundsAtRim(world, edge, target, steps), airStrafe: true }
    if (live || !refineRunup || velocity.xzDistanceTo(new Vec3(0, 0, 0)) > 0.02) continue
    for (const contact of contacts) {
      // Tune the start within its block instead of rounding a millimetre-wide
      // rim landing to block centers. The real bot must align here before launch.
      const shift = 0.495 - contact
      if (Math.abs(shift) > 0.49) continue
      const runup = from.plus(dir.scaled(shift))
      if (!world.getBlockInfo(runup.offset(0, -1, 0)).solidFull ||
          ![0, 1, 2].every(y => world.getBlockInfo(runup.offset(0, y, 0)).walkthrough)) continue
      const adjusted = predict(bot, world, runup, velocity, edge, target, warmup, false, undefined, true)
      if (adjusted != null && accept(adjusted) && reboundsAtRim(world, edge, target, adjusted)) {
        return { steps: adjusted, warmup, rimRebound: true, runup, airStrafe: true }
      }
    }
  }
}

function flightExclusionCost (movement: Movement, steps: Step[]): number {
  const visited = new Set<string>()
  let cost = 0
  for (const step of steps) {
    const position = step.position.floored()
    const key = position.toString()
    if (visited.has(key)) continue
    visited.add(key)
    cost += movement.exclusionStep(movement.world.getBlockInfo(position))
    if (cost >= COST_INF) break
  }
  return cost
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
        // Four air blocks (five between floor centers) also need a continuous
        // ice approach; the standing parkour executor can lose this momentum.
        if (distance < 5 || closed.has(`${Math.floor(pos.x)},${pos.y},${Math.floor(pos.z)}`)) break
        let fallback: { flight: Flight; from: Vec3; backup: number } | undefined
        let selected: typeof fallback
        for (let backup = ahead; backup <= runup; backup++) {
          const from = backup === ahead ? node.exitPos : origin.minus(dir.scaled(backup))
          const velocity = backup === ahead ? node.exitVel : new Vec3(0, 0, 0)
          // Runway/flight exclusions also apply to long jumps, not just the landing.
          const flight = predictMomentumJump(this.bot, this.world, from, velocity, origin, pos, false,
            steps => flightExclusionCost(this, steps) < COST_INF, true)
          if (flight == null) continue
          const candidate = { flight, from: flight.runup ?? from, backup }
          if (flight.rimRebound || (backup === ahead && velocity.xzDistanceTo(new Vec3(0, 0, 0)) > 0.32)) {
            selected = candidate
            break
          }
          fallback ??= candidate
        }
        selected ??= fallback
        if (selected != null) {
          const { flight, from, backup } = selected
          const cost = flight.steps.length + (backup - ahead) * WALK_ONE_BLOCK_COST + flightExclusionCost(this, flight.steps)
          if (cost < COST_INF) {
            const move = Move.fromPrevious(cost, pos, node, this)
            move.metadata = { momentumEdge: origin, momentumRunup: from, momentumWarmup: flight.warmup, momentumRebound: flight.rimRebound,
              momentumAirStrafe: flight.airStrafe === true, momentumPreciseRunup: flight.runup != null }
            storage.push(move)
          }
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
  // Ice contact is an intermediate landing in the same flight sequence.
  override get canInterrupt (): boolean { return this.listener == null || this.landed || this.failure != null }
  override reset (): void {
    if (this.listener != null) this.bot.off('physicsTick', this.listener)
    this.listener = undefined; this.steps = []; this.index = 0; this.landed = false; this.failure = undefined
    super.reset()
  }
  private planFromCurrentState (move: Move): Step[] {
    const edge: Vec3 = move.metadata!.momentumEdge
    const incoming = this.bot.entity.position.xzDistanceTo(edge) < 1.5 &&
      this.bot.entity.velocity.xzDistanceTo(new Vec3(0, 0, 0)) > 0.32
    return predictMomentumJump(this.bot, this.world, this.bot.entity.position, this.bot.entity.velocity, edge, move.exitPos, true,
      steps => flightExclusionCost(this, steps) < COST_INF &&
        (move.metadata!.momentumRebound !== true || incoming || reboundsAtRim(this.world, edge, move.exitPos, steps)))?.steps ?? []
  }
  override align (move: Move): boolean {
    const edge: Vec3 = move.metadata!.momentumEdge
    this.steps = this.planFromCurrentState(move)
    if (this.steps.length > 0 && this.bot.entity.onGround) {
      // Install controls at this physics boundary. Async runner initialization
      // may otherwise consume another tick of the old alignment inputs.
      this.startFlight(move)
      return true
    }
    const target: Vec3 = move.metadata!.momentumRunup
    this.bot.entity.yaw = Math.atan2(edge.x - move.exitPos.x, edge.z - move.exitPos.z)
    const precise = move.metadata!.momentumPreciseRunup === true
    steerToPosition(this.bot, target, precise ? 0.015 : 0.07, precise ? 0.002 : 0.045)
    this.bot.setControlState('jump', false); this.bot.setControlState('sprint', false)
    this.bot.setControlState('sneak', true)
    if (this.bot.entity.onGround && this.bot.entity.position.xzDistanceTo(target) < (precise ? 0.003 : 0.08) && this.bot.entity.velocity.xzDistanceTo(new Vec3(0, 0, 0)) < (precise ? 0.004 : 0.015)) {
      if (this.steps.length === 0) throw new CancelError('Momentum jump: no safe flight with the available speed and runway')
    }
    return false
  }
  async performInit (_move: Move): Promise<void> {
    if (this.listener == null && !this.landed) throw this.failure ?? new CancelError('Momentum jump: flight interrupted before initialization')
  }
  private startFlight (move: Move): void {
    this.index = 0
    const apply = (): void => {
      const step = this.steps[this.index++]
      if (step == null) { this.failure = new CancelError('Momentum jump: missed the landing'); return }
      this.bot.clearControlStates(); this.bot.entity.yaw = step.yaw; this.bot.entity.pitch = 0
      this.bot.setControlState('sprint', true); this.bot.setControlState('jump', step.jump)
      this.bot.setControlState('forward', step.forward); this.bot.setControlState('back', step.back)
      this.bot.setControlState('right', step.right)
    }
    const listener = (): void => {
      if (this.aborted || this.bot.pathfinder.abortCalculation) { this.bot.off('physicsTick', listener); return }
      const previous = this.steps[this.index - 1]
      if (previous != null && previous.position.distanceTo(this.bot.entity.position) > (move.metadata!.momentumAirStrafe ? 0.02 : 0.4)) this.failure = new CancelError('Momentum jump: server position differs from the predicted flight')
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
