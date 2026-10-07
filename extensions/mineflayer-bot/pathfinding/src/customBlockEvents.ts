/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/explicit-function-return-type, @typescript-eslint/restrict-template-expressions */
// blockEvents.ts
import type { Bot } from 'mineflayer'
import type { Block } from 'prismarine-block'
import type { Vec3 } from 'vec3'
const createDebug = require('debug')

export type BlockUpdateListener = (oldBlock: Block | null, newBlock: Block | null) => void

export type BlockPositionString = `(${number}, ${number}, ${number})`
export type BlockPositionEventName = 'blockUpdate:(x, y, z)'
export type BlockEventName = 'blockUpdate' | BlockPositionEventName

type BlockEventListenerMap = {
  blockUpdate: BlockUpdateListener
} & {
  [K in BlockPositionEventName]: BlockUpdateListener
}

const debugIt = false
interface Subscription { listener: BlockUpdateListener, once: boolean, fired?: boolean }
interface EventSubscriptions { listeners: Subscription[], relay: BlockUpdateListener }
const subscriptions = new WeakMap<Bot, Map<BlockEventName, EventSubscriptions>>()

function debug (...args: any[]) {
  const log = createDebug('minecraft-pathfinding:block-events')
  if (debugIt) {
    log(...args)
  }
}

export function getBlockEventListenerCount (bot: Bot, eventName: BlockEventName): number {
  return subscriptions.get(bot)?.get(eventName)?.listeners.length ?? 0
}

export function getTotalBlockEventListenerCount (bot: Bot): number {
  let total = 0
  for (const event of subscriptions.get(bot)?.values() ?? []) {
    total += event.listeners.length
  }
  return total
}

export function toBlockPositionEventName (position: Vec3): BlockPositionEventName {
  return `blockUpdate:${position.toString()}` as BlockPositionEventName
}

function subscribe<K extends BlockEventName> (
  bot: Bot,
  eventName: K,
  listener: BlockEventListenerMap[K],
  once: boolean
): () => void {
  let events = subscriptions.get(bot)
  if (events == null) {
    events = new Map()
    subscriptions.set(bot, events)
  }
  let event = events.get(eventName)
  if (event == null) {
    const listeners: Subscription[] = []
    const relay: BlockUpdateListener = (oldBlock, newBlock) => {
      // Snapshot semantics match EventEmitter, including removal during dispatch.
      for (const sub of listeners.slice()) {
        if (sub.once) {
          if (sub.fired) continue
          sub.fired = true
          removeSubscription(bot, eventName, sub)
        }
        sub.listener(oldBlock, newBlock)
      }
    }
    event = { listeners, relay }
    events.set(eventName, event)
    bot.on(eventName, relay)
  }
  const sub = { listener, once }
  event.listeners.push(sub)
  return () => removeSubscription(bot, eventName, sub)
}

function removeSubscription (bot: Bot, eventName: BlockEventName, sub: Subscription): void {
  const events = subscriptions.get(bot)
  const event = events?.get(eventName)
  if (event == null) return
  const index = event.listeners.indexOf(sub)
  if (index < 0) return
  event.listeners.splice(index, 1)
  if (event.listeners.length === 0) {
    bot.off(eventName, event.relay)
    events?.delete(eventName)
  }
}

export function onBlockEvent<K extends BlockEventName> (bot: Bot, eventName: K, listener: BlockEventListenerMap[K]): void {
  subscribe(bot, eventName, listener, false)
}

export function onceBlockEvent<K extends BlockEventName> (bot: Bot, eventName: K, listener: BlockEventListenerMap[K]): void {
  subscribe(bot, eventName, listener, true)
}

export function offBlockEvent<K extends BlockEventName> (
  bot: Bot,
  eventName: K,
  listener: BlockEventListenerMap[K]
): void {
  const listeners = subscriptions.get(bot)?.get(eventName)?.listeners ?? []
  const sub = listeners.slice().reverse().find(sub => sub.listener === listener)
  if (sub != null) removeSubscription(bot, eventName, sub)
}

export function handleBlockEvent<K extends BlockEventName> (
  bot: Bot,
  eventName: K,
  listener: BlockEventListenerMap[K]
): () => void {
  return subscribe(bot, eventName, listener, false)
}

export function handleBlockPositionEvent (
  bot: Bot,
  position: Vec3,
  listener: BlockUpdateListener
): () => void {
  return handleBlockEvent(bot, toBlockPositionEventName(position), listener)
}

export interface WaitForBlockEventOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

