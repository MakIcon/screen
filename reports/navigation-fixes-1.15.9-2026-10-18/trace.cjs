const { createRequire } = require('node:module')
const { writeFileSync } = require('node:fs')
const path = require('node:path')
const extension = path.resolve(__dirname, '../../extensions/mineflayer-bot')
const runtime = createRequire(path.join(extension, 'pathfinding/package.json'))
runtime('ts-node').register({ project: path.join(extension, 'pathfinding/tsconfig.json'), transpileOnly: true })
const { createPlugin, goals, installSurfaceSwimming } = runtime('./src')
const { createCacheWorld, createFlatWorld } = runtime('./tests/setup')
const { Vec3 } = runtime('vec3')

async function trace(version) {
  const world = createFlatWorld(version, 56, { renderDistance: 1 })
  for (let x = -10; x < 0; x++) for (let z = -3; z <= 3; z++) for (let y = 56; y <= 63; y++) world.setBlock(new Vec3(x, y, z), 'water')
  for (let x = 0; x <= 2; x++) world.setBlock(new Vec3(x, 63, 0), 'stone')
  world.setBlock(new Vec3(7, 63, 0), 'stone')
  const { rig } = createCacheWorld(version, 64, new Vec3(-7.5, 62, 0.5), { world })
  const bot = rig.bot
  const key = version === '1.20.4' ? 'generic.movement_speed' : 'minecraft:movement_speed'
  const modifier = { uuid: '11111111-1111-4111-8111-111111111111', amount: 0.1, operation: 2 }
  bot.entity.attributes[key] = { value: 0.12, modifiers: [modifier] }
  bot.loadPlugin(createPlugin({ moveSettings: { canDig: false, canPlace: false, movementTimeoutMs: 2000 } }))
  const dispose = installSurfaceSwimming(bot)
  const rows = []
  let phase = 'swim', tick = 0
  const setControl = bot.setControlState
  bot.setControlState = function (key, value) {
    if (process.env.TRACE_DETAIL && phase === 'parkour' && tick >= 103 && tick <= 106)
      rows.push({event:'control',key,value,tick,x:bot.entity.position.x,vx:bot.entity.velocity.x,source:new Error().stack.split('\n').slice(2,5)})
    return setControl.call(this,key,value)
  }
  bot.on('pathGenerated', p => rows.push({ event: 'path', phase, tick, status: p.status, moves: p.path.map(m => ({type: m.moveType.constructor.name, entry: m.entryPos, exit: m.exitPos})) }))
  bot.on('resetPath', reason => rows.push({ event: 'reset', phase, tick, reason }))
  bot.on('physicsTick', () => {
    tick++
    const executor = bot.pathfinder.currentExecutor
    if (tick % 5 === 0 || (process.env.TRACE_DETAIL && phase === 'parkour' && tick>=100 && tick<=110)) rows.push({ phase, tick, canInterrupt:executor?.canInterrupt, leftGround:executor?.hasLeftGround, executing:executor?.executing, position: bot.entity.position.clone(), velocity: bot.entity.velocity.clone(), onGround: bot.entity.onGround, water: bot.entity.isInWater, swimming: bot.entity.swimming, height: bot.entity.height, attribute: structuredClone(bot.entity.attributes[key]), controls: Object.fromEntries(['forward','back','sprint','jump','sneak','left','right'].map(k=>[k,bot.getControlState(k)])), move: bot.pathfinder.currentMove?.moveType.constructor.name })
  })
  const started = performance.now()
  const timeout = setTimeout(() => { rows.push({event:'deadline',phase,tick}); void bot.pathfinder.stop() }, 12000)
  let error
  try {
    await bot.pathfinder.goto(new goals.GoalBlock(0,64,0))
    rows.push({event:'landed',phase,tick,ms:performance.now()-started})
    if (rows.some(r => r.event === 'deadline')) return
    phase = 'parkour'
    await bot.pathfinder.goto(new goals.GoalBlock(7,64,0))
    rows.push({event:'arrived',phase,tick,ms:performance.now()-started})
  } catch (e) { error = e.message }
  finally {
    clearTimeout(timeout)
    await bot.pathfinder.destroy(); dispose(); rig.stopPassivePhysics()
    writeFileSync(path.join(__dirname, `trace-${version}-${process.env.TRACE_LABEL ?? 'before'}.json`), JSON.stringify({version,error,rows},null,2)+'\n')
    console.log(version, {error, milestones:rows.filter(r=>r.event==='landed'||r.event==='arrived'||r.event==='deadline'), last:rows.at(-1)})
  }
}
(async () => { for (const version of (process.env.TRACE_VERSIONS ?? '1.20.4,26.1.2').split(',')) await trace(version) })().catch(error=>{ console.error(error);process.exitCode=1 })
