import type { Bot } from 'mineflayer'
import type { Block } from '../types'

/** Some registries put the minimum tool tier tag in the mining material. */
export function miningBlock (block: Block, registry: Bot['registry']): Block {
  if (!block.material?.startsWith('incorrect_for_') || block.harvestTools == null) return block
  const tools = Object.keys(block.harvestTools)
  if (tools.length === 0 || !tools.every(id => registry.items[Number(id)]?.name.endsWith('_pickaxe'))) return block
  // Preserve the actual harvest tiers, shapes and world instance. Only the
  // speed calculation needs the pickaxe material instead of the tier tag.
  const corrected: Block = Object.create(block)
  corrected.material = 'mineable/pickaxe'
  return corrected
}

const installed = new WeakSet<Bot>()
export function installMiningToolMaterials (bot: Bot): void {
  if (installed.has(bot) || typeof bot.digTime !== 'function') return
  const original = bot.digTime.bind(bot)
  bot.digTime = block => original(miningBlock(block, bot.registry))
  installed.add(bot)
}
