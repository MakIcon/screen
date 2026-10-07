// SPDX-License-Identifier: GPL-3.0-only
import type { Bot, ControlState } from 'mineflayer'

const controllers = new WeakMap<Bot, () => void>()

/** An input overlay using Mineflayer's normal water-jump physics, including while idle. */
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
  let alive = true
  let disposed = false
  const floating = (): boolean => alive && (bot.entity as any)?.isInWater === true && bot.health !== 0
  const setControl = (control: ControlState, value: boolean): void => {
    if (control === 'jump') { wantedJump = value; value = value || floating() }
    if (control === 'sneak') { wantedSneak = value; value = value && !floating() }
    originalSetControl.call(bot, control, value)
  }
  const tick = (): void => {
    originalSetControl.call(bot, 'jump', wantedJump || floating())
    originalSetControl.call(bot, 'sneak', wantedSneak && !floating())
  }
  const death = (): void => { alive = false; wantedJump = false; wantedSneak = false; tick() }
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
