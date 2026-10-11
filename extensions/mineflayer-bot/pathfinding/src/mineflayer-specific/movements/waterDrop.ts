import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Move } from '../move'
import type { Goal } from '../goals'
import type { World } from '../world/worldInterface'
import { Movement } from './movement'
import { MovementProvider } from './movementProvider'
import { MovementExecutor } from './movementExecutor'
import { CancelError } from '../exceptions'
import { COST_INF } from './costs'

const { PlayerState } = require('prismarine-physics')
const Block = require('prismarine-block')
const log = require('debug')('minecraft-pathfinding:water-drop')
const { toNotchianYaw, toNotchianPitch } = require('mineflayer/lib/conversions')
const MAX_TICKS = 160
const REACH = 4.5
type Flight = { ticks: number, position: Vec3, velocity: Vec3 }

function waterBucket (bot: Bot): ReturnType<Bot['inventory']['items']>[number] | undefined {
  return bot.inventory.items().find(item => item.name === 'water_bucket')
}

function permitsWater (bot: Bot): boolean {
  const game = bot.game as typeof bot.game & { dimension: string, dimensionData?: { ultrawarm?: boolean } }
  return !String(game.dimension).includes('nether') && game.dimensionData?.ultrawarm !== true
}

/** Identical inputs are used by prediction and live execution. No invented impulse. */
function flightControls (pos: Vec3, vel: Vec3, target: Vec3, sprint: boolean, jump: boolean) {
  const delta = target.minus(pos); delta.y = 0
  const correction = delta.minus(new Vec3(vel.x, 0, vel.z).scaled(3))
  const yaw = Math.atan2(-correction.x, -correction.z)
  return { yaw, controls: {
    forward: correction.norm() > 0.1, back: false, left: false, right: false,
    jump, sprint: sprint && delta.norm() > 1, sneak: false
  } }
}

function supportHit (world: World, pos: Vec3, target: Vec3): boolean {
  const eye = pos.offset(0, 1.62, 0)
  const top = target.offset(0, -0.01, 0)
  const delta = top.minus(eye)
  if (delta.norm() > REACH) return false
  const hit = world.raycast(eye, delta.normalize(), REACH)
  return hit != null && hit.position.equals(target.floored().offset(0, -1, 0))
}

/** Run Minecraft's own physics against loaded blocks, including gravity,
 * friction, effects, body collisions and the real water entry tick.
 * A bucket simulation adds water only once its support can actually be used.
 */
export function predictWaterDrop (bot: Bot, world: World, from: Vec3, velocity: Vec3,
  target: Vec3, bucket: boolean, sprint: boolean, live = false): Flight | undefined {
  const state = new PlayerState(bot, {})
  state.pos = from.clone(); state.vel = velocity.clone()
  state.onGround = live ? bot.entity.onGround : true
  state.isInWater = false; state.isInLava = false
  state.jumpTicks = 0; state.jumpQueued = false
  let invalid = false, placed = false, airborne = false, wet = false
  const source = Block(bot.registry).fromStateId(bot.registry.blocksByName.water.minStateId, 0)
  source.position = target.floored()
  const facade = { getBlock: (pos: Vec3) => {
    const info = world.getBlockInfo(pos)
    if (info.isInvalid || !info.safe) invalid = true
    if (placed && pos.floored().equals(source.position)) return source
    return world.getBlock(pos)
  } }
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const input = flightControls(state.pos, state.vel, target, sprint && !wet,
      (tick === 0 && state.onGround) || (wet && !bucket))
    state.yaw = input.yaw; state.control = input.controls
    if (bucket && !placed && state.vel.y < -0.1 && state.pos.y - target.y < 3.1 &&
      state.pos.y > target.y + 0.8 && supportHit(world, state.pos, target)) placed = true
    ;(bot.physics as any).simulatePlayer(state, facade)
    airborne ||= !state.onGround
    const waterAtFeet = world.getBlockInfo(state.pos.offset(0, 0.1, 0)).water ||
      (placed && state.pos.floored().equals(source.position))
    wet ||= state.isInWater || (state.onGround && waterAtFeet)
    if (invalid || state.isInLava || state.isCollidedHorizontally || (!waterAtFeet && state.pos.y < target.y - 1)) {
      log('reject tick=%s pos=%O target=%O invalid=%s lava=%s wall=%s', tick, state.pos, target, invalid, state.isInLava, state.isCollidedHorizontally)
      return
    }
    if (wet) {
      if ((!bucket || placed) && state.pos.xzDistanceTo(target) < 0.45 &&
        Math.abs(state.pos.y - target.y) < 1.1) {
        return { ticks: tick + 1, position: state.pos.clone(), velocity: state.vel.clone() }
      }
    }
    if (airborne && state.onGround) {
      // One-block puddles can land on the bottom in the same tick as water
      // entry. Require water intersecting the feet before accepting that tick.
      const foot = facade.getBlock(state.pos.offset(0, 0.1, 0))
      if (foot?.name !== 'water' || state.pos.xzDistanceTo(target) >= 0.45) { log('dry ground at %O', state.pos); return }
    }
  }
}

