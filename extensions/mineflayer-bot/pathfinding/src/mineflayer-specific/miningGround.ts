import type { Bot } from 'mineflayer'
import { CancelError } from './exceptions'

/** Mineflayer fixes the airborne penalty for the whole dig when it starts. */
export async function waitForMiningGround (bot: Bot, canceled: () => boolean = () => false): Promise<void> {
  for (const control of ['forward', 'back', 'left', 'right', 'sprint', 'jump'] as const) bot.setControlState(control, false)
  for (let tick = 0; !bot.entity.onGround && !(bot.entity as any).isInWater; tick++) {
    if (canceled()) throw new CancelError('Mining canceled before landing')
    if (tick >= 20) throw new CancelError('Mining requires supported footing')
    // Keep cancellation bounded even when physics stops on disconnect.
    await new Promise<void>(resolve => setTimeout(resolve, 50))
  }
  if (canceled()) throw new CancelError('Mining canceled before starting')
}
