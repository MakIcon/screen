'use strict'

const { createFabricBot } = require('..')

// Registry sync tells names and numeric IDs, not block state counts or shapes.
// Describe the mod blocks you care about to get exact block state mapping;
// the values below are an illustration, take real ones from the mod.
const bot = createFabricBot({
  host: process.env.MC_HOST || 'localhost',
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_USERNAME || 'FABRIC_BOT',
  auth: process.env.MC_AUTH || 'offline',
  version: process.env.MC_VERSION || false
}, {
  modData: {
    blocks: {
      'examplemod:machine': {
        states: [{ name: 'facing', type: 'enum', num_values: 4, values: ['north', 'south', 'west', 'east'] }],
        hardness: 3.5
      },
      'examplemod:cable': { stateCount: 64, boundingBox: 'empty', transparent: true }
    },
    items: { 'examplemod:wrench': { stackSize: 1 } }
  }
})

bot.fabric.on('adapted', report => {
  if (report.unresolvedBlocks.length) {
    console.log('Still unknown (solid placeholders):', report.unresolvedBlocks.join(', '))
  }
})
bot.on('spawn', () => {
  const block = bot.blockAt(bot.entity.position.offset(0, -1, 0))
  console.log('Standing on', block?.name, block?.getProperties())
})
bot.on('error', console.error)