export class WaterDrop extends MovementProvider {
  movementDirs = [...Movement.cardinalDirs, ...Movement.diagonalDirs]

  provideMovements (start: Move, storage: Move[], goal: Goal, closed: Set<string>): void {
    if (!this.settings.allowWaterDrop && !this.settings.allowBucketWaterDrop) return
    if (!this.getBlockInfo(start, 0, -1, 0).physical || this.getBlockInfo(start, 0, 0, 0).liquid) return
    const bucketAvailable = this.settings.allowBucketWaterDrop && permitsWater(this.bot) && waterBucket(this.bot) != null
    if (!this.settings.allowWaterDrop && !bucketAvailable) return
    const minY = Math.max(this.world.minY ?? (this.bot.game as any).minY ?? -64, start.y - 128)
    for (const dir of this.movementDirs) {
      // Walk to a real edge first; don't spend simulation time on flat ground.
      if (this.getBlockInfo(start, dir.x, -1, dir.z).physical) continue
      for (let distance = 1; distance <= (this.settings.allowWaterDrop ? 12 : 4); distance++) {
        const column = start.cachedVec.offset(dir.x * distance, 0, dir.z * distance)
        let target: Vec3 | undefined, bucket = false
        for (let y = start.y; y >= minY; y--) {
          const info = this.getBlockInfoRaw(new Vec3(column.x, y, column.z))
          if (info.isInvalid || !info.safe || (info.liquid && !info.water)) break
          if (info.water) {
            if (this.settings.allowWaterDrop && y < start.y - 1 &&
              (this.settings.infiniteLiquidDropdownDistance || start.y - y <= this.settings.maxDropDown)) target = info.position.offset(0.5, 0.1, 0.5)
            break
          }
          if (info.physical) {
            if (bucketAvailable && distance <= 4 && info.solidFull && start.y - info.height > this.settings.maxDropDown &&
              this.getBlockInfoRaw(info.position.offset(0, 1, 0)).block?.name === 'air') {
              target = info.position.offset(0.5, 1, 0.5); bucket = true
            }
            break
          }
          if (!info.walkthrough) break
        }
        if (target == null || closed.has(`${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`)) continue
        const head = this.getBlockInfoRaw(target.floored().offset(0, 1, 0))
        if (!head.safe || !head.walkthrough) continue
        const exclusion = this.exclusionStep(this.getBlockInfoRaw(target.floored())) +
          (bucket ? this.exclusionPlace(this.getBlockInfoRaw(target.floored())) : 0)
        if (exclusion >= COST_INF) continue
        const flight = predictWaterDrop(this.bot, this.world, start.exitPos, new Vec3(0, 0, 0),
          target, bucket, this.settings.allowSprinting)
        if (flight == null) continue
        const move = Move.fromPrevious(flight.ticks + exclusion + (bucket ? 20 : 0), target, start, this)
        move.metadata = { waterLanding: true, bucketWaterDrop: bucket, waterDropTicks: flight.ticks }
        storage.push(move)
      }
    }
  }
}

/** Equip before takeoff, place while the support is in reach, and collect only
 * after immersion has arrested the fall and the player has reached the floor.
 */
export class WaterDropExecutor extends MovementExecutor {
  private generation = 0
  private launched = false
  private wet = false
  private placed = false
  private collected = false
  private attempts = 0
  private lastUse = -10
  private started = 0
  private flightTicks = 0
  private previousItem?: ReturnType<Bot['inventory']['items']>[number]

