const { createRequire } = require('node:module')
const { writeFileSync } = require('node:fs')
const path = require('node:path')
const runtime = createRequire(path.resolve(__dirname, '../../extensions/mineflayer-bot/pathfinding/package.json'))
runtime('ts-node').register({ project: path.resolve(__dirname, '../../extensions/mineflayer-bot/pathfinding/tsconfig.json'), transpileOnly: true })
const { createPlugin, goals, installSurfaceSwimming } = runtime('./src')
const { ShoreRouteGoal } = runtime('./src/mineflayer-specific/shore')
const { createCacheWorld, createFlatWorld } = runtime('./tests/setup')
const { Vec3 } = runtime('vec3')
async function trace(trial) {
  const version = '26.1.2'
  const world = createFlatWorld(version, 56, { renderDistance: 2 })
  for(let x=-8;x<=18;x++)for(let z=-8;z<=8;z++)for(let y=56;y<=63;y++)world.setBlock(new Vec3(x,y,z),'water')
  world.setBlock(new Vec3(2,63,0),'stone');world.setBlock(new Vec3(2,63,1),'stone')
  for(let x=8;x<=16;x++)for(let z=-2;z<=2;z++)for(let y=56;y<=63+Math.min(4,x-8);y++)world.setBlock(new Vec3(x,y,z),'stone')
  for(let x=4;x<=12;x++)world.setBlock(new Vec3(x,67,0),'stone')
  const {rig}=createCacheWorld(version,64,new Vec3(.5,62,.5),{world})
  const bot=rig.bot
  bot.loadPlugin(createPlugin({moveSettings:{canDig:false,canPlace:false,allowJumpSprint:false,movementTimeoutMs:2000},pathfinderSettings:{searchTimeoutMs:1000,tickTimeoutMs:3,routePrefixMs:30,maxVisitedNodes:12000}}))
  installSurfaceSwimming(bot)
  const rows=[];let saved
  const get=bot.pathfinder.getPathTo.bind(bot.pathfinder)
  bot.pathfinder.getPathTo=(...args)=>{
    if(args[0] instanceof ShoreRouteGoal)saved=args[0].continuation
    rows.push({event:'search',goal:args[0].constructor.name,position:bot.entity.position.clone(),ground:bot.entity.onGround,water:bot.entity.isInWater,first:saved?.path[0]?.entryPos,last:saved?.path.at(-1)?.exitPos})
    return get(...args)
  }
  bot.on('pathGenerated',p=>rows.push({event:'path',status:p.status,position:bot.entity.position.clone(),ground:bot.entity.onGround,moves:p.path.map(m=>({type:m.moveType.constructor.name,entry:m.entryPos,exit:m.exitPos}))}))
  bot.on('resetPath',reason=>rows.push({event:'reset',reason}))
  const deadline=setTimeout(()=>void bot.pathfinder.stop(),16000)
  try{await bot.pathfinder.goto(new goals.GoalNear(4.5,68,.5,.7))}catch(e){rows.push({error:e.message})}
  finally{clearTimeout(deadline);await bot.pathfinder.destroy();rig.stopPassivePhysics();writeFileSync(path.join(__dirname,`shore-${trial}.json`),JSON.stringify(rows,null,2)+'\n');console.log(trial,rows.filter(r=>r.event==='search'))}
}
(async()=>{for(let trial=1;trial<=3;trial++)await trace(trial)})().catch(e=>{console.error(e);process.exitCode=1})
