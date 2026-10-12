import assert from 'node:assert/strict'
import test from 'node:test'
import { Vec3 } from 'vec3'
import { createPlugin, goals, ThePathfinder } from '../src'
import { createCacheWorld } from './setup'

function prepareRig () {
  const { world, rig } = createCacheWorld('1.20.4', 64, new Vec3(0.5, 64, 0.5))
  rig.bot.loadPlugin(createPlugin({
    moveSettings: { canDig: false, canPlace: false, allowJumpSprint: false },
    pathfinderSettings: { searchTimeoutMs: 500, tickTimeoutMs: 5, maxVisitedNodes: 10000 }
  }))
  return { ...rig, world }
}

async function cleanup (rig: ReturnType<typeof prepareRig>): Promise<void> {
  await rig.bot.pathfinder.destroy()
  rig.stopPassivePhysics()
}

test('goto executes using the stable Mineflayer physicsTick event', { timeout: 6000 }, async () => {
  const rig = prepareRig()
  try {
    await rig.bot.pathfinder.goto(new goals.GoalNear(5, 64, 0, 1))
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(5, 64, 0)) <= 1.5, `position=${rig.bot.entity.position}`)
    assert.equal(rig.bot.pathfinder.isPathing, false)
    assert.equal(rig.bot.getControlState('forward'), false)
  } finally {
    await cleanup(rig)
  }
})

test('stop wakes a following goal that is waiting inside its radius', { timeout: 3000 }, async () => {
  const rig = prepareRig()
  try {
    const goal = new goals.GoalFollowEntity(new Vec3(0.5, 64, 0.5), 3, { neverfinish: true })
    const running = rig.bot.pathfinder.goto(goal)
    await rig.bot.waitForTicks(3)
    assert.equal(rig.bot.pathfinder.isPathing, true)
    await rig.bot.pathfinder.stop()
    await running
    assert.equal(rig.bot.listenerCount('entityMoved'), 0)
    assert.equal(rig.bot.listenerCount('entityGone'), 0)
    assert.equal(rig.bot.pathfinder.isPathing, false)
  } finally {
    await cleanup(rig)
  }
})

test('unreachable goals report timeout and release controls and task state', { timeout: 5000 }, async () => {
  const rig = prepareRig()
  try {
    let finished = 0
    rig.bot.on('goalFinished', () => finished++)
    await assert.rejects(rig.bot.pathfinder.goto(new goals.GoalBlock(0, 80, 0)), /Pathfinding failed: timeout/)
    assert.equal(finished, 0)
    assert.equal(rig.bot.pathfinder.isPathing, false)
    assert.equal(rig.bot.pathfinder.currentGoal, undefined)
    assert.equal(rig.bot.getControlState('forward'), false)
  } finally {
    await cleanup(rig)
  }
})

test('disconnect wakes a search even after physics ticks stop', { timeout: 3000 }, async () => {
  const rig = prepareRig()
  try {
    const running = rig.bot.pathfinder.goto(new goals.GoalBlock(0, 80, 0))
    rig.stopPassivePhysics()
    await running
    assert.equal(rig.bot.pathfinder.isPathing, false)
    assert.equal(rig.bot.listenerCount('chunkColumnLoad'), 0)
    assert.equal(rig.bot.listenerCount('blockUpdate'), 0)
  } finally {
    await cleanup(rig)
  }
})

test('latest goal wins when several requests arrive during following', { timeout: 3000 }, async () => {
  const rig = prepareRig()
  try {
    const pathfinder = rig.bot.pathfinder
    const running = pathfinder.goto(new goals.GoalFollowEntity(new Vec3(0.5, 64, 0.5), 3, { neverfinish: true }))
    await rig.bot.waitForTicks(3)
    const reached: number[] = []
    rig.bot.on('goalSet', (goal: goals.GoalNear) => reached.push(goal.x))
    await Promise.all([
      running,
      pathfinder.goto(new goals.GoalNear(1, 64, 0, 3)),
      pathfinder.goto(new goals.GoalNear(2, 64, 0, 3)),
      pathfinder.goto(new goals.GoalNear(3, 64, 0, 3))
    ])
    assert.deepEqual(reached, [3])
    assert.equal(pathfinder.isPathing, false)
  } finally {
    await cleanup(rig)
  }
})

