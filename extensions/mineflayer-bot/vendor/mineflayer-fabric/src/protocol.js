'use strict'

const { dirname } = require('node:path')

function mineflayerProtocolPath () {
  return require.resolve('minecraft-protocol', { paths: [dirname(require.resolve('mineflayer'))] })
}

function protocolPath (preferMineflayer) {
  if (preferMineflayer) return mineflayerProtocolPath()
  try {
    return require.resolve('minecraft-protocol')
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    return mineflayerProtocolPath()
  }
}

// pnpm may keep the bot's codec dependency private to Mineflayer. A raw client
// prefers its direct peer; an attached bot must use Mineflayer's own codecs.
function loadProtocol (preferMineflayer = false) {
  // Do not treat errors inside an installed codec as a missing dependency.
  return require(protocolPath(preferMineflayer))
}

// minecraft-data that belongs to the selected minecraft-protocol installation.
function loadMinecraftData (preferMineflayer = false) {
  return require(require.resolve('minecraft-data', { paths: [dirname(protocolPath(preferMineflayer))] }))
}

// Protocol number of the negotiated version, or undefined when unknown.
function protocolVersionOf (client, preferMineflayer = false) {
  if (typeof client.version !== 'string') return undefined
  try {
    return loadMinecraftData(preferMineflayer)(client.version)?.version?.version
  } catch {
    return undefined
  }
}

module.exports = { loadProtocol, loadMinecraftData, protocolVersionOf }
