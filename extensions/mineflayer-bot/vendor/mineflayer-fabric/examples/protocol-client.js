'use strict'

const fs = require('node:fs')
const { createFabricClient } = require('..')

// Protocol-only client: records registry IDs without loading Mineflayer gameplay.
const client = createFabricClient({
  host: process.env.MC_HOST || 'localhost',
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_USERNAME || 'FABRIC_PROBE',
  auth: process.env.MC_AUTH || 'offline',
  version: process.env.MC_VERSION || false
})
client.fabric.on('registry', () => {
  fs.writeFileSync('registry-dump.json', JSON.stringify(client.fabric.snapshot(), null, 2) + '\n')
  console.log('Saved Fabric registries to registry-dump.json')
})
client.fabric.on('ready', ({ detected, era }) => {
  console.log('Entered PLAY;', detected ? 'Fabric server (' + era + ' era)' : 'no Fabric detected yet')
  if (client.fabric.synced || era === 'configuration') return client.end('Fabric protocol probe complete')
  // PLAY-era servers (Fabric API for 1.14 - 1.20.1) sync registries after join.
  setTimeout(() => client.end('Fabric protocol probe complete'), 5000).unref()
})
client.fabric.on('synced', () => {
  if (client.state === 'play') client.end('Fabric protocol probe complete')
})
client.on('error', error => {
  console.error(error.code || 'ERROR', error.message)
  process.exitCode = 1
})
client.on('disconnect', packet => console.error('Login refused:', packet.reason))
client.on('disconnect_report', packet => console.error('Configuration refused:', packet.reason))
client.on('end', reason => console.log('Disconnected:', reason))
