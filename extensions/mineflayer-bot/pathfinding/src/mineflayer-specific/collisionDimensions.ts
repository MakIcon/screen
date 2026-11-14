import type { Bot } from 'mineflayer'

/** Keep wall contact outside the server's float-sized player hitbox. */
export function installCollisionDimensions (bot: Bot): void {
  if (!bot.version.startsWith('26.')) return
  const physics = bot.physics as typeof bot.physics & { playerHalfWidth: number }
  // EntityDimensions stores 0.6 as a Java float, then promotes it to double
  // when constructing the AABB. Decimal 0.3 clips into walls by ~1.2e-8.
  // Preserve custom hitboxes and older protocol physics.
  if (physics?.playerHalfWidth === 0.3) physics.playerHalfWidth = Math.fround(0.6) / 2
}
