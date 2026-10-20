'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Isolated consumer layouts catch dependency-resolution failures which a
// flattened development node_modules tree cannot reproduce. Each codec wrapper
// delegates to the real codec and records which installation was selected.
for (const scenario of [
  { name: 'raw client with only minecraft-protocol installed', direct: true, nested: false, bot: false, expected: 'direct' },
  { name: 'bot with a private Mineflayer protocol dependency', direct: false, nested: true, bot: true, expected: 'mineflayer' },
  { name: 'raw client keeps its direct codec when Mineflayer is present', direct: true, nested: true, bot: false, expected: 'direct' },
  { name: 'bot prefers its Mineflayer codec over another direct peer', direct: true, nested: true, bot: true, expected: 'mineflayer' },
  { name: 'raw client can fall back to a private Mineflayer dependency', direct: false, nested: true, bot: false, expected: 'mineflayer' }
]) {
  test('split registry works for ' + scenario.name, { timeout: 10000 }, t => {
    const root = mkdtempSync(path.join(tmpdir(), 'mineflayer-fabric-resolution-'))
    t.after(() => {
      assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()))
      assert.ok(path.basename(root).startsWith('mineflayer-fabric-resolution-'))
      rmSync(root, { recursive: true, force: true })
    })
    const pkg = path.join(root, 'library')
    mkdirSync(pkg)
    cpSync(path.join(__dirname, '..', 'src'), path.join(pkg, 'src'), { recursive: true })
    cpSync(path.join(__dirname, '..', 'index.js'), path.join(pkg, 'index.js'))
    mkdirSync(path.join(pkg, 'test'))
    cpSync(path.join(__dirname, 'fixtures.js'), path.join(pkg, 'test', 'fixtures.js'))
    function codec (directory, label) {
      mkdirSync(directory, { recursive: true })
      writeFileSync(path.join(directory, 'index.js'), `
        const protocol = require(${JSON.stringify(require.resolve('minecraft-protocol'))})
        module.exports = { ...protocol, createSerializer(options) {
          global.codecSources.push(${JSON.stringify(label)})
          return protocol.createSerializer(options)
        } }
      `)
    }
    if (scenario.direct) codec(path.join(root, 'node_modules', 'minecraft-protocol'), 'direct')
    if (scenario.nested) {
      const mineflayer = path.join(root, 'node_modules', 'mineflayer')
      mkdirSync(mineflayer, { recursive: true })
      writeFileSync(path.join(mineflayer, 'index.js'), 'module.exports = {}\n')
      codec(path.join(mineflayer, 'node_modules', 'minecraft-protocol'), 'mineflayer')
    }
    writeFileSync(path.join(root, 'probe.cjs'), `
      const assert = require('node:assert/strict')
      const { EventEmitter } = require('node:events')
      const mc = require(${JSON.stringify(require.resolve('minecraft-protocol'))})
      const { fabricHandshake, attachFabric, CHANNELS } = require('./library')
      const { encodeChannels, varint } = require('./library/src/binary')
      const { registryFixture } = require('./library/test/fixtures')
      global.codecSources = []
      const client = new EventEmitter()
      client.version = '26.1'
      client.state = 'configuration'
      client.write = () => {}
      client.end = reason => { throw new Error(reason) }
      const bot = Object.assign(new EventEmitter(), { _client: client })
      const fabric = ${scenario.bot ? 'attachFabric(bot)' : 'fabricHandshake(client)'}
      client.emit('custom_payload', { channel: CHANNELS.register, data: encodeChannels([CHANNELS.complete]) })
      const serializer = mc.createSerializer({ state: 'configuration', isServer: true, version: '26.1' })
      const bytes = serializer.createPacketBuffer({ name: 'custom_payload', params: { channel: CHANNELS.registry, data: registryFixture() } })
      serializer.destroy()
      client.emit('custom_payload', { channel: CHANNELS.split, data: Buffer.concat([varint(bytes.length), bytes]) })
      setImmediate(() => {
        assert.equal(fabric.synced, true)
        assert.deepEqual(global.codecSources, [${JSON.stringify(scenario.expected)}])
        fabric.dispose()
        console.log('ok')
      })
    `)
    const result = spawnSync(process.execPath, ['--no-deprecation', 'probe.cjs'], {
      cwd: root, encoding: 'utf8', timeout: 8000, windowsHide: true
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(result.stdout.trim(), 'ok')
  })
}
