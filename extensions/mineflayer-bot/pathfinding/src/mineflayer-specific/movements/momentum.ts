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
import { installSupportingBlockPhysics, movementSupport, usesSupportingBlock } from '../supportingBlockPhysics'

const { PlayerState } = require('prismarine-physics')
const log = require('debug')('minecraft-pathfinding:momentum')
const slippery = new Set(['ice', 'packed_ice', 'blue_ice', 'frosted_ice', 'slime_block'])
const ice = new Set(['ice', 'packed_ice', 'blue_ice', 'frosted_ice'])

export function isIceBlock (name?: string): boolean { return name != null && ice.has(name) }
type Step = { position: Vec3; velocity: Vec3; onGround: boolean; yaw: number; jump: boolean; forward: boolean; back: boolean; right: boolean; left?: boolean; preparing?: boolean; support?: Vec3 }
type Warmup = false | { firstHopTick: number; chain: boolean }
type Flight = { steps: Step[]; warmup: Warmup; rimRebound: boolean; runup?: Vec3; airStrafe?: boolean }
type Segment = { edge: Vec3; target: Vec3; warmup: Warmup; rebound: boolean; contactSpeed: number; airStrafe: boolean }
type HopCandidate = { tick: number; distance: number }

/** Native Mineflayer physics includes surface friction, effects and live velocity. */
function predict (bot: Bot, world: World, from: Vec3, velocity: Vec3, edge: Vec3, target: Vec3, warmup: Warmup = false, live = false, candidates?: HopCandidate[], airStrafe = false, contacts?: number[], finalStrafeTicks = Number.POSITIVE_INFINITY): Step[] | undefined {
  installSupportingBlockPhysics(bot)
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
  let finalAirTick = 0
  for (let tick = 0; tick < 140; tick++) {
    // Simulate the next running tick and take off before losing ice friction.
    let jump = false
    // Sprint on the runway first, then hop onto the ice so landing preserves
    // airborne momentum. A hop from rest wastes most of that acceleration.
    const distance = edge.minus(state.pos).dot(dir)
    if (!launched && state.onGround && wasAirborne && Math.abs(distance) < 1.5) contacts?.push(-distance)
    if (!launched && state.onGround && distance >= 1 && distance <= 7) candidates?.push({ tick, distance })
    const warmupJump = !launched && state.onGround && warmup !== false &&
      (tick === warmup.firstHopTick || (hopped && warmup.chain && distance >= 3))
    if (warmupJump) hopped = true
    if (!launched && state.onGround && !warmupJump) {
      const preview = Object.assign(Object.create(Object.getPrototypeOf(state)), state, {
        pos: state.pos.clone(), vel: state.vel.clone(), control: { ...controls, jump: false }
      })
      ;(bot.physics as any).simulatePlayer(preview, { getBlock: (pos: Vec3) => world.getBlock(pos) })
      // Modern vanilla retains its supporting block through the last grounded
      // edge tick. Legacy physics samples only below the player's center.
      const block = world.getBlockInfo(preview.pos.offset(0, -0.05, 0))
      const modern = usesSupportingBlock(bot)
      const supported = modern ? preview.onGround : block.physical && block.height >= edge.y - 0.05
      // A preparatory hop must rebound on contact with the last part of the
      // ice block, before a walking tick consumes its incoming momentum.
      const surface = movementSupport(bot, world, state) ?? state.pos.offset(0, -0.05, 0)
      const rimContact = wasAirborne && isIceBlock(world.getBlock(surface)?.name) &&
        distance <= (modern ? -0.5 : -0.2) && distance > (modern ? -1.2 : -0.5)
      jump = rimContact || !supported
    }
    if (jump) { launched = true; log('launch at %O velocity=%O', state.pos, state.vel) }
    const remaining = target.minus(state.pos).dot(dir)
    const back = launched && remaining < 0.55
    // Diagonal air inputs normalize to full acceleration. Rotate the view so
    // their resultant still follows the runway; keep sprint-jump impulses straight.
    const right = airStrafe && !state.onGround && !back && (!launched || finalAirTick++ < finalStrafeTicks)
    state.yaw = yaw + (right ? Math.PI / 4 : 0)
    state.control = { ...controls, jump: jump || warmupJump, forward: !back, back, right }
    wasAirborne = !state.onGround
    ;(bot.physics as any).simulatePlayer(state, { getBlock: (pos: Vec3) => world.getBlock(pos) })
    if (!launched && wasAirborne && state.pos.y <= edge.y + 0.01 && Math.abs(state.pos.minus(edge).dot(dir)) < 1.5) {
      contacts?.push(state.pos.minus(edge).dot(dir))
    }
    if (state.isInWater || state.isInLava || state.isCollidedHorizontally || state.pos.y < edge.y - 0.05) { log('rejected tick=%s at %O onGround=%s horizontal=%s', tick, state.pos, state.onGround, state.isCollidedHorizontally); return }
    steps.push({ position: state.pos.clone(), velocity: state.vel.clone(), onGround: state.onGround, yaw: state.yaw, jump: jump || warmupJump, forward: !back, back, right,
      support: movementSupport(bot, world, state)?.clone() })
    if (launched && state.onGround) {
      if (state.pos.floored().equals(target.floored())) { log('landed in %s ticks at %O', steps.length, state.pos); return steps }
      if (state.pos.xzDistanceTo(target) > 0.85) return
    }
    if (!launched && !state.onGround && warmup === false) return
  }
}