test('GoalNear uses a radius and has zero heuristic within it', () => {
  const goal = new goals.GoalNear(0, 64, 0, 2)
  assert.equal(goal.isEnd({ x: 2, y: 64, z: 2 } as any), false)
  assert.equal(goal.isEnd({ x: 1, y: 64, z: 1 } as any), true)
  assert.equal(goal.heuristic({ x: 1, y: 64, z: 1 } as any), 0)
})

test('GoalBlock floors the stored coordinates including negative values', () => {
  const goal = new goals.GoalBlock(1.9, 64.5, -0.2)
  assert.deepEqual([goal.x, goal.y, goal.z], [1, 64, -1])
})

test('following stays valid when another entity disappears', () => {
  const target = new Vec3(0, 64, 0)
  const goal = new goals.GoalFollowEntity(target, 3)
  assert.equal(goal.isValid('entityGone', { position: new Vec3(0, 64, 0) } as any), true)
  assert.equal(goal.isValid('entityGone', { position: target } as any), false)
})

test('following replans when the target moves and stops when it disappears', { timeout: 6000 }, async () => {
  const rig = prepareRig()
  let failure: unknown
  try {
    const target = { position: new Vec3(0.5, 64, 0.5) }
    const goal = goals.GoalFollowEntity.fromEntity(target, 1, { neverfinish: true })
    const running = rig.bot.pathfinder.goto(goal).catch((error: unknown) => { failure = error })
    await rig.bot.waitForTicks(3)
    target.position.set(5, 64, 0)
    rig.bot.emit('entityMoved', target)
    await rig.bot.waitForTicks(35)
    assert.equal(failure, undefined)
    assert.ok(rig.bot.entity.position.distanceTo(target.position) <= 1.1, `position=${rig.bot.entity.position}`)
    rig.bot.emit('entityGone', { position: new Vec3(10, 64, 0) })
    assert.equal(rig.bot.pathfinder.isPathing, true)
    rig.bot.emit('entityGone', target)
    await running
    assert.equal(rig.bot.pathfinder.isPathing, false)
  } finally {
    await cleanup(rig)
  }
})

test('stop during movement releases controls and prevents a late step', { timeout: 3000 }, async () => {
  const rig = prepareRig()
  try {
    const running = rig.bot.pathfinder.goto(new goals.GoalNear(20, 64, 0, 1))
    await rig.bot.waitForTicks(6)
    await rig.bot.pathfinder.stop()
    await running
    await rig.bot.waitForTicks(3)
    assert.equal(rig.bot.getControlState('forward'), false)
    assert.equal(rig.bot.getControlState('sprint'), false)
    assert.equal(rig.bot.pathfinder.currentMove, undefined)
    assert.equal(rig.bot.pathfinder.currentExecutor, undefined)
  } finally {
    await cleanup(rig)
  }
})

test('updating a cached block preserves other entries and unloaded state is undefined', async () => {
  const rig = prepareRig()
  try {
    const cache = rig.bot.pathfinder.world
    const first = new Vec3(1, 64, 1)
    const second = new Vec3(2, 64, 2)
    cache.getBlockInfo(first)
    cache.getBlockInfo(second)
    rig.world.setBlock(first, 'stone')
    assert.equal(cache.getBlockInfo(first).block?.name, 'stone')
    assert.equal(cache.blockInfos.has('2:64:2'), true)
    assert.equal(cache.getBlockStateId(new Vec3(10000, 64, 10000)), undefined)
  } finally {
    await cleanup(rig)
  }
})