export async function waitForBlockEvent<K extends BlockEventName> (
  bot: Bot,
  eventName: K,
  opts: WaitForBlockEventOptions = {}
): Promise<Parameters<BlockEventListenerMap[K]>> {
  const { timeoutMs = 5000, signal } = opts

  return await new Promise((resolve, reject) => {
    let finished = false
    let timeout: NodeJS.Timeout | undefined

    const cleanup = () => {
      if (timeout != null) clearTimeout(timeout)
      offBlockEvent(bot, eventName, listener)
      signal?.removeEventListener('abort', onAbort)
    }

    const succeed = (...args: Parameters<BlockEventListenerMap[K]>) => {
      if (finished) return
      finished = true
      cleanup()
      debug('resolved waitForBlockEvent %s', eventName)
      resolve(args)
    }

    const fail = (err: Error) => {
      if (finished) return
      finished = true
      cleanup()
      debug('rejected waitForBlockEvent %s: %s', eventName, err.message)
      reject(err)
    }

    const listener = ((...args: Parameters<BlockEventListenerMap[K]>) => {
      succeed(...args)
    }) as BlockEventListenerMap[K]

    const onAbort = () => {
      fail(new Error(`Aborted while waiting for ${eventName}`))
    }

    onBlockEvent(bot, eventName, listener)

    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        fail(new Error(`Timed out waiting for ${eventName}`))
      }, timeoutMs)
    }

    if (signal != null) {
      if (signal.aborted) {
        fail(new Error(`Aborted while waiting for ${eventName}`))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

export interface WaitForSettledBlockPredicateOptions {
  timeoutMs?: number
  settleMs?: number
  signal?: AbortSignal
}

export interface WaitForSettledBlockUpdateOptions {
  timeoutMs?: number
  settleMs?: number
  signal?: AbortSignal
}

export interface HandleSettledBlockEventOptions {
  settleMs?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export type SettledBlockUpdateListener = (
  oldBlock: Block | null,
  newBlock: Block | null,
  settledBlock: Block | null
) => void | Promise<void>

interface PositionSettleController<TResult> {
  resolve: (value: TResult) => void
  reject: (err: Error) => void
  finishGuard: () => boolean
  position: Vec3
  eventName: BlockPositionEventName
  settleMs: number
  bot: Bot
}

async function waitForPositionSettle<TResult> (
  bot: Bot,
  position: Vec3,
  opts: {
    timeoutMs?: number
    settleMs?: number
    signal?: AbortSignal
    debugLabel: string
    createListener: (
      controller: PositionSettleController<TResult> & {
        armSettleTimer: (fn: () => void) => void
        cancelSettleTimer: () => void
      }
    ) => BlockUpdateListener
  }
): Promise<TResult> {
  const targetPosition = position.floored()
  const eventName = toBlockPositionEventName(targetPosition)
  const timeoutMs = opts.timeoutMs ?? 5000
  const settleMs = opts.settleMs ?? 75
  const signal = opts.signal

  return await new Promise<TResult>((resolve, reject) => {
    let finished = false
    let timeoutTimer: NodeJS.Timeout | undefined
    let settleTimer: NodeJS.Timeout | undefined

    const succeed = (value: TResult) => {
      if (finished) return
      finished = true
      cleanup()
      debug('resolved %s %s', opts.debugLabel, eventName)
      resolve(value)
    }

    const fail = (err: Error) => {
      if (finished) return
      finished = true
      cleanup()
      debug('rejected %s %s: %s', opts.debugLabel, eventName, err.message)
      reject(err)
    }

    const armSettleTimer = (fn: () => void) => {
      if (settleTimer != null) clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        if (finished) return
        fn()
      }, settleMs)
    }

    const cancelSettleTimer = () => {
      if (settleTimer != null) {
        clearTimeout(settleTimer)
        settleTimer = undefined
      }
    }

    const controller: PositionSettleController<TResult> & {
      armSettleTimer: (fn: () => void) => void
      cancelSettleTimer: () => void
    } = {
      resolve: succeed,
      reject: fail,
      finishGuard: () => finished,
      position,
      eventName,
      settleMs,
      bot,
      armSettleTimer,
      cancelSettleTimer
    }

    const baseListener = opts.createListener(controller)

    const onUpdate: BlockUpdateListener = (oldBlock, newBlock) => {
      const updatedPosition = oldBlock?.position ?? newBlock?.position
      if (updatedPosition == null) return
      if (!updatedPosition.floored().equals(targetPosition)) return

      baseListener(oldBlock, newBlock)
    }

    const onAbort = () => {
      fail(new Error(`Aborted while waiting for ${eventName}`))
    }

    const cleanup = () => {
      if (timeoutTimer != null) clearTimeout(timeoutTimer)
      cancelSettleTimer()
      offBlockEvent(bot, 'blockUpdate', onUpdate)
      signal?.removeEventListener('abort', onAbort)
    }

    onBlockEvent(bot, 'blockUpdate', onUpdate)

    // Seed the listener from the current world state so callers do not have to
    // wait for a second update before the settle timer can start.
    baseListener(null, bot.blockAt(targetPosition) ?? null)

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        fail(new Error(`Timed out waiting for ${opts.debugLabel} at ${position}`))
      }, timeoutMs)
    }

    if (signal != null) {
      if (signal.aborted) {
        fail(new Error(`Aborted while waiting for ${eventName}`))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}
export async function waitForSettledBlockPredicate (
  bot: Bot,
  position: Vec3,
  predicate: (block: Block | null) => boolean,
  opts: WaitForSettledBlockPredicateOptions = {}
): Promise<Block | null> {
  return await waitForPositionSettle<Block | null>(bot, position, {
    timeoutMs: opts.timeoutMs,
    settleMs: opts.settleMs ?? 500,
    signal: opts.signal,
    debugLabel: 'waitForSettledBlockPredicate',
    createListener: (controller) => {
      let candidate: Block | null = null

      const cancel = controller.cancelSettleTimer

      return (_oldBlock, newBlock) => {
        const matches = predicate(newBlock)

        debug(
          'event %s new=%s matches=%s',
          controller.eventName,
          newBlock?.name ?? 'null',
          matches
        )

        if (matches) {
          candidate = newBlock
          ;(controller as any).armSettleTimer(() => {
            debug(
              'settle check %s candidate=%s matches=%s',
              controller.eventName,
              candidate?.name ?? 'null',
              true
            )
            controller.resolve(candidate)
          })
        } else {
          candidate = null
          cancel()
        }
      }
    }
  })
}

export async function waitForSettledBlockStateAtPosition (
  bot: Bot,
  position: Vec3,
  predicate: (block: Block | null) => boolean,
  opts: WaitForSettledBlockPredicateOptions = {}
): Promise<Block | null> {
  return await waitForPositionSettle<Block | null>(bot, position, {
    timeoutMs: opts.timeoutMs,
    settleMs: opts.settleMs ?? 75,
    signal: opts.signal,
    debugLabel: 'waitForSettledBlockStateAtPosition',
    createListener: (controller) => {
      const cancel = controller.cancelSettleTimer

      return (_oldBlock, _newBlock) => {
        const current = controller.bot.blockAt(controller.position) ?? null
        const matches = predicate(current)

        debug(
          'event %s current=%s matches=%s',
          controller.eventName,
          current?.name ?? 'null',
          matches
        )

        if (matches) {
          ;(controller as any).armSettleTimer(() => {
            const settled = controller.bot.blockAt(controller.position) ?? null
            const settledMatches = predicate(settled)

            debug(
              'settle check %s current=%s matches=%s',
              controller.eventName,
              settled?.name ?? 'null',
              settledMatches
            )

            if (settledMatches) {
              controller.resolve(settled)
            }
          })
        } else {
          cancel()
        }
      }
    }
  })
}

export async function waitForSettledBlockUpdateAtPosition (
  bot: Bot,
  position: Vec3,
  opts: WaitForSettledBlockUpdateOptions = {}
): Promise<Block | null> {
  return await waitForPositionSettle<Block | null>(bot, position, {
    timeoutMs: opts.timeoutMs,
    settleMs: opts.settleMs ?? 75,
    signal: opts.signal,
    debugLabel: 'waitForSettledBlockUpdateAtPosition',
    createListener: (controller) => {
      return () => {
        ;(controller as any).armSettleTimer(() => {
          const current = controller.bot.blockAt(controller.position) ?? null
          debug(
            'settle check %s current=%s',
            controller.eventName,
            current?.name ?? 'null'
          )
          controller.resolve(current)
        })
      }
    }
  })
}

/**
 * Listens to global blockUpdate events, but only calls the listener after the
 * affected position has gone quiet for `settleMs`.
 *
 * - Deduplicates concurrent checks per position
 * - Reads the final block from the world before invoking the listener
 */
export function handleSettledBlockEvent (
  bot: Bot,
  listener: SettledBlockUpdateListener,
  opts: HandleSettledBlockEventOptions = {}
): () => void {
  const pending = new Map<string, { position: Vec3, oldBlock: Block | null, newBlock: Block | null, settle?: NodeJS.Timeout, deadline?: NodeJS.Timeout }>()
  let disposed = false
  const flush = (key: string): void => {
    const item = pending.get(key)
    if (item == null || disposed) return
    clearTimeout(item.settle)
    clearTimeout(item.deadline)
    pending.delete(key)
    Promise.resolve().then(() => {
      if (!disposed) return listener(item.oldBlock, item.newBlock, bot.blockAt(item.position) ?? null)
    }).catch(err => debug('settled block listener failed: %s', err))
  }
  const unsubscribe = handleBlockEvent(bot, 'blockUpdate', (oldBlock, newBlock) => {
    const position = newBlock?.position ?? oldBlock?.position
    if (position == null || disposed) return
    const key = position.toString()
    let item = pending.get(key)
    if (item == null) {
      item = { position: position.clone(), oldBlock, newBlock }
      pending.set(key, item)
      if ((opts.timeoutMs ?? 5000) > 0) item.deadline = setTimeout(() => flush(key), opts.timeoutMs ?? 5000)
    }
    item.newBlock = newBlock
    clearTimeout(item.settle)
    item.settle = setTimeout(() => flush(key), opts.settleMs ?? 75)
  })
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    unsubscribe()
    for (const item of pending.values()) {
      clearTimeout(item.settle)
      clearTimeout(item.deadline)
    }
    pending.clear()
    opts.signal?.removeEventListener('abort', dispose)
  }
  if (opts.signal?.aborted === true) dispose()
  else opts.signal?.addEventListener('abort', dispose, { once: true })
  return dispose
}
