'use strict'

const { fabricHandshake } = require('./handshake')
const { FabricProtocolError } = require('./binary')
const { loadProtocol } = require('./protocol')
const { MineflayerAdapter, guardWindows } = require('./adapter')
const attached = new WeakMap()
const MODES = ['adapt', 'strict', 'vanilla', 'none']

// Registry sync supplies names/IDs, NOT collision shapes, block states, item
// components or mob metadata serializers. Strict mode refuses mod content.
function validateMineflayerRegistry (registry, sync) {
  const checks = [
    ['minecraft:block', 'blocksByName'],
    ['minecraft:item', 'itemsByName'],
    ['minecraft:entity_type', 'entitiesByName'],
    ['minecraft:mob_effect', 'effectsByName']
  ]
  const incompatible = []
  for (const [registryName, property] of checks) {
    const table = sync.registries.get(registryName)
    if (!table) continue
    if (!registry?.[property]) {
      incompatible.push(registryName + ': Mineflayer data unavailable')
      continue
    }
    for (const [name, id] of table.entries) {
      let local = registry[property][name] || (name.startsWith('minecraft:') && registry[property][name.slice(10)])
      // minecraft-data uses display-style effect keys (Speed, MiningFatigue).
      if (!local && property === 'effectsByName' && name.startsWith('minecraft:')) {
        let key = name.slice(10).replaceAll('_', '')
        if (key === 'unluck') key = 'badluck'
        local = Object.values(registry[property]).find(effect => effect.name.toLowerCase() === key)
      }
      if (!local || local.id !== id) {
        incompatible.push(name + ' (server ID ' + id + ', client ' + (local?.id ?? 'unknown') + ')')
      }
    }
  }
  if (incompatible.length) {
    throw new FabricProtocolError('FABRIC_REGISTRY_INCOMPATIBLE',
      'Mineflayer needs a mod-specific data adapter before registry sync can be acknowledged: ' +
      incompatible.slice(0, 8).join(', ') + (incompatible.length > 8 ? ', ...' : '') +
      '. Use registryValidation: "adapt" (default) for placeholders, or supply onRegistry with accurate data.')
  }
}

function attachFabric (bot, options = {}) {
  if (attached.has(bot)) return attached.get(bot)
  if (!bot?._client) throw new TypeError('attachFabric requires a Mineflayer bot with _client')
  const mode = options.registryValidation ?? 'adapt'
  if (!MODES.includes(mode)) throw new TypeError('registryValidation must be "adapt", "strict" or "none"')
  const adapter = new MineflayerAdapter(bot, options)
  const connection = fabricHandshake(bot._client, {
    ...options,
    // A fast configuration can arrive before Mineflayer's deferred injection.
    // Cover that window, then let its game plugin own ping in both phases.
    handleConfigurationPing: options.handleConfigurationPing ?? !bot.game,
    onRegistry: async (sync, fabric) => {
      const generation = fabric.generation
      await options.onRegistry?.(sync, fabric)
      // User adapters can outlive a disconnect or proxy transition.
      if (fabric.disposed || fabric.failed || generation !== fabric.generation) return
      if (mode === 'strict' || mode === 'vanilla') validateMineflayerRegistry(bot.registry, sync)
      if (mode === 'none') return
      const report = adapter.apply(sync)
      fabric.adaptation = report
      if (report.namespaces.size) {
        fabric.emit('warning', {
          code: 'FABRIC_MOD_CONTENT',
          message: 'Registry entries received for ' + [...report.namespaces].join(', ') +
            '. Mod blocks, items and entities use placeholders; their GUIs, payloads and gameplay need dedicated adapters.'
        })
      }
      if (report.unresolvedBlocks.length) {
        fabric.emit('warning', {
          code: 'FABRIC_BLOCK_STATES_UNKNOWN',
          message: report.unresolvedBlocks.length + ' blocks have unknown state counts (' +
            report.unresolvedBlocks.slice(0, 5).join(', ') + (report.unresolvedBlocks.length > 5 ? ', ...' : '') +
            '); block states from ' + report.unknownStateFrom + ' are treated as solid unknown blocks. ' +
            'Describe them in modData.blocks for exact mapping.'
        })
      }
      fabric.emit('adapted', report)
    }
  })
  connection._loadProtocol = () => loadProtocol(true)
  connection._preferMineflayer = true
  // A proxy can move the player to another backend: start from vanilla data.
  const restore = () => {
    adapter.restore()
    delete connection.adaptation
  }
  connection.on('configuration', restore)
  connection.on('failure', restore)
  const unguard = guardWindows(bot._client, adapter, warning => {
    if (!connection.disposed) connection.emit('warning', warning)
  })
  if (options.handleConfigurationPing === undefined && !bot.game) {
    const injected = () => {
      connection.options.handleConfigurationPing = false
      connection.removeListener('disposed', cleanup)
    }
    const cleanup = () => bot.removeListener('inject_allowed', injected)
    bot.once('inject_allowed', injected)
    connection.once('disposed', cleanup)
  }
  bot.fabric = connection
  attached.set(bot, connection)
  connection.once('disposed', () => {
    unguard()
    restore()
    connection.removeListener('configuration', restore)
    connection.removeListener('failure', restore)
    attached.delete(bot)
  })
  return connection
}

// Usage: bot.loadPlugin(fabricPlugin({ ... }))
function fabricPlugin (options = {}) {
  return bot => attachFabric(bot, options)
}

function createFabricBot (botOptions = {}, fabricOptions = {}) {
  const bot = require('mineflayer').createBot(botOptions)
  attachFabric(bot, fabricOptions)
  return bot
}

function createFabricClient (clientOptions, fabricOptions = {}) {
  const client = loadProtocol().createClient(clientOptions)
  client.fabric = fabricHandshake(client, fabricOptions)
  return client
}

module.exports = { attachFabric, fabricPlugin, createFabricBot, createFabricClient, validateMineflayerRegistry }
