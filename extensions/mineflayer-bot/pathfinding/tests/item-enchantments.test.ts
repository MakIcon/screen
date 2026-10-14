import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, getItemEnchantments, normalizeEnchantments, installItemEnchantmentCompatibility } from '../src'
import { createCacheWorld, loadMcData } from './setup'

const expected = [{ name: 'efficiency', lvl: 20 }, { name: 'unbreaking', lvl: 100 }]
function componentItem (registry: any, name: string, enchantments = expected, type = 'enchantments') {
  const Item = require('prismarine-item')(registry)
  const packet = { itemCount: 1, itemId: registry.itemsByName[name].id,
    components: [{ type, data: { enchantments: enchantments.map(({ name, lvl }) =>
      ({ id: registry.enchantmentsByName[name].id, level: lvl })) } }], removeComponents: [] }
  return { item: Item.fromNotch(packet), Item, packet }
}

for (const version of ['1.20.5', '1.21.5', '26.1.2']) test(`component enchantments keep registry names and command levels on ${version}`, () => {
  const { mcData } = loadMcData(version)
  for (const name of ['netherite_axe', 'netherite_shovel']) {
    const { item, Item } = componentItem(mcData, name)
    const before = structuredClone(Item.toNotch(item))
    assert.deepEqual(getItemEnchantments(item, mcData), expected)
    assert.deepEqual(Item.toNotch(item), before, 'reading never edits the server components')
  }
  const { item: book } = componentItem(mcData, 'enchanted_book', expected, 'stored_enchantments')
  assert.deepEqual(getItemEnchantments(book, mcData), expected)
})

test('legacy arrays and named component maps keep custom levels and reject malformed entries', () => {
  assert.deepEqual(normalizeEnchantments(expected), expected)
  assert.deepEqual(normalizeEnchantments({ 'minecraft:efficiency': 20, 'minecraft:unbreaking': 100 }), expected)
  assert.deepEqual(normalizeEnchantments({ levels: { 'minecraft:efficiency': 20 }, showTooltip: false }), expected.slice(0, 1))
  assert.deepEqual(normalizeEnchantments([null, { id: 999999, level: 20 }, { name: 'efficiency', lvl: NaN },
    { name: 'unbreaking', lvl: -1 }]), [])
  assert.deepEqual(getItemEnchantments(null), [])
})

test('real Mineflayer dig timing and tool selection consume 26.1.2 component enchantments', async (t) => {
  const { rig, world } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
  t.after(async () => { await rig.bot.pathfinder?.destroy(); rig.stopPassivePhysics() })
  const { item: axe, Item } = componentItem(rig.mcData, 'netherite_axe')
  const { item: shovel } = componentItem(rig.mcData, 'netherite_shovel')
  axe.slot = 36; shovel.slot = 37
  rig.bot.inventory.slots[36] = axe; rig.bot.inventory.slots[37] = shovel
  rig.bot.updateHeldItem()
  const axeWire = structuredClone(Item.toNotch(axe))
  rig.bot.loadPlugin(createPlugin())
  // Exercise the shipped Mineflayer digging plugin, not a fake timing helper.
  rig.bot.loadPlugin(require('mineflayer/lib/plugins/digging'))
  await rig.bot.waitForTicks(2)
  assert.deepEqual(axe.enchants, expected, 'dependency plugins receive an array too')
  assert.deepEqual(shovel.enchants, expected)
  const log = world.setBlock(new Vec3(1, 64, 0), 'oak_log')
  const dirt = world.setBlock(new Vec3(2, 64, 0), 'dirt')
  assert.ok(rig.bot.digTime(log) <= 50)
  assert.equal(rig.bot.pathingUtil.bestHarvestingTool(log), axe)
  assert.equal(rig.bot.pathingUtil.bestHarvestingTool(dirt), shovel)
  assert.ok(rig.bot.pathingUtil.digCost(dirt) <= 50)
  assert.deepEqual(Item.toNotch(axe), axeWire)
})

test('items received after an empty login are compatible and inventory listeners are disposed', () => {
  const { rig } = createCacheWorld('26.1.2', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
  try {
    const baseline = rig.bot.inventory.listenerCount('updateSlot')
    installItemEnchantmentCompatibility(rig.bot)
    installItemEnchantmentCompatibility(rig.bot)
    assert.equal(rig.bot.inventory.listenerCount('updateSlot'), baseline + 1)
    const { item, Item } = componentItem(rig.mcData, 'netherite_shovel')
    const before = structuredClone(Item.toNotch(item))
    rig.bot.inventory.slots[9] = item
    rig.bot.inventory.emit('updateSlot', 9, null, item)
    assert.deepEqual(item.enchants, expected)
    assert.deepEqual(Item.toNotch(item), before)
    rig.bot.emit('end')
    assert.equal(rig.bot.inventory.listenerCount('updateSlot'), baseline)
  } finally { rig.stopPassivePhysics() }
})

test('legacy item NBT enchantments remain compatible with Mineflayer plugins', () => {
  const { rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5), { renderDistance: 1 })
  try {
    const Item = require('prismarine-item')(rig.mcData)
    const item = new Item(rig.mcData.itemsByName.netherite_axe.id, 1)
    item.enchants = expected
    rig.bot.inventory.slots[9] = item
    const before = structuredClone(Item.toNotch(item))
    installItemEnchantmentCompatibility(rig.bot)
    assert.deepEqual(item.enchants, expected)
    assert.deepEqual(Item.toNotch(item), before)
  } finally { rig.stopPassivePhysics() }
})
