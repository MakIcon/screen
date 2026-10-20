'use strict'

const { createFabricBot } = require('..')

const bot = createFabricBot({
  host: process.env.MC_HOST || 'localhost',
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_USERNAME || 'FABRIC_BOT',
  auth: process.env.MC_AUTH || 'offline',
  version: process.env.MC_VERSION || false
}, {
  handlers: {
    play: {
      // This channel is advertised because an actual handler is supplied.
      // Replace it with the documented protocol of YOUR mod.
      'example:notification': (data, fabric) => {
        console.log('Example notification:', data.toString('utf8'))
      }
    }
  }
})
bot.on('error', console.error)