/** Face the landing again as early as possible, retaining the clearance of a
 * verified opt-in jump that needed 45-degree inputs.
 */
function shortenAirStrafe (bot: Bot, world: World, from: Vec3, velocity: Vec3, edge: Vec3, target: Vec3, warmup: Warmup, live: boolean, steps: Step[], accept: (steps: Step[]) => boolean): Step[] {
  const dir = target.minus(edge); dir.y = 0; dir.normalize()
  const clearance = (flight: Step[]): number => flight[flight.length - 2].position.minus(target).dot(dir) + 0.5 + (bot.entity.width ?? 0.6) / 2
  const minimum = Math.min(0.005, clearance(steps))
  let takeoff = 0
  for (let i = 0; i < steps.length; i++) if (steps[i].jump) takeoff = i
  const boostedTicks = steps.slice(takeoff).filter(step => step.right).length
  for (let ticks = 0; ticks < boostedTicks; ticks++) {
    const shorter = predict(bot, world, from, velocity, edge, target, warmup, live, undefined, true, undefined, ticks)
    if (shorter != null && clearance(shorter) >= minimum - 1e-7 && accept(shorter)) return shorter
  }
  return steps
}

/** Search actual input ticks: running, a timed hop onto the rim, then takeoff.
 * Ice retains speed; it never supplies an invented velocity or extra jump impulse.
 */
function rimContactStep (world: World, edge: Vec3, target: Vec3, steps: Step[]): Step | undefined {
  const dir = target.minus(edge); dir.y = 0; dir.normalize()
  for (let i = 2; i < steps.length; i++) {
    const step = steps[i]
    if (!step.jump || step.onGround) continue
    const contact = steps[i - 1]
    const rimOffset = contact.position.minus(edge).dot(dir)
    if (contact.onGround && !steps[i - 2].onGround && rimOffset >= 0.2 && rimOffset < (contact.support != null ? 1.2 : 0.5) &&
      isIceBlock(world.getBlock(contact.support ?? contact.position.offset(0, -0.05, 0))?.name)) return contact
  }
}

function reboundsAtRim (world: World, edge: Vec3, target: Vec3, steps: Step[]): boolean {
  return rimContactStep(world, edge, target, steps) != null
}

