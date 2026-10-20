'use strict'

const fs = require('node:fs')
const { createFabricBot } = require('..')

// Works with any server Mineflayer supports (1.8 - 26.1): Fabric servers get the
// Fabric handshake, ordinary servers see a plain Mineflayer client.
const bot = createFabricBot({
  host: process.env.MC_HOST || 'localhost',
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_USERNAME || 'FABRIC_BOT',
  auth: process.env.MC_AUTH || 'offline',
  version: process.env.MC_VERSION || false,
  logErrors: false
})

bot.fabric.on('registered', (channels, phase) => console.log('Fabric channels registered (' + phase + '):', channels.join(', ')))
bot.fabric.on('registry', sync => {
  console.log('Fabric registry sync:', sync.registries.size, 'registries,', sync.entryCount, 'entries via', sync.channel, '(' + sync.format + ')')
  fs.writeFileSync('registry-dump.json', JSON.stringify(bot.fabric.snapshot(), null, 2) + '\n')
})
bot.fabric.on('adapted', report => console.log('Mineflayer data adapted:', JSON.stringify({
  added: report.added, remapped: report.remapped, unresolvedBlocks: report.unresolvedBlocks.length
})))
bot.fabric.on('warning', warning => console.warn(warning.code + ': ' + warning.message))
bot.fabric.on('unhandledPayload', ({ channel, data }) => console.log('Unhandled mod channel:', channel, '(' + data.length + ' bytes)'))
bot.on('spawn', () => {
  const kind = bot.fabric.detected ? 'Fabric (' + bot.fabric.era + ' era)' : 'not Fabric'
  console.log('Spawned:', bot.username, 'on', bot.version, '-', kind)
})
bot.on('windowOpen', window => console.log('Window opened:', window.type, window.slots.length, 'slots'))
bot.on('kicked', reason => console.error('Kicked:', JSON.stringify(reason)))
bot.on('error', error => {
  console.error(error.code || 'ERROR', error.message)
  process.exitCode = 1
})
bot.on('end', reason => console.log('Disconnected:', reason))
process.once('SIGINT', () => bot.quit('Example stopped'))
