const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../extensions/mineflayer-bot');
const output = path.join(__dirname, 'cave-trace-before.json');
let source = fs.readFileSync(path.join(root, 'gathering-navigation.test.mjs'), 'utf8');
source = source.replace('  return { rig, bot, controller, messages };', `
  const trace = [], started = performance.now();
  let leg = 0;
  const point = (p) => p && [p.x, p.y, p.z];
  const move = (m) => m && ({ type: m.moveType.constructor.name, entry: point(m.entryPos), exit: point(m.exitPos) });
  bot.on('physicsTick', () => trace.push({ event: 'tick', leg, at: performance.now() - started,
    pos: point(bot.entity.position), vel: point(bot.entity.velocity), ground: bot.entity.onGround,
    collided: bot.entity.isCollidedHorizontally, controls: { ...bot.controlState },
    index: bot.pathfinder.currentIndex, move: move(bot.pathfinder.currentMove),
    executor: bot.pathfinder.currentExecutor?.constructor.name }));
  bot.on('pathGenerated', (p) => trace.push({ event: 'path', leg, at: performance.now() - started, status: p.status, path: p.path.map(move) }));
  bot.on('resetPath', (reason) => trace.push({ event: 'reset', leg, at: performance.now() - started, reason }));
  const goto = bot.pathfinder.goto.bind(bot.pathfinder);
  bot.pathfinder.goto = async (...args) => {
    leg++;
    trace.push({ event: 'goto', leg, at: performance.now() - started,
      goal: { type: args[0].constructor.name, x: args[0].x, y: args[0].y, z: args[0].z } });
    try { return await goto(...args); }
    catch (e) { trace.push({ event: 'error', leg, at: performance.now() - started, error: e.message }); throw e; }
  };
  bot.on('end', () => fs.writeFileSync(${JSON.stringify(output)}, JSON.stringify({ trace, messages }, null, 2)));
  return { rig, bot, controller, messages };
`);
source = `import fs from 'node:fs';\n` + source;
fs.writeFileSync(path.join(root, '.cave-trace.mjs'), source);