export function predictMomentumJump (bot: Bot, world: World, from: Vec3, velocity: Vec3, edge: Vec3, target: Vec3, live = false, accept: (steps: Step[]) => boolean = () => true, refineRunup = false, allowAirStrafe = false): Flight | undefined {
  let fallback: Flight | undefined
  const candidates: HopCandidate[] = []
  const dir = target.minus(edge); dir.y = 0; dir.normalize()
  const refine = (warmup: Warmup, airStrafe: boolean, contacts: number[]): Flight | undefined => {
    if (live || !refineRunup || velocity.xzDistanceTo(new Vec3(0, 0, 0)) > 0.02) return
    for (const contact of new Set(contacts)) {
      // Search positions within the starting block for both straight and
      // diagonal inputs, so an avoidable side turn never wins on rounding alone.
      const shift = 0.495 - contact
      if (Math.abs(shift) > 0.49) continue
      const runup = from.plus(dir.scaled(shift))
      if (!world.getBlockInfo(runup.offset(0, -1, 0)).solidFull ||
          ![0, 1, 2].every(y => world.getBlockInfo(runup.offset(0, y, 0)).walkthrough)) continue
      const adjusted = predict(bot, world, runup, velocity, edge, target, warmup, false, undefined, airStrafe)
      if (adjusted != null && accept(adjusted) && reboundsAtRim(world, edge, target, adjusted)) {
        return { steps: airStrafe ? shortenAirStrafe(bot, world, runup, velocity, edge, target, warmup, false, adjusted, accept) : adjusted,
          warmup, rimRebound: true, runup, airStrafe }
      }
    }
  }
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
      const contacts: number[] = []
      const steps = predict(bot, world, from, velocity, edge, target, warmup, live, undefined, false, contacts)
      if (steps != null && accept(steps)) {
        if (reboundsAtRim(world, edge, target, steps)) return { steps, warmup, rimRebound: true }
        fallback ??= { steps, warmup, rimRebound: false }
      }
      const adjusted = refine(warmup, false, contacts)
      if (adjusted != null) return adjusted
    }
  }
  if (fallback != null || !allowAirStrafe) return fallback
  const warmups: Warmup[] = [false, ...candidates.map(({ tick }) => ({ firstHopTick: tick, chain: false }))]
  if (from.xzDistanceTo(edge) >= 6) for (let tick = 0; tick <= 12; tick++) warmups.push({ firstHopTick: tick, chain: true })
  for (const warmup of warmups) {
    const contacts: number[] = []
    const steps = predict(bot, world, from, velocity, edge, target, warmup, live, undefined, true, contacts)
    if (steps != null && accept(steps)) return { steps: shortenAirStrafe(bot, world, from, velocity, edge, target, warmup, live, steps, accept), warmup, rimRebound: reboundsAtRim(world, edge, target, steps), airStrafe: true }
    const adjusted = refine(warmup, true, contacts)
    if (adjusted != null) return adjusted
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
  provideMovements (node: Move, storage: Move[], goal: Goal, closed: Set<string>): void {
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
            steps => flightExclusionCost(this, steps) < COST_INF, true, this.settings.allowAirStrafe)
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
          this.addContinuations(node, storage, goal, closed, dir, origin, pos, flight, from, (backup - ahead) * WALK_ONE_BLOCK_COST)
        }
        break
      }
    }
  }

  private addContinuations (node: Move, storage: Move[], goal: Goal, closed: Set<string>, dir: Vec3, edge: Vec3, target: Vec3, flight: Flight, from: Vec3, approachCost: number): void {
    const segments: Segment[] = []
    let steps: Step[] = []
    const preciseRunup = flight.runup != null
    // A short intermediate runway may only work with the incoming flight's
    // speed. Verify its continuation now and execute all its ticks together.
    for (let count = 0; count < 8; count++) {
      let nextEdge = target.floored().offset(0.5, 0, 0.5)
      let length = 0
      while (length < 24) {
        const next = nextEdge.plus(dir)
        if (!this.getBlockInfo(next, 0, -1, 0).solidFull || ![0, 1, 2].every(y => this.getBlockInfo(next, 0, y, 0).walkthrough)) break
        nextEdge = next; length++
      }
      let nextTarget: Vec3 | undefined
      if (length < 24 && isIceBlock(this.getBlockInfo(nextEdge, 0, -1, 0).block?.name) &&
          !this.getBlockInfo(nextEdge, dir.x, -1, dir.z).physical) {
        for (let distance = 2; distance <= 9; distance++) {
          const next = nextEdge.plus(dir.scaled(distance))
          if (![0, 1, 2].every(y => this.getBlockInfo(next, 0, y, 0).walkthrough)) break
          if (!this.getBlockInfo(next, 0, -1, 0).solidFull) continue
          if (distance >= 5) nextTarget = next
          break
        }
      }
      const continueFrom = (candidate: Flight): Flight | undefined => {
        if (nextTarget == null) return
        const landing = candidate.steps[candidate.steps.length - 1]
        return predictMomentumJump(this.bot, this.world, landing.position, landing.velocity, nextEdge, nextTarget,
          false, nextSteps => flightExclusionCost(this, nextSteps) < COST_INF, false, this.settings.allowAirStrafe)
      }
      let continuation = count < 7 ? continueFrom(flight) : undefined
      // Landing at a block's center can leave the wrong tick phase for a short
      // next runway. Try a few real braking trajectories within that same block
      // and accept one only after its next takeoff is also verified.
      if (count > 0 && count < 7 && nextTarget != null && continuation == null) {
        const incoming = steps[steps.length - 1]
        const center = target.floored().offset(0.5, 0, 0.5)
        for (const shift of [-0.25, -0.45, 0.25, 0.45]) {
          const adjustedTarget = center.plus(dir.scaled(shift))
          const adjusted = predictMomentumJump(this.bot, this.world, incoming.position, incoming.velocity, edge, adjustedTarget,
            false, nextSteps => flightExclusionCost(this, nextSteps) < COST_INF, false, this.settings.allowAirStrafe)
          if (adjusted == null) continue
          const next = continueFrom(adjusted)
          if (next == null) continue
          target = adjustedTarget; flight = adjusted; continuation = next
          break
        }
      }
      segments.push({ edge, target, warmup: flight.warmup, rebound: flight.rimRebound,
        contactSpeed: rimContactStep(this.world, edge, target, flight.steps)?.velocity.dot(dir) ?? 0,
        airStrafe: flight.airStrafe === true })
      steps = [...steps, ...flight.steps]
      const landing = steps[steps.length - 1]
      const cost = approachCost + steps.length + flightExclusionCost(this, steps)
      if (cost >= COST_INF) break
      // The executor settles only at the end of the entire chain. Intermediate
      // predictions below use the real landing speed; a later movement starts
      // from rest. Never assign predicted positions or velocity to the bot.
      const move = new Move(landing.position.x, landing.position.y, landing.position.z, [], [], node.remainingBlocks,
        cost, this, node.exitPos, node.exitVel, landing.position.clone(), new Vec3(0, 0, 0), node)
      move.metadata = { momentumEdge: segments[0].edge, momentumRunup: from, momentumWarmup: segments[0].warmup,
        momentumRebound: segments[0].rebound, momentumContactSpeed: segments[0].contactSpeed,
        momentumAirStrafe: segments.some(segment => segment.airStrafe), momentumPreciseRunup: preciseRunup,
        momentumSegments: segments.slice() }
      if (!closed.has(move.hash)) storage.push(move)
      if (goal.isEnd(move)) break

      if (nextTarget == null || continuation == null) break
      edge = nextEdge; target = nextTarget; flight = continuation
    }
  }
}

