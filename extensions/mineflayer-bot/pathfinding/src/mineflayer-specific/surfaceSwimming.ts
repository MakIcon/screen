// SPDX-License-Identifier: GPL-3.0-only
import type { Bot, ControlState } from 'mineflayer'
import { ControlStateHandler, EPhysicsCtx, PlayerState } from '@nxg-org/mineflayer-physics-util'
import { ClimbAwarePhysics } from './climbablePhysics'

const controllers = new WeakMap<Bot, () => void>()

const water = (block: any): boolean => block != null &&
  (['water', 'bubble_column', 'kelp', 'kelp_plant', 'seagrass', 'tall_seagrass'].includes(block.name) || block.getProperties?.().waterlogged === true)

/** Only carry momentum into a new route while there is loaded, open water ahead. */
export function canContinueSwimming (bot: Bot): boolean {
  return (bot.entity as any).swimming === true && (bot.entity as any).isInWater === true &&
    !bot.entity.onGround && bot.health !== 0 && bot.food > 6 && !bot.usingHeldItem &&
    bot.getControlState('forward') && !bot.getControlState('back') &&
    !(bot.entity as any).isCollidedHorizontally &&
    [0.7, 1.8].every(distance => water(bot.blockAt(bot.entity.position.offset(-Math.sin(bot.entity.yaw) * distance, 0, -Math.cos(bot.entity.yaw) * distance))))
}

function surfaceHeight (bot: Bot): number | undefined {
  let block = bot.blockAt(bot.entity.position)
  if (!water(block)) return
  for (let i = 0; i < 8; i++) {
    const above = bot.blockAt(block!.position.offset(0, 1, 0))
    if (above == null) return
    if (!water(above)) {
      const level = block!.name === 'water' ? Number(block!.getProperties().level ?? 0) : 0
      return block!.position.y + 1 - ((level >= 8 ? 0 : level) + 1) / 9
    }
    block = above
  }
}

class SwimmingPhysics extends ClimbAwarePhysics {
  private checkingPose = false

  constructor (registry: Bot['registry']) {
    super(registry)
    // The locked engine includes fluid volumes in updatePoses' clearance check,
    // which prevents entering the swim pose inside water. Pose clearance checks
    // solid collision shapes; actual water detection/current remains unchanged.
    const internal = this as unknown as {
      updatePoses: (context: EPhysicsCtx<PlayerState>, world: any) => void
      isSwimming: (context: EPhysicsCtx<PlayerState>) => boolean
    }
    const updatePoses = internal.updatePoses.bind(this)
    internal.updatePoses = (context, world) => {
      this.checkingPose = true
      try { updatePoses(context, world) } finally { this.checkingPose = false }
    }
    // A swimmer can breathe at the surface while the body is still in water.
    // Checking head immersion here cancels sprint and resets the pose each stroke.
    internal.isSwimming = context => context.state.swimming
  }

  override getWaterInBBs (...args: Parameters<ClimbAwarePhysics['getWaterInBBs']>): ReturnType<ClimbAwarePhysics['getWaterInBBs']> {
    return this.checkingPose ? [] : super.getWaterInBBs(...args)
  }
}

/** Use the planner's modern water physics for live swimming as well. Prismarine
 * physics only implements standing water movement, even with sprint held. */
function installSwimmingPhysics (bot: Bot, travelling: () => boolean): () => void {
  const physics = bot.physics as typeof bot.physics & { simulatePlayer: (state: any, world: any) => any }
  const originalSimulate = physics.simulatePlayer
  let engine: SwimmingPhysics | undefined
  let context: EPhysicsCtx<PlayerState> | undefined
  const simulate = (state: any, world: any): any => {
    if ((bot.entity.onGround && !(bot.entity as any).isInWater) || (!travelling() && !context?.state.swimming)) {
      if (context != null) {
        Object.assign(bot.entity, { swimming: false, sprinting: false, crouching: false, height: 1.8, eyeHeight: 1.62, pose: 0 })
      }
      context = undefined
      return originalSimulate.call(physics, state, world)
    }
    const previousPose = context?.state.pose
    engine ??= new SwimmingPhysics(bot.registry)
    context ??= EPhysicsCtx.FROM_BOT(engine, bot)
    const controls = ControlStateHandler.DEFAULT()
    for (const control of Object.keys(state.control) as ControlState[]) controls.set(control, state.control[control])
    const player = context.state.update(bot, controls)
    if (previousPose != null) player.pose = previousPose
    player.pos.set(state.pos.x, state.pos.y, state.pos.z)
    player.vel.set(state.vel.x, state.vel.y, state.vel.z)
    player.onGround = state.onGround
    player.pitch = state.pitch
    engine.simulate(context, world)
    state.pos.set(player.pos.x, player.pos.y, player.pos.z)
    state.vel.set(player.vel.x, player.vel.y, player.vel.z)
    for (const key of ['onGround', 'isInWater', 'isInLava', 'isInWeb', 'isCollidedHorizontally', 'isCollidedVertically', 'jumpTicks', 'jumpQueued'] as const) {
      state[key] = player[key]
    }
    const extra = {
      swimming: player.swimming, sprinting: player.sprinting, crouching: player.crouching,
      isUnderWater: player.isUnderWater, height: player.height, eyeHeight: player.eyeHeight,
      pose: player.pose,
    }
    const apply = state.apply
    state.apply = (target: Bot): void => {
      apply.call(state, target)
      Object.assign(target.entity, extra)
    }
    return state
  }
  physics.simulatePlayer = simulate
  return () => {
    if (physics.simulatePlayer === simulate) physics.simulatePlayer = originalSimulate
    if (context != null) {
      Object.assign(bot.entity, { swimming: false, sprinting: false, crouching: false, height: 1.8, eyeHeight: 1.62, pose: 0 })
    }
  }
}

