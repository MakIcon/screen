import { createFabricBot, createFabricClient, fabricPlugin, RegistrySync, AdaptationReport } from '..'
const bot = createFabricBot({ username: 'Test', version: '1.20.1' }, {
  onRegistry: async (sync: RegistrySync) => { sync.registries.get('minecraft:menu')?.entries.get('creativecore:container') },
  modData: { blocks: { 'create:shaft': { stateCount: 6, boundingBox: 'block' } }, items: { 'create:wrench': { stackSize: 1 } } },
  registryValidation: 'adapt',
  announce: 'auto'
})
bot.loadPlugin(fabricPlugin({ registryValidation: 'strict' }))
bot.fabric.on('adapted', (report: AdaptationReport) => { report.unresolvedBlocks.join() })
bot.fabric.on('ready', ({ era }) => { if (era === 'play') bot.fabric.snapshot() })
const format: string = bot.fabric.snapshot().source
createFabricClient({ username: 'Test', version: false }, {
  timeout: 0,
  earlyRegistration: true,
  handlers: { play: { 'test:channel': (bytes, fabric) => { fabric.send('test:reply', bytes) } } }
}).fabric.dispose()
void format