export class MomentumJumpExecutor extends MovementExecutor {
  private steps: Step[] = []
  private index = 0
  private listener?: () => void
  private landed = false
  private failure?: Error
  private face (yaw: number): void {
    // Update Mineflayer's transmitted look as well as its physics angle. Direct
    // entity assignments alone leave other players seeing a delayed side turn.
    void this.bot.look(yaw, 0, true)
    this.bot.entity.yaw = yaw; this.bot.entity.pitch = 0
  }
  // Ice contact is an intermediate landing in the same flight sequence.
  override get canInterrupt (): boolean { return this.listener == null || this.landed || this.failure != null }
  override reset (): void {
    if (this.listener != null) this.bot.off('physicsTick', this.listener)
    this.listener = undefined; this.steps = []; this.index = 0; this.landed = false; this.failure = undefined
    super.reset()
  }
  private planFromCurrentState (move: Move, position = this.bot.entity.position, velocity = this.bot.entity.velocity, preferredOnly = false): Step[] {
    const segments: Segment[] = move.metadata!.momentumSegments
    const result: Step[] = []
    for (const [index, segment] of segments.entries()) {
      const { edge, target, warmup } = segment
      const live = index === 0
      const incoming = position.xzDistanceTo(edge) < 1.5 && velocity.xzDistanceTo(new Vec3(0, 0, 0)) > 0.32
      const dir = target.minus(edge); dir.y = 0; dir.normalize()
      const accept = (steps: Step[]): boolean => {
        if (flightExclusionCost(this, steps) >= COST_INF) return false
        if (!segment.rebound || incoming) return true
        const contact = rimContactStep(this.world, edge, target, steps)
        return contact != null && contact.velocity.dot(dir) >= segment.contactSpeed * 0.98
      }
      const strafe = this.settings.allowAirStrafe && segment.airStrafe
      let steps = predict(this.bot, this.world, position, velocity, edge, target, warmup, live, undefined, strafe)
      if (steps != null && accept(steps)) {
        if (strafe) steps = shortenAirStrafe(this.bot, this.world, position, velocity, edge, target, warmup, live, steps, accept)
      } else {
        if (preferredOnly) return []
        steps = predictMomentumJump(this.bot, this.world, position, velocity, edge, target, live, accept, false, this.settings.allowAirStrafe)?.steps
      }
      if (steps == null) return []
      result.push(...steps)
      const landing = steps[steps.length - 1]
      position = landing.position; velocity = landing.velocity
    }
    return result
  }
  private alignmentPlan (move: Move, yaw: number): Step[] {
    const target: Vec3 = move.metadata!.momentumRunup
    if (!this.bot.entity.onGround || this.bot.entity.position.xzDistanceTo(target) > 0.3) return []
    const world = { getBlock: (pos: Vec3) => this.world.getBlock(pos) }
    // Plan a short held key followed by coasting, and start the jump at a
    // physically viable position and speed. No millimetre-by-millimetre dithering.
    const tryInputs = (inputs: number[]): Step[] => {
      const control = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: true }
      const state = new PlayerState(this.bot, control); state.yaw = yaw
      const prefix: Step[] = []
      for (let tick = 0; tick < inputs.length + 10; tick++) {
        const forward = inputs[tick] ?? 0
        state.control = { ...control, forward: forward > 0, back: forward < 0 }
        ;(this.bot.physics as any).simulatePlayer(state, world)
        if (!state.onGround || state.isInWater || state.isInLava || state.isCollidedHorizontally) break
        prefix.push({ position: state.pos.clone(), velocity: state.vel.clone(), onGround: state.onGround, yaw,
          jump: false, forward: state.control.forward, back: state.control.back, right: false, preparing: true })
        if (tick < inputs.length - 1 || state.pos.xzDistanceTo(target) > 0.12) continue
        const flight = this.planFromCurrentState(move, state.pos, state.vel, true)
        if (flight.length > 0 && flightExclusionCost(this, [...prefix, ...flight]) < COST_INF) return [...prefix, ...flight]
      }
      return []
    }
    for (let hold = 0; hold <= 4; hold++) for (const forward of (hold === 0 ? [0] : [1, -1])) {
      const steps = tryInputs(Array<number>(hold).fill(forward))
      if (steps.length > 0) return steps
    }
    // Some tick phases need one deliberate braking input. Verify the complete
    // sequence before executing it, rather than reversing keys every tick.
    for (let first = 1; first <= 4; first++) for (let brake = 1; brake <= 4; brake++) for (const forward of [1, -1]) {
      const steps = tryInputs([...Array<number>(first).fill(forward), ...Array<number>(brake).fill(-forward)])
      if (steps.length > 0) return steps
    }
    return []
  }
  private coastToRunup (target: Vec3, yaw: number): void {
    const control = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: true }
    const state = new PlayerState(this.bot, control); state.yaw = yaw
    for (let tick = 0; tick < 12; tick++) (this.bot.physics as any).simulatePlayer(state, { getBlock: (pos: Vec3) => this.world.getBlock(pos) })
    const delta = target.minus(state.pos)
    const forward = -delta.x * Math.sin(yaw) - delta.z * Math.cos(yaw)
    const left = -delta.x * Math.cos(yaw) + delta.z * Math.sin(yaw)
    this.bot.setControlState('forward', forward > 0.025); this.bot.setControlState('back', forward < -0.025)
    this.bot.setControlState('left', left > 0.035); this.bot.setControlState('right', left < -0.035)
    this.bot.setControlState('jump', false); this.bot.setControlState('sprint', false)
    this.bot.setControlState('sneak', this.bot.entity.position.xzDistanceTo(target) < 0.45)
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
    const firstTarget: Vec3 = move.metadata!.momentumSegments[0].target
    const yaw = Math.atan2(edge.x - firstTarget.x, edge.z - firstTarget.z)
    this.face(yaw)
    this.steps = this.alignmentPlan(move, yaw)
    if (this.steps.length > 0) {
      this.startFlight(move)
      return true
    }
    this.coastToRunup(target, yaw)
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
      this.face(step.yaw)
      this.bot.setControlState('sneak', step.preparing === true)
      this.bot.setControlState('sprint', step.preparing !== true); this.bot.setControlState('jump', step.jump)
      this.bot.setControlState('forward', step.forward); this.bot.setControlState('back', step.back)
      this.bot.setControlState('right', step.right)
      this.bot.setControlState('left', step.left === true)
    }
    const listener = (): void => {
      if (this.aborted || this.bot.pathfinder.abortCalculation) { this.bot.off('physicsTick', listener); return }
      const previous = this.steps[this.index - 1]
      if (previous != null && previous.position.distanceTo(this.bot.entity.position) > (move.metadata!.momentumAirStrafe ? 0.02 : 0.4)) this.failure = new CancelError('Momentum jump: server position differs from the predicted flight')
      if (this.index > 0 && this.bot.entity.onGround && this.bot.entity.position.floored().equals(move.exitPos.floored())) this.landed = true
      if (this.landed || this.failure != null) {
        this.bot.off('physicsTick', listener); this.listener = undefined; this.bot.clearControlStates()
        const last: Segment = move.metadata!.momentumSegments.at(-1)
        this.face(Math.atan2(last.edge.x - last.target.x, last.edge.z - last.target.z))
        return
      }
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