/** Sprint-swim when travelling through deep water; tread water while idle or
 * climbing onto shore. Inputs and physics are restored on disposal. */
export function installSurfaceSwimming (bot: Bot, enabled = true): () => void {
  const existing = controllers.get(bot)
  if (existing != null) {
    if (!enabled) existing()
    else return existing
  }
  if (!enabled) return () => {}

  const originalSetControl = bot.setControlState
  let wantedJump = bot.getControlState('jump')
  let wantedSneak = bot.getControlState('sneak')
  let wantedSprint = bot.getControlState('sprint')
  let waterSprint = false
  let alive = true
  let disposed = false
  const modern = bot.registry.version['>']('1.13.2')
  const floating = (): boolean => alive && (bot.entity as any)?.isInWater === true && bot.health !== 0 &&
    bot.launcherSurvival?.kind !== 'mlg' && bot.pathfinder?.currentMove?.metadata?.bucketWaterDrop !== true
  const travelling = (): boolean => floating() && modern && bot.food > 6 &&
    bot.getControlState('forward') && !bot.getControlState('back') && !bot.usingHeldItem &&
    !(bot.entity as any).isCollidedHorizontally &&
    water(bot.blockAt(bot.entity.position.offset(0, -0.8, 0))) &&
    [0.7, 1.8].every(distance => water(bot.blockAt(bot.entity.position.offset(-Math.sin(bot.entity.yaw) * distance, 0, -Math.cos(bot.entity.yaw) * distance))))
  const restorePhysics = modern ? installSwimmingPhysics(bot, travelling) : () => {}
  const applyWaterControls = (): void => {
    const float = floating(), swim = travelling()
    if (!float) {
      originalSetControl.call(bot, 'jump', wantedJump)
      originalSetControl.call(bot, 'sneak', wantedSneak)
      if (waterSprint) originalSetControl.call(bot, 'sprint', wantedSprint)
      waterSprint = false
      return
    }
    const surface = surfaceHeight(bot)
    const eyeY = bot.entity.position.y + ((bot.entity as any).eyeHeight ?? 1.62)
    const headWet = water(bot.blockAt(bot.entity.position.offset(0, (bot.entity as any).eyeHeight ?? 1.62, 0))) &&
      (surface == null || eyeY < surface)
    // Briefly dive to submerge the head and enter vanilla's swim pose.
    // Once swimming, rise only while the eyes are submerged, instead of bobbing.
    // Brake the upward stroke before inertia carries the entire body out of
    // water. Keep the eyes just above the fluid surface so sprint-swim persists.
    const rise = swim
      ? (bot.entity as any).swimming === true && (surface == null
          ? headWet
          : eyeY + Math.max(0, bot.entity.velocity.y) * 4 < surface + 0.04)
      : float
    originalSetControl.call(bot, 'jump', wantedJump || rise)
    originalSetControl.call(bot, 'sneak', (wantedSneak && !float) || (swim && !(bot.entity as any).swimming && !headWet))
    originalSetControl.call(bot, 'sprint', swim || wantedSprint)
    waterSprint = swim
  }
  const setControl = (control: ControlState, value: boolean): void => {
    if (control === 'jump') wantedJump = value
    else if (control === 'sneak') wantedSneak = value
    else if (control === 'sprint') wantedSprint = value
    if (!floating()) {
      originalSetControl.call(bot, control, value)
      return
    }
    if (control === 'jump' || control === 'sneak' || control === 'sprint') {
      applyWaterControls()
      return
    }
    originalSetControl.call(bot, control, value)
    if (control === 'forward' || control === 'back') applyWaterControls()
  }
  const tick = applyWaterControls
  const death = (): void => { alive = false; wantedJump = false; wantedSneak = false; wantedSprint = false; tick() }
  const spawn = (): void => { alive = true; tick() }
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    bot.off('physicsTick', tick)
    bot.off('death', death)
    bot.off('spawn', spawn)
    bot.off('end', dispose)
    if (bot.setControlState === setControl) bot.setControlState = originalSetControl
    originalSetControl.call(bot, 'jump', wantedJump)
    originalSetControl.call(bot, 'sneak', wantedSneak)
    originalSetControl.call(bot, 'sprint', wantedSprint)
    restorePhysics()
    controllers.delete(bot)
  }
  bot.setControlState = setControl
  bot.on('physicsTick', tick)
  bot.on('death', death)
  bot.on('spawn', spawn)
  bot.once('end', dispose)
  controllers.set(bot, dispose)
  tick()
  return dispose
}
