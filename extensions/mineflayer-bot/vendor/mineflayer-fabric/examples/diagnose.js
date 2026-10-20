'use strict'

// Server diagnosis: joins once with plain Mineflayer and once with
// mineflayer-fabric, then prints what the server sent and what was adapted.
//   MC_HOST=localhost MC_PORT=25565 node examples/diagnose.js
const mineflayer = require('mineflayer')
const { createFabricBot } = require('..')

const options = name => ({
  host: process.env.MC_HOST || 'localhost',
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_USERNAME ? process.env.MC_USERNAME + name : 'Diag' + name,
  auth: process.env.MC_AUTH || 'offline',
  version: process.env.MC_VERSION || false,
  logErrors: false
})
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

function outcome (bot) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve('timeout'), 30000)
    const done = result => { clearTimeout(timer); resolve(result) }
    bot.once('spawn', () => done('spawn'))
    bot.once('kicked', reason => done('kicked: ' + JSON.stringify(reason).slice(0, 300)))
    bot.once('end', reason => done('disconnected: ' + reason))
  })
}

async function main () {
  const plain = mineflayer.createBot(options('Plain'))
  plain.on('error', () => {})
  console.log('Plain Mineflayer:', await outcome(plain))
  plain.end()
  await wait(1500)

  const bot = createFabricBot(options('Fabric'))
  const errors = []
  bot.on('error', error => errors.push(error.code ? error.code + ': ' + error.message : error.message))
  bot.fabric.on('warning', warning => console.log('  warning', warning.code + ':', warning.message))
  const result = await outcome(bot)
  console.log('mineflayer-fabric:', result, '- version', bot.version)
  if (result === 'spawn') {
    const fabric = bot.fabric
    if (fabric.detected && !fabric.synced) await Promise.race([new Promise(resolve => fabric.once('synced', resolve)), wait(5000)])
    console.log('  Fabric detected:', fabric.detected, '| era:', fabric.era, '| registry synced:', fabric.synced,
      fabric.synced ? '(' + fabric.registry.channel + ', ' + fabric.registry.format + ', ' + fabric.registry.entryCount + ' entries)' : '')
    for (const [name, table] of fabric.registry.registries) {
      const mod = [...table.entries.keys()].filter(entry => !entry.startsWith('minecraft:'))
      console.log('   ', name, table.entries.size, 'entries,', mod.length, 'from mods', mod.slice(0, 3).join(', '))
    }
    for (const phase of ['configuration', 'play']) {
      const channels = [...fabric.serverChannels[phase]]
      if (channels.length) console.log('  server ' + phase + ' channels:', channels.join(', '))
    }
    if (fabric.adaptation) {
      const report = fabric.adaptation
      console.log('  adapted: added', JSON.stringify(report.added), 'remapped', JSON.stringify(report.remapped),
        'unknown block states from', report.unknownStateFrom)
    }
    await bot.waitForChunksToLoad()
    console.log('  standing on', bot.blockAt(bot.entity.position.offset(0, -1, 0))?.name)
    await wait(3000)
  }
  console.log('  errors:', errors.length ? '\n    ' + errors.slice(0, 10).join('\n    ') : 'none')
  bot.quit()
  await wait(500)
  process.exit(0)
}
main()