test('explicit mining starts a verified prefix promptly and stop cancels it', { timeout: 3000 }, async () => {
  const rig = prepareRig()
  try {
    const navigator = rig.bot.pathfinder
    navigator.setOptions({ routePrefixMs: 10, routePrefixLength: 8, tickTimeoutMs: 1, searchTimeoutMs: 1500 })
    const started = performance.now()
    let firstForward: number | undefined
    let finished = 0
    const setControl = rig.bot.setControlState
    rig.bot.setControlState = (name: string, value: boolean) => {
      if (name === 'forward' && value) firstForward ??= performance.now() - started
      setControl(name, value)
    }
    rig.bot.on('goalFinished', () => finished++)
    const running = navigator.goto(new goals.GoalBlock(120, 64, 0), { allowMiningPrefix: true })
    await rig.bot.waitForTicks(6)
    assert.ok(firstForward != null && firstForward < 300, `first forward=${firstForward}ms`)
    assert.ok(rig.bot.entity.position.x > 0.6)
    assert.equal(finished, 0)
    await navigator.stop()
    await running
    assert.equal(rig.bot.getControlState('forward'), false)
    assert.equal(rig.bot.listenerCount('entityMoved'), 0)
  } finally {
    await cleanup(rig)
  }
})

test('ordinary come executes the complete route instead of stopping at five-block partials', { timeout: 14000 }, async () => {
  const rig = prepareRig()
  try {
    const navigator: ThePathfinder = rig.bot.pathfinder
    navigator.setOptions({ routePrefixMs: 1, routePrefixLength: 5 })
    const getPathTo = navigator.getPathTo.bind(navigator)
    let searches = 0
    navigator.getPathTo = async function * (...args: Parameters<typeof getPathTo>) {
      searches++
      for await (const result of getPathTo(...args)) {
        if (result.result.status === 'success' && result.result.path.length > 6) {
          yield { ...result, result: { ...result.result, status: 'partial' as const, path: result.result.path.slice(0, 6) } }
          await rig.bot.waitForTicks(3)
        }
        yield result
      }
      return null
    }
    const lengths: number[] = []
    const perform = navigator.perform.bind(navigator)
    navigator.perform = async (...args: Parameters<typeof perform>) => { lengths.push(args[0].path.length); await perform(...args) }
    await navigator.goto(new goals.GoalNear(25.5, 64, 0.5, 0.7))
    assert.equal(searches, 1, `searches=${searches}, route lengths=${lengths}`)
    assert.equal(lengths.length, 1)
    assert.ok(lengths[0] > 20)
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(25.5, 64, 0.5)) <= 0.8)
  } finally { await cleanup(rig) }
})

for (const changed of ['none', 'route', 'remote', 'branch']) test(`mining lookahead handles ${changed} terrain changes while executing its prefix`, { timeout: 9000 }, async () => {
  const rig = prepareRig()
  try {
    const navigator: ThePathfinder = rig.bot.pathfinder
    navigator.setOptions({ routePrefixMs: 1, routePrefixLength: 3 })
    const getPathTo = navigator.getPathTo.bind(navigator)
    let searches = 0
    let lookaheads = 0
    let changedWorld = false
    navigator.getPathTo = async function * (...args: Parameters<typeof getPathTo>) {
      searches++
      for await (const result of getPathTo(...args)) {
        if (searches === 1 && result.result.status === 'partial') continue
        if (searches === 1 && result.result.status === 'success') {
          const full = result.result
          full.context.compute = () => {
            lookaheads++
            return changed === 'branch' ? { ...full, path: full.path.map(move => move.clone()) } : full
          }
          await rig.bot.waitForTicks(1)
          yield { ...result, result: { ...full, status: 'partial' as const, path: full.path.slice(0, 3) } }
        }
        yield result
      }
      return null
    }
    const onTick = (): void => {
      if (['route', 'remote'].includes(changed) && !changedWorld && lookaheads > 0) {
        changedWorld = true
        // Outside the executed prefix: invalidate even a completed lookahead.
        rig.world.setBlock(new Vec3(8, 64, changed === 'remote' ? 25 : 0), 'stone')
      }
    }
    rig.bot.on('physicsTick', onTick)
    await navigator.goto(new goals.GoalNear(11.5, 64, 0.5, 0.7), { allowMiningPrefix: true })
    rig.bot.off('physicsTick', onTick)
    assert.ok(lookaheads > 0)
    assert.equal(searches, changed === 'route' ? 2 : 1)
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(11.5, 64, 0.5)) <= 0.8)
    assert.equal(rig.bot.listenerCount('chunkColumnUnload'), 0, 'lookahead listeners are released')
  } finally { await cleanup(rig) }
})

