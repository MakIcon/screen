'use strict'

const { attachFabric } = require('./mineflayer-fabric.cjs')

// Attach immediately: older Fabric versions negotiate during LOGIN/PLAY,
// newer ones during CONFIGURATION. The library also owns the early ping race.
function installFabricSupport (bot, report = () => {}) {
  if (bot.fabric && !bot.fabric.disposed) return bot.fabric
  const fabric = attachFabric(bot, { registryValidation: 'adapt', announce: 'auto' })
  fabric.on('registered', (channels, phase) => {
    if (fabric.detected) report('log', { message: `Fabric server detected; negotiating registries (${phase})` })
  })
  fabric.on('adapted', adaptation => {
    const added = Object.entries(adaptation.added).map(([kind, count]) => `${kind}: ${count}`).join(', ')
    if (added) report('log', { message: `Fabric mod data adapted: ${added}` })
  })
  fabric.on('synced', sync => report('log', {
    message: `Fabric registry sync complete: ${sync.registries.size} registries, ${sync.entryCount} entries (${sync.phase})`
  }))
  fabric.on('ready', ({ detected, synced }) => {
    if (detected) report('log', { message: synced ? 'Fabric configuration complete' : 'Fabric connection ready; waiting for PLAY registry sync if required' })
  })
  fabric.on('warning', warning => report('log', { message: `${warning.code}: ${warning.message}` }))
  // Failures reach bot.error with their code; the worker decides on reconnect.
  return fabric
}

module.exports = { installFabricSupport }
