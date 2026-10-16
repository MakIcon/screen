// SPDX-License-Identifier: GPL-3.0-only
import type { Bot, ControlState } from 'mineflayer'
import { clearBodySegment, supportedWalkSegment } from './navigationGeometry'
import { climbableNames } from './climbablePhysics'

const controllers = new WeakMap<Bot, () => void>()

/** Repeated sprint jumps beneath a two-block ceiling, using normal inputs.
 * Release jump in the air so the next landing can jump without autojump delay.
 * Shared by route walking and direct combat pursuit. */
export function installLowCeilingJumps (bot: Bot, enabled = true): () => void {
  const existing = controllers.get(bot)
  if (existing != null) {
    if (!enabled) existing()
    else return existing
  }
  if (!enabled) return () => {}

  const originalSet = bot.setControlState
  let wantedJump = bot.getControlState('jump')
  let injecting = false
  let alive = true
  let disposed = false

  const ownsMovement = (): boolean => {
    const entity = bot.entity as any
    const move = bot.pathfinder?.currentMove
    return alive && bot.health !== 0 && bot.food > 6 && !bot.usingHeldItem &&
      !entity?.isInWater && !entity?.isInLava && !entity?.isInWeb && !entity?.elytraFlying &&
      !bot.launcherSurvival?.busy && !(bot as any).launcherAxeAttacking &&
      !(bot as any).launcherPearling && !(bot as any).launcherDefendingBow && !bot.targetDigBlock &&
      bot.pathfinder?.defaultMoveSettings.allowSprinting !== false &&
      bot.pathfinder?.defaultMoveSettings.allowLowCeilingJumps !== false &&
      bot.getControlState('forward') && bot.getControlState('sprint') &&
      !bot.getControlState('back') && !bot.getControlState('sneak') &&
      (move == null || (move.toBreak.length === 0 && move.toPlace.length === 0 &&
        ['Forward', 'Diagonal'].includes(move.moveType.constructor.name)))
  }

  const canHop = (): boolean => {
    const entity = bot.entity
    if (!entity?.onGround || !ownsMovement()) return false

    const world = bot.pathfinder?.world
    if (world == null) return false

    const pos = entity.position
    if (world.getBlockInfo(pos).climbable || climbableNames.has(world.getBlockInfo(pos).block?.name ?? '')) return false
    const strafe = Number(bot.getControlState('right')) - Number(bot.getControlState('left'))
    const direction = pos.scaled(0)
    direction.set(-Math.sin(entity.yaw) + Math.cos(entity.yaw) * strafe, 0,
      -Math.cos(entity.yaw) - Math.sin(entity.yaw) * strafe).normalize()
    const speed = Math.hypot(entity.velocity.x, entity.velocity.z)
    if (speed > 0.08 && entity.velocity.x * direction.x + entity.velocity.z * direction.z < speed * 0.8) return false
    const distance = Math.max(1.4, speed * 4 + 0.6)
    const ahead = pos.plus(direction.scaled(distance))
    // Check the complete footprint and braking corridor. Gaps, corners, steps,
    // hazards and unloaded terrain keep their existing movement controllers.
    if (!clearBodySegment(world, pos, ahead) || !supportedWalkSegment(world, pos, ahead)) return false
    for (let d = 0; d <= distance; d += 0.2) {
      const feet = world.getBlockInfo(pos.plus(direction.scaled(d)))
      if (feet.liquid || feet.climbable) return false
    }
    for (let x = Math.floor(pos.x - 0.299); x <= Math.floor(pos.x + 0.299); x++) {
      for (let z = Math.floor(pos.z - 0.299); z <= Math.floor(pos.z + 0.299); z++) {
        for (let y = Math.floor(pos.y + 1.8); y <= Math.floor(pos.y + 2.25); y++) {
          const block = world.getBlockInfo(pos.offset(x - pos.x, y - pos.y, z - pos.z))
          if (block.isInvalid || !block.safe) return false
          if (block.getBBs().some(box => box.minY >= pos.y + 1.8 - 1e-5 && box.minY <= pos.y + 2.25 &&
              box.maxX > pos.x - 0.299 && box.minX < pos.x + 0.299 &&
              box.maxZ > pos.z - 0.299 && box.minZ < pos.z + 0.299)) return true
        }
      }
    }
    return false
  }

  const apply = (): void => {
    const hop = canHop()
    if (hop) {
      injecting = true
      originalSet.call(bot, 'jump', true)
    } else if (injecting && !bot.entity.onGround && ownsMovement()) {
      originalSet.call(bot, 'jump', false)
    } else {
      injecting = false
      originalSet.call(bot, 'jump', wantedJump)
    }
  }
  const setControl = (control: ControlState, value: boolean): void => {
    if (disposed) { originalSet.call(bot, control, value); return }
    if (control === 'jump') wantedJump = value
    else originalSet.call(bot, control, value)
    apply()
  }
  const death = (): void => { alive = false; wantedJump = false; injecting = false; originalSet.call(bot, 'jump', false) }
  const spawn = (): void => { alive = true }
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    bot.off('physicsTick', apply)
    bot.off('death', death)
    bot.off('spawn', spawn)
    bot.off('end', dispose)
    if (bot.setControlState === setControl) bot.setControlState = originalSet
    originalSet.call(bot, 'jump', wantedJump)
    controllers.delete(bot)
  }
  bot.setControlState = setControl
  bot.on('physicsTick', apply)
  bot.on('death', death)
  bot.on('spawn', spawn)
  bot.once('end', dispose)
  controllers.set(bot, dispose)
  return dispose
}
