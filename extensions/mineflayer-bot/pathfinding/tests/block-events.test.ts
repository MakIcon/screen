import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { getTotalBlockEventListenerCount, handleBlockEvent, handleSettledBlockEvent, onceBlockEvent, offBlockEvent } from '../src/customBlockEvents'

test('many block subscribers share one emitter listener and dispose accurately', () => {
  const bot = new EventEmitter() as any
  let calls = 0
  const disposers = Array.from({ length: 100 }, () => handleBlockEvent(bot, 'blockUpdate', () => calls++))
  assert.equal(bot.listenerCount('blockUpdate'), 1)
  bot.emit('blockUpdate', null, null)
  assert.equal(calls, 100)
  for (const dispose of disposers) { dispose(); dispose() }
  assert.equal(bot.listenerCount('blockUpdate'), 0)
  assert.equal(getTotalBlockEventListenerCount(bot), 0)
})

test('once subscriptions can be removed by their original listener', () => {
  const bot = new EventEmitter() as any
  let calls = 0
  const listener = () => calls++
  onceBlockEvent(bot, 'blockUpdate', listener)
  offBlockEvent(bot, 'blockUpdate', listener)
  bot.emit('blockUpdate', null, null)
  assert.equal(calls, 0)
  onceBlockEvent(bot, 'blockUpdate', listener)
  bot.emit('blockUpdate', null, null)
  bot.emit('blockUpdate', null, null)
  assert.equal(calls, 1)
  assert.equal(getTotalBlockEventListenerCount(bot), 0)
  assert.equal(bot.listenerCount('blockUpdate'), 0)
})

test('disposal is idempotent for repeated registrations of the same callback', () => {
  const bot = new EventEmitter() as any
  let calls = 0
  const listener = () => calls++
  const first = handleBlockEvent(bot, 'blockUpdate', listener)
  const second = handleBlockEvent(bot, 'blockUpdate', listener)
  first()
  first()
  bot.emit('blockUpdate', null, null)
  assert.equal(calls, 1)
  second()
  assert.equal(bot.listenerCount('blockUpdate'), 0)
})

test('chunk-sized update bursts debounce per position without adding listeners', async () => {
  const bot = new EventEmitter() as any
  bot.blockAt = (position: Vec3) => ({ position, type: 2 })
  const updates: any[] = []
  const abort = new AbortController()
  const dispose = handleSettledBlockEvent(bot, (old, next, settled) => { updates.push([old, next, settled]) }, { settleMs: 5, signal: abort.signal })
  for (let i = 0; i < 200; i++) {
    const position = new Vec3(i, 64, 0)
    bot.emit('blockUpdate', { position, type: 0 }, { position, type: 1 })
    bot.emit('blockUpdate', { position, type: 1 }, { position, type: 2 })
  }
  assert.equal(bot.listenerCount('blockUpdate'), 1)
  assert.equal(getTotalBlockEventListenerCount(bot), 1)
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(updates.length, 200)
  assert.deepEqual(updates[0].map((b: any) => b.type), [0, 2, 2])
  for (let i = 0; i < 200; i++) bot.emit('blockUpdate', null, { position: new Vec3(i, 65, 0) })
  abort.abort()
  dispose()
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(updates.length, 200)
  assert.equal(bot.listenerCount('blockUpdate'), 0)
})
