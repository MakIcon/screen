import type { Bot } from 'mineflayer'

export interface ItemEnchantment { name: string; lvl: number }
type Registry = Pick<Bot['registry'], 'enchantments'>

/** Keep command-provided levels; modern components contain registry IDs. */
export function normalizeEnchantments (value: unknown, registry?: Registry): ItemEnchantment[] {
  if (value == null || typeof value !== 'object') return []
  const data = value as Record<string, unknown>
  const entries = Array.isArray(value) ? value : Array.isArray(data.enchantments) ? data.enchantments
    : Object.entries((data.levels ?? data) as Record<string, unknown>).map(([id, level]) => ({ id, level }))
  const result: ItemEnchantment[] = []
  for (const entry of entries) {
    if (entry == null || typeof entry !== 'object') continue
    const id = entry.name ?? entry.id
    const numericId = typeof id === 'number' ? id : typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : undefined
    const rawName = numericId != null ? registry?.enchantments?.[numericId]?.name : id
    const name = typeof rawName === 'string' ? rawName.replace(/^minecraft:/, '') : ''
    const level = entry.lvl ?? entry.level
    if (!name || typeof level !== 'number' || !Number.isInteger(level) || level <= 0) continue
    result.push({ name, lvl: level })
  }
  return result
}

function componentEnchantments (item: any): unknown {
  const type = item?.name === 'enchanted_book' ? 'stored_enchantments' : 'enchantments'
  return item?.componentMap?.get(type)?.data ?? item?.componentMap?.get(`minecraft:${type}`)?.data
}

export function getItemEnchantments (item: any, registry?: Registry): ItemEnchantment[] {
  return normalizeEnchantments(componentEnchantments(item) ?? item?.enchants, registry)
}

const installed = new WeakSet<Bot>()
const patched = new WeakSet<object>()

/** Normalize the getter for Mineflayer and dependency plugins, without editing wire components. */
export function installItemEnchantmentCompatibility (bot: Bot): void {
  if (installed.has(bot)) return
  const registry = bot.registry
  const inventory = bot.inventory
  const patch = (item: any): void => {
    if (item == null) return
    let prototype = Object.getPrototypeOf(item)
    while (prototype != null && prototype !== Object.prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'enchants')
      if (descriptor?.get != null) {
        if (patched.has(prototype) || descriptor.configurable === false) return
        const original = descriptor.get
        Object.defineProperty(prototype, 'enchants', { ...descriptor, get () {
          return normalizeEnchantments(componentEnchantments(this) ?? original.call(this), registry)
        } })
        patched.add(prototype)
        return
      }
      prototype = Object.getPrototypeOf(prototype)
    }
  }
  for (const item of inventory.slots) patch(item)
  patch(bot.heldItem)
  const onSlot = (_slot: number, _old: any, item: any): void => { patch(item) }
  const cleanup = (): void => { inventory.off('updateSlot', onSlot) }
  inventory.on('updateSlot', onSlot)
  bot.once('end', cleanup)
  installed.add(bot)
}
