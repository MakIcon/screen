import { Bot } from 'mineflayer'
import type { Block } from './types'
import type { Item } from 'prismarine-item'
import { miningBlock } from './mineflayer-specific/miningTools'
import { getItemEnchantments } from './mineflayer-specific/itemEnchantments'

export interface DigEnvironment { inWater: boolean; notOnGround: boolean }

export class PathingUtil {
  private items: Item[] = []
  private tools: Item[] = []

  private memoedDigSpeed: { [key: string]: number } = {}
  private memoedBestTool: { [key: string]: Item | null } = {}

  constructor (private readonly bot: Bot) {
    this.refresh()
  }

  public refresh (): void {
    this.items = this.bot.inventory.items()
    this.tools = this.items.filter(
      (item) => item.name.includes('pickaxe') || item.name.includes('axe') || item.name.includes('shovel') || item.name.includes('hoe') || item.name.includes('shears')
    )
    this.memoedDigSpeed = {}
    this.memoedBestTool = {}
  }

  private environment (): DigEnvironment {
    const eyeHeight = (this.bot.entity as { eyeHeight?: number }).eyeHeight ?? 1.62
    const eye = this.bot.blockAt(this.bot.entity.position.offset(0, eyeHeight, 0))
    return { inWater: eye?.name === 'water' || eye?.name === 'flowing_water', notOnGround: !this.bot.entity.onGround }
  }

  public bestHarvestingTool (block: Block, environment = this.environment()): Item | null {
    if (block === null) return null
    block = miningBlock(block, this.bot.registry)
    const key = `${block.type}:${Number(environment.inWater)}:${Number(environment.notOnGround)}`
    if (key in this.memoedBestTool) return this.memoedBestTool[key]

    const availableTools = this.tools
    const effects = this.bot.entity.effects

    const creative = this.bot.game.gameMode === 'creative'

    const helmet = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('head')]
    const helmetEnchants = getItemEnchantments(helmet, this.bot.registry)
    let fastest = block.digTime(null, creative, environment.inWater, environment.notOnGround, helmetEnchants, effects)
    let bestTool: Item | null = null

    // if (creative === false)
    for (const tool of availableTools) {
      const enchants = getItemEnchantments(tool, this.bot.registry).concat(helmetEnchants)
      const digTime = block.digTime(tool.type, creative, environment.inWater, environment.notOnGround, enchants, effects)
      if (digTime < fastest) {
        fastest = digTime
        bestTool = tool
      }
    }

    this.memoedBestTool[key] = bestTool
    this.memoedDigSpeed[key] = fastest
    return bestTool
  }

  public digCost (block: Block, environment = this.environment()): number {
    const key = `${block.type}:${Number(environment.inWater)}:${Number(environment.notOnGround)}`
    if (this.memoedDigSpeed[key] != null) return this.memoedDigSpeed[key]
    this.bestHarvestingTool(block, environment)

    return this.memoedDigSpeed[key]
  }
}