  override get canInterrupt (): boolean { return !this.launched || (this.wet && !this.currentMove.metadata?.bucketWaterDrop) || this.collected }
  override reset (): void {
    this.generation++
    this.launched = false; this.wet = false; this.placed = false; this.collected = false
    this.attempts = 0; this.lastUse = -10; this.started = 0; this.flightTicks = 0
    this.previousItem = undefined
    super.reset()
  }
  isAlreadyCompleted (move: Move): boolean {
    return !move.metadata?.bucketWaterDrop && (this.bot.entity as any).isInWater === true &&
      this.bot.entity.position.xzDistanceTo(move.exitPos) < 0.45
  }
  align (move: Move): boolean {
    const pos = this.bot.entity.position
    // The trajectory is rechecked from the actual takeoff state in init.
    if (!this.bot.entity.onGround) throw new CancelError('Water drop needs a supported takeoff')
    if (pos.xzDistanceTo(move.entryPos) < 0.2 && Math.hypot(this.bot.entity.velocity.x, this.bot.entity.velocity.z) < 0.03) return true
    const input = flightControls(pos, this.bot.entity.velocity, move.entryPos, false, false)
    this.applyControls(input)
    return false
  }
  async performInit (move: Move): Promise<void> {
    const generation = this.generation
    const bucket = move.metadata?.bucketWaterDrop === true
    if (bucket) {
      const item = waterBucket(this.bot)
      if (!permitsWater(this.bot) || item == null ||
        this.world.getBlock(move.exitPos)?.name !== 'air' ||
        !this.world.getBlockInfo(move.exitPos.offset(0, -1, 0)).solidFull) throw new CancelError('Water bucket landing unavailable for drop')
      this.previousItem = this.bot.heldItem ?? undefined
      await this.bot.equip(item, 'hand')
      if (generation !== this.generation) return
    }
    if (predictWaterDrop(this.bot, this.world, this.bot.entity.position, this.bot.entity.velocity,
      move.exitPos, bucket, this.settings.allowSprinting, true) == null) {
      throw new CancelError('Water drop trajectory is no longer safe')
    }
    this.started = performance.now()
  }
  public acceptsWorldUpdate (position: Vec3, name: string): boolean {
    if (!this.currentMove?.metadata?.bucketWaterDrop || !this.placed) return false
    const source = this.currentMove.exitPos.floored()
    if (position.equals(source)) return name === 'water' || (name === 'air' && this.attempts > 0)
    // Water placed by this move can flow sideways and down while we land.
    return name === 'water' && position.y <= source.y && position.xzDistanceTo(source) <= 7
  }
  private applyControls (input: ReturnType<typeof flightControls>): void {
    this.bot.entity.yaw = input.yaw
    for (const [name, value] of Object.entries(input.controls)) this.bot.setControlState(name as keyof typeof input.controls, value)
  }
  private async useBucket (point: Vec3, generation: number): Promise<void> {
    await this.bot.lookAt(point, true)
    if (generation !== this.generation) return
    // Older protocols raycast with the last server-side rotation. Send the
    // look before use_item instead of waiting another falling physics tick.
    this.bot._client.write('look', {
      yaw: Math.fround(toNotchianYaw(this.bot.entity.yaw)),
      pitch: Math.fround(toNotchianPitch(this.bot.entity.pitch)),
      onGround: this.bot.entity.onGround,
      flags: { onGround: this.bot.entity.onGround, hasHorizontalCollision: (this.bot.entity as any).isCollidedHorizontally }
    })
    this.bot.activateItem()
  }
  async performPerTick (move: Move): Promise<boolean> {
    const generation = this.generation
    const pos = this.bot.entity.position, vel = this.bot.entity.velocity
    log('execute pos=%O wet=%s ground=%s collected=%s item=%s', pos, this.wet, this.bot.entity.onGround, this.collected, this.bot.heldItem?.name)
    const bucket = move.metadata?.bucketWaterDrop === true
    if (performance.now() - this.started > MAX_TICKS * 50 + this.settings.movementTimeoutMs) throw new CancelError('Water drop timed out')
    this.wet ||= (this.bot.entity as any).isInWater === true ||
      (this.bot.entity.onGround && this.world.getBlockInfo(pos.offset(0, 0.1, 0)).water)
    const input = flightControls(pos, vel, move.exitPos, this.settings.allowSprinting, !this.launched)
    if (this.wet) { input.controls.jump = !bucket; input.controls.sprint = false }
    this.applyControls(input)
    this.launched = true
    this.flightTicks++
    if (bucket && !this.placed && vel.y < -0.1 && pos.y - move.exitPos.y < 3.1 &&
      supportHit(this.world, pos, move.exitPos)) {
      if (this.bot.heldItem?.name !== 'water_bucket') throw new CancelError('Water bucket lost during drop')
      this.placed = true
      await this.useBucket(move.exitPos.offset(0, -0.01, 0), generation)
    }
    if (!bucket && this.wet && pos.xzDistanceTo(move.exitPos) < 0.5 && Math.abs(pos.y - move.exitPos.y) < 1.1) return true
    if (bucket && this.wet && this.bot.entity.onGround && Math.abs(vel.y) < 0.12 && pos.xzDistanceTo(move.exitPos) < 0.45) {
      if (this.collected || (this.attempts > 0 && this.bot.heldItem?.name === 'water_bucket')) {
        this.collected = true
        if (this.previousItem != null && this.previousItem.name !== 'water_bucket') {
          const item = this.bot.inventory.items().find(item => item.type === this.previousItem?.type)
          if (item != null) await this.bot.equip(item, 'hand')
        }
        return true
      }
      const source = this.world.getBlock(move.exitPos.floored())
      if (source?.name !== 'water' || Number(source.getProperties().level) !== 0) throw new CancelError('Placed water source was removed')
      if (this.bot.heldItem?.name === 'bucket' && this.flightTicks - this.lastUse >= 6) {
        if (this.attempts >= 3) throw new CancelError('Server did not confirm water collection')
        this.lastUse = this.flightTicks; this.attempts++
        await this.useBucket(move.exitPos.offset(0, 0.5, 0), generation)
      }
    }
    if (!this.wet && this.bot.entity.onGround && this.flightTicks > 3) throw new CancelError('Water drop missed its landing')
    return false
  }
}