test('mining retains the validated tail when its lookahead reaches the search budget', { timeout: 9000 }, async () => {
  const rig = prepareRig()
  try {
    const navigator: ThePathfinder = rig.bot.pathfinder
    navigator.setOptions({ routePrefixMs: 1, routePrefixLength: 4 })
    const getPathTo = navigator.getPathTo.bind(navigator)
    const origins: number[] = []
    navigator.getPathTo = async function * (...args: Parameters<typeof getPathTo>) {
      origins.push(rig.bot.entity.position.x)
      for await (const result of getPathTo(...args)) {
        if (origins.length === 1 && result.result.status === 'partial') continue
        if (origins.length === 1 && result.result.status === 'success') {
          const full = result.result
          full.context.compute = () => ({ ...full, status: 'timeout' as const, path: full.path.slice(0, 8) })
          await rig.bot.waitForTicks(1)
          yield { ...result, result: { ...full, status: 'partial' as const, path: full.path.slice(0, 4) } }
        }
        yield result
      }
      return null
    }
    await navigator.goto(new goals.GoalNear(12.5, 64, 0.5, 0.7), { allowMiningPrefix: true })
    assert.equal(origins.length, 2)
    assert.ok(origins[1] >= 8, `the retained tail must execute before a new search: origins=${origins}`)
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(12.5, 64, 0.5)) < 0.8)
    assert.equal(rig.bot.listenerCount('chunkColumnUnload'), 0)
  } finally { await cleanup(rig) }
})

test('come ignores adjacent chunk loads but replans when its route column is refreshed', { timeout: 8000 }, async () => {
  const rig = prepareRig()
  try {
    const navigator: ThePathfinder = rig.bot.pathfinder
    let searches = 0
    const getPathTo = navigator.getPathTo.bind(navigator)
    navigator.getPathTo = (...args) => { searches++; return getPathTo(...args) }
    const resets: string[] = []
    rig.bot.on('resetPath', (reason: string) => resets.push(reason))
    const running = navigator.goto(new goals.GoalNear(10.5, 64, 0.5, 0.7))
    await rig.bot.waitForTicks(4)
    assert.ok(navigator.currentPath != null)
    rig.bot.emit('chunkColumnLoad', new Vec3(0, 0, 16))
    await rig.bot.waitForTicks(3)
    assert.deepEqual(resets, [])
    assert.equal(searches, 1)
    rig.bot.emit('chunkColumnLoad', new Vec3(0, 0, 0))
    await running
    assert.deepEqual(resets, ['chunkLoad'])
    assert.equal(searches, 2)
    assert.ok(rig.bot.entity.position.distanceTo(new Vec3(10.5, 64, 0.5)) <= 0.8)
  } finally { await cleanup(rig) }
})

test('a pending movement callback still times out and releases the next navigation', { timeout: 6000 }, async () => {
  const rig = prepareRig()
  try {
    const navigator = rig.bot.pathfinder
    navigator.setMoveOptions({ movementTimeoutMs: 150 })
    const originals = new Map<any, any>()
    const releases: Array<(value: boolean) => void> = []
    for (const [, executor] of navigator.getActiveMappings().movements) {
      originals.set(executor, executor._performPerTick)
      executor._performPerTick = async () => { rig.bot.clearControlStates(); return await new Promise<boolean>(resolve => releases.push(resolve)) }
    }
    await assert.rejects(navigator.goto(new goals.GoalBlock(5, 64, 0)), /Movement stalled/)
    assert.equal(navigator.isPathing, false)
    assert.equal(rig.bot.getControlState('forward'), false)
    for (const [executor, original] of originals) executor._performPerTick = original
    navigator.setMoveOptions({ movementTimeoutMs: 3000 })
    const next = navigator.goto(new goals.GoalNear(5, 64, 0, 1))
    await rig.bot.waitForTicks(3)
    const activeMove = navigator.currentMove
    for (const release of releases) release(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(navigator.currentMove, activeMove, 'a late callback cannot clear the next route')
    await next
    assert.ok(rig.bot.entity.position.x > 1)
  } finally { await cleanup(rig) }
})
