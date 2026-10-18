const { spawn } = require('node:child_process')
const { readdirSync, openSync, closeSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../../extensions/mineflayer-bot/pathfinding')
const files = []
function collect(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name)
    if (entry.isDirectory()) collect(file)
    else if (entry.name.endsWith('.test.ts')) files.push(file)
  }
}
collect(path.join(root, 'tests'))
const args = ['--no-deprecation', '--require', 'ts-node/register', '--test', '--test-concurrency=4', ...files]
const startedAt = new Date().toISOString()
const log = openSync(path.join(__dirname, 'navigation-tests.txt'), 'w')
const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', log, log] })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('close', code => {
  closeSync(log)
  const result = { startedAt, finishedAt: new Date().toISOString(), exitCode: code,
    method: 'The same .test.ts files recursively collected by tests/run.cjs, isolated by file, four concurrent processes, unchanged per-test timeouts',
    files: files.map(file => path.relative(root, file)), args }
  writeFileSync(path.join(__dirname, 'navigation-status.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(result)
  process.exitCode = code ?? 1
})
