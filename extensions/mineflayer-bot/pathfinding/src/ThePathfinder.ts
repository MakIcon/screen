/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-assertions, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/restrict-template-expressions, no-unmodified-loop-condition */
import { Bot, BotEvents } from 'mineflayer'
import { AStarBackOff as AAStar } from './abstract/algorithms/astar'
import { AStar, Path, PathProducer } from './mineflayer-specific/algs'
import * as goals from './mineflayer-specific/goals'
import { Vec3 } from 'vec3'
import { Move } from './mineflayer-specific/move'
import { BlockInfo, CacheSyncWorld } from './mineflayer-specific/world/cacheWorld'
import { ResetError, NavigationError } from './mineflayer-specific/exceptions'
import type {
  BuildableMoveExecutor,
  BuildableMoveProvider,
  MovementOptions,
  ExecutorMap
} from './mineflayer-specific/movements'
import {
  MovementHandler,
  MovementExecutor,
  buildMovementOptions
} from './mineflayer-specific/movements'

import {
  ParkourForward,
  ParkourDiagonal,
  Diagonal,
  Forward,
  ForwardDropDown,
  ForwardJump,
  IdleMovement,
  StraightDown,
  StraightUp
} from './mineflayer-specific/movements/movementProviders'

import {
  ParkourForwardExecutor,
  ParkourDiagonalExecutor,
  ForwardDropDownExecutor,
  NewForwardExecutor,
  NewForwardJumpExecutor,
  StraightDownExecutor,
  StraightUpExecutor,
  IdleMovementExecutor
} from './mineflayer-specific/movements/movementExecutors'
import { DropDownOpt, ForwardJumpUpOpt, LandStraightAheadOpt } from './mineflayer-specific/post/optimizers'
import type { BuildableMoveOptimizer, OptimizationMap } from './mineflayer-specific/post'
import { MovementOptimizer, OptimizationRegistry, Optimizer } from './mineflayer-specific/post'
import { ContinuousPathProducer, PartialPathProducer } from './mineflayer-specific/pathProducers'
import type { Block, ResetReason } from './types'
import { HandlerOpts } from './types'
import { Task } from '@nxg-org/mineflayer-util-plugin'

import { reconstructPath } from './abstract/algorithms'
import { closestPointOnLineSegment, getScaffoldCount, getNormalizedPos, getSupportedStartPos } from './utils'
import { World } from './mineflayer-specific/world/worldInterface'
import { Movement } from './mineflayer-specific/movements/movement'
import { isIceBlock } from './mineflayer-specific/movements/momentum'
import { handleBlockEvent, handleSettledBlockEvent } from './customBlockEvents'
import { PathExecutor, type ExecutionMappings } from './pathExecutor'
import { NeoProvider, NeoExecutor } from './mineflayer-specific/movements/neo'
import { Climb, ClimbExecutor } from './mineflayer-specific/movements/climb'
import { WaterDrop, WaterDropExecutor } from './mineflayer-specific/movements/waterDrop'
import { findShoreGoal, ShoreRouteGoal } from './mineflayer-specific/shore'
import { selectAscentPrefix } from './mineflayer-specific/ascentPrefix'
import { canContinueSwimming } from './mineflayer-specific/surfaceSwimming'
import { MomentumJump, MomentumJumpExecutor } from './mineflayer-specific/movements/momentum'
import { LadderForward, LadderDiagonal, LadderLandingForward, LadderLandingDiagonal } from './mineflayer-specific/movements/advanced/ladder-provider'
import { LadderForwardExecutor, LadderDiagonalExecutor, LadderLandingForwardExecutor, LadderLandingDiagonalExecutor } from './mineflayer-specific/movements/advanced/ladder-executor'
import { AroundCornerDiagonal } from './mineflayer-specific/movements/advanced/around-corner-provider'
import { AroundCornerDiagonalExecutor } from './mineflayer-specific/movements/advanced/around-corner-executor'
import { start } from 'node:repl'

const debug = require('debug')
const log = debug('minecraft-pathfinding:main')

export interface PathfinderOptions {
  partialPathProducer: boolean
  partialPathLength: number
  searchTimeoutMs: number
  tickTimeoutMs: number
  maxVisitedNodes: number
  /** Start a nearby, verified route prefix after this search budget; 0 waits for a full route. */
  routePrefixMs: number
  routePrefixLength: number
}

const DEFAULT_PATHFINDER_OPTS: PathfinderOptions = {
  partialPathProducer: false,
  partialPathLength: 50,
  searchTimeoutMs: 10000,
  tickTimeoutMs: 10,
  maxVisitedNodes: 50000,
  routePrefixMs: 0,
  routePrefixLength: 16
}

const EMPTY_VEC = new Vec3(0, 0, 0)

const DEFAULT_PROVIDER_EXECUTORS = [
  [IdleMovement, IdleMovementExecutor],
  [Forward, NewForwardExecutor],
  [ForwardJump, NewForwardJumpExecutor],
  [ForwardDropDown, ForwardDropDownExecutor],
  [Diagonal, NewForwardExecutor],
  [StraightDown, StraightDownExecutor],
  [StraightUp, StraightUpExecutor],
  [Climb, ClimbExecutor],
  [WaterDrop, WaterDropExecutor],
  [ParkourForward, ParkourForwardExecutor],
  [MomentumJump, MomentumJumpExecutor],
  [ParkourDiagonal, ParkourDiagonalExecutor],
  [NeoProvider, NeoExecutor],
  [LadderForward, LadderForwardExecutor],
  [LadderDiagonal, LadderDiagonalExecutor],
  [LadderLandingForward, LadderLandingForwardExecutor],
  [LadderLandingDiagonal, LadderLandingDiagonalExecutor],
  [AroundCornerDiagonal, AroundCornerDiagonalExecutor]
] as Array<[BuildableMoveProvider, BuildableMoveExecutor]>

DEFAULT_PROVIDER_EXECUTORS.reverse()

const DEFAULT_OPTIMIZERS = [
  [Forward, LandStraightAheadOpt],
  [Diagonal, LandStraightAheadOpt],
  [ForwardDropDown, DropDownOpt],
  [ForwardJump, ForwardJumpUpOpt]
] as Array<[BuildableMoveProvider, BuildableMoveOptimizer]>

const DEFAULT_SETUP = new Map(DEFAULT_PROVIDER_EXECUTORS)
const DEFAULT_OPTIMIZATION = new Map(DEFAULT_OPTIMIZERS)

type PathInfo = Path
type PathGenerator = AsyncGenerator<PathGeneratorResult, PathGeneratorResult | null, unknown>
interface PathGeneratorResult {
  result: PathInfo
  astarContext: AAStar<Move, MovementHandler>
}

interface PerformOpts {
  errorOnReset?: boolean
  errorOnAbort?: boolean
}

export class ThePathfinder {
  astar: AStar | null
  world: World
  movements: ExecutorMap
  defaultMoveSettings: MovementOptions
  pathfinderSettings: PathfinderOptions
  private readonly optimizerRegistry: OptimizationRegistry

  private executeTask: Task<void, void> = Task.createDoneTask()
  private goalRequestId = 0
  private readonly waiters = new Set<() => void>()
  private readonly disposeListeners: Array<() => void> = []
  private wakeGoal?: () => void
  private disposed = false
  private pendingReset?: Promise<void>
  public abortCalculation = false

  private currentGotoGoal?: goals.Goal
  private _currentProducer?: PathProducer
  private readonly executionRunner: PathExecutor

  private _gotoMappings?: {
    movements: ExecutorMap
    optimizers: OptimizationMap
  }

  public get currentAStar (): AStar | undefined {
    return this._currentProducer?.getAstarContext()
  }

  public get currentProducer (): PathProducer | undefined {
    return this._currentProducer
  }

  private snapshotMappings (): {
    movements: ExecutorMap
    optimizers: OptimizationMap
  } {
    return {
      movements: new Map(this.movements),
      optimizers: this.optimizerRegistry.snapshot()
    }
  }

  private get activeMappings (): {
    movements: ExecutorMap
    optimizers: OptimizationMap
  } {
    return this._gotoMappings ?? this.snapshotMappings()
  }

  public getActiveMappings (): ExecutionMappings {
    return this.activeMappings
  }

  public get isPathing (): boolean {
    return !this.executeTask.done
  }

  public get currentGoal (): Readonly<goals.Goal> | undefined {
    return this.currentGotoGoal
  }

  public get resetReason (): ResetReason | undefined {
    return this.executionRunner.getResetReason()
  }

  public get currentIndex (): number {
    return this.executionRunner.getCurrentIndex()
  }

  public get currentPath (): Move[] | undefined {
    return this.executionRunner.getCurrentPath()
  }

  public set currentPath (path: Move[] | undefined) {
    this.executionRunner.setCurrentPath(path)
  }

  public get currentMove (): Move | undefined {
    return this.executionRunner.getCurrentMove()
  }

  public set currentMove (move: Move | undefined) {
    this.executionRunner.setCurrentMove(move)
  }

  public get currentExecutor (): MovementExecutor | undefined {
    return this.executionRunner.getCurrentExecutor()
  }

  public set currentExecutor (executor: MovementExecutor | undefined) {
    this.executionRunner.setCurrentExecutor(executor)
  }

  public clearResetReason (): void {
    this.executionRunner.clearResetReason()
  }

  reconstructPath = reconstructPath

  constructor (private readonly bot: Bot, opts: HandlerOpts = {}) {
    this.world = opts.world ?? new CacheSyncWorld(bot, bot.world)
    const moveSettings: MovementOptions = {} as MovementOptions
    const pathfinderSettings: PathfinderOptions = {} as PathfinderOptions
    const optimizers = opts.optimizers ?? DEFAULT_OPTIMIZATION
    const moveSetup = opts.movements ?? DEFAULT_SETUP

    Object.assign(moveSettings, buildMovementOptions(opts.moveSettings))
    Object.assign(pathfinderSettings, { ...DEFAULT_PATHFINDER_OPTS, ...opts.pathfinderSettings })

    const moves = new Map<BuildableMoveProvider, MovementExecutor>()
    for (const [providerType, ExecutorType] of moveSetup) {
      moves.set(providerType, new ExecutorType(bot, this.world, moveSettings))
    }

    this.optimizerRegistry = new OptimizationRegistry(bot, this.world, moveSettings)
    for (const [providerType, ExecutorType] of optimizers) {
      this.optimizerRegistry.setOptimizer(providerType, new ExecutorType(bot, this.world, moveSettings))
    }
    this.movements = moves
    this.defaultMoveSettings = moveSettings
    this.pathfinderSettings = pathfinderSettings
    this.astar = null
    this.executionRunner = new PathExecutor(this.bot, this)

    this.setupListeners()
    log('Pathfinder initialized.')
  }

  setExecutor (provider: BuildableMoveProvider, Executor: BuildableMoveExecutor | MovementExecutor): void {
    if (Executor instanceof MovementExecutor) {
      this.movements.set(provider, Executor)
    } else {
      this.movements.set(provider, new Executor(this.bot, this.world, this.defaultMoveSettings))
    }
  }

  setOptimizer (
    provider: BuildableMoveProvider,
    Optimizer: BuildableMoveOptimizer | MovementOptimizer,
    Executor?: BuildableMoveExecutor | MovementExecutor,
    priority = 100
  ): void {
    const optimizer = Optimizer instanceof MovementOptimizer
      ? Optimizer
      : new Optimizer(this.bot, this.world, this.defaultMoveSettings)

    const optimizedExecutor = Executor == null
      ? undefined
      : Executor instanceof MovementExecutor
        ? Executor
        : new Executor(this.bot, this.world, this.defaultMoveSettings)

    this.optimizerRegistry.setOptimizer(provider, optimizer, optimizedExecutor, priority)
  }

  addOptimizer (
    provider: BuildableMoveProvider,
    Optimizer: BuildableMoveOptimizer | MovementOptimizer,
    Executor?: BuildableMoveExecutor | MovementExecutor,
    priority = 100
  ): void {
    const optimizer = Optimizer instanceof MovementOptimizer
      ? Optimizer
      : new Optimizer(this.bot, this.world, this.defaultMoveSettings)

    const optimizedExecutor = Executor == null
      ? undefined
      : Executor instanceof MovementExecutor
        ? Executor
        : new Executor(this.bot, this.world, this.defaultMoveSettings)

    this.optimizerRegistry.addOptimizer(provider, optimizer, optimizedExecutor, priority)
  }

  setMoveOptions (settings: Partial<MovementOptions>): void {
    this.defaultMoveSettings = buildMovementOptions({ ...this.defaultMoveSettings, ...settings })
    this.optimizerRegistry.setSettings(this.defaultMoveSettings)
    for (const [, executor] of this.movements) {
      executor.settings = this.defaultMoveSettings
    }
  }

  setOptions (settings: Partial<PathfinderOptions>): void {
    this.pathfinderSettings = Object.assign({}, DEFAULT_PATHFINDER_OPTS, this.pathfinderSettings, settings)
  }

  dropMovment (provider: BuildableMoveProvider): void {
    this.movements.delete(provider)
  }

  dropMovement (provider: BuildableMoveProvider): void {
    this.dropMovment(provider)
  }

  dropAllMovements (): void {
    this.movements.clear()
  }

  async cancel (): Promise<void> {
    log('User cancelled pathfinding.')
    this.goalRequestId++
    await this.interrupt(this.defaultMoveSettings.movementTimeoutMs, true, 'goalReassignment')
  }

  async stop (): Promise<void> {
    await this.cancel()
    await this.executeTask.promise
    this.bot.clearControlStates()
  }

  async destroy (): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const dispose of this.disposeListeners.splice(0)) dispose()
    await this.stop()
    this.world.dispose?.()
  }

  async waitForTick (): Promise<void> {
    if (this.abortCalculation || this.disposed) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(finish, 1000)
      const bot = this.bot
      const waiters = this.waiters
      function finish (): void {
        clearTimeout(timer)
        bot.off('physicsTick', finish)
        bot.off('end', finish)
        waiters.delete(finish)
        resolve()
      }
      this.waiters.add(finish)
      bot.once('physicsTick', finish)
      bot.once('end', finish)
    })
  }

  private async waitForRetry (delay: number, update: Promise<void>): Promise<void> {
    if (this.resetReason === 'goalReassignment' || this.disposed) return
    await new Promise<void>(resolve => {
      const finish = (): void => {
        clearTimeout(timer)
        this.bot.off('blockUpdate', finish)
        this.bot.off('chunkColumnLoad', finish)
        this.waiters.delete(finish)
        resolve()
      }
      const timer = setTimeout(finish, delay)
      this.waiters.add(finish)
      this.bot.once('blockUpdate', finish)
      this.bot.once('chunkColumnLoad', finish)
      void update.then(finish)
    })
  }

  async interrupt (timeout = this.defaultMoveSettings.movementTimeoutMs, cancelCalculation = true, reasonStr?: ResetReason): Promise<void> {
    log('Interrupt called. Cancel Calculation: %s. %s', cancelCalculation, reasonStr)
    this.abortCalculation = cancelCalculation
    this.executionRunner.setResetReason(reasonStr)
    this.wakeGoal?.()
    for (const wake of [...this.waiters]) wake()

    const currentExecutor = this.currentExecutor
    const currentMove = this.currentMove
    const reason = reasonStr ? ResetError.fromReason(reasonStr) : undefined
    const abort = currentExecutor != null && currentMove != null
      ? currentExecutor.abort(currentMove, { timeout, reason })
      : Promise.resolve()
    await this.executionRunner.cancelExecution()
    currentExecutor?.reset()
    await abort
  }

  reset (reason: ResetReason, cancelTimeout = this.defaultMoveSettings.movementTimeoutMs): Promise<void> {
    if (this.pendingReset != null) return this.pendingReset
    const pending = Promise.resolve().then(async () => {
      log('Reset triggered due to: %s', reason)
      this.bot.emit('resetPath', reason)
      await this.interrupt(cancelTimeout, true, reason)
    })
    this.pendingReset = pending
    void pending.finally(() => { if (this.pendingReset === pending) this.pendingReset = undefined }).catch(() => {})
    return pending
  }

  setupListeners (): void {
    const blockAbort = new AbortController()
    const disposeBlockUpdateListener = handleSettledBlockEvent(
      this.bot,
      async (oldBlock: Block | null, newBlock: Block | null, settledBlock: Block | null) => {
        // log(
        //   'settled block update',
        //   oldBlock?.name,
        //   oldBlock?.position,
        //   newBlock?.name,
        //   newBlock?.position,
        //   settledBlock?.name,
        //   settledBlock?.position
        // )

        const currentPath = this.currentPath
        if (oldBlock == null || settledBlock == null) return
        if (currentPath == null) return
        if (oldBlock.type === settledBlock.type) return // break in progress.
        if (!this.isPositionNearPath(oldBlock.position)) return
        if (settledBlock == null) return
        if (this.updateMatchesWanted(settledBlock, currentPath)) return

        log('Block update near path detected, resetting...')
        await this.reset('blockUpdate')
      },
      {
        settleMs: 75,
        timeoutMs: 250,
        signal: blockAbort.signal
      }
    )
    this.disposeListeners.push(() => {
      blockAbort.abort()
      disposeBlockUpdateListener()
    })

    const onChunkLoad = (chunk: Vec3): void => {
      const astarContext = this.currentAStar
      if (astarContext == null) return
      const cx = chunk.x >> 4 // can confirm, they need to be shifted.
      const cz = chunk.z >> 4
      if (
        astarContext.visitedChunks.has(`${cx - 1},${cz}`) ||
        astarContext.visitedChunks.has(`${cx},${cz - 1}`) ||
        astarContext.visitedChunks.has(`${cx + 1},${cz}`) ||
        astarContext.visitedChunks.has(`${cx},${cz + 1}`)
      ) {
        log('Chunk column loaded near path, resetting...')
        void this.reset('chunkLoad').catch(() => {})
      }
    }
    this.bot.on('chunkColumnLoad', onChunkLoad)
    const onEnd = (): void => { void this.destroy().catch(() => {}) }
    this.bot.once('end', onEnd)
    this.disposeListeners.push(() => {
      this.bot.off('chunkColumnLoad', onChunkLoad)
      this.bot.off('end', onEnd)
    })
  }

  public updateMatchesWanted (block: Block | null, path: Move[] | undefined = this.currentPath): boolean {
    const currentIndex = this.currentIndex
    log(`block: ${block?.name} pos: ${block?.position}, path: ${path?.length}, index: ${currentIndex}`)
    if (block == null || path == null) return false
    if (this.currentExecutor instanceof WaterDropExecutor && this.currentExecutor.acceptsWorldUpdate(block.position, block.name)) return true

    const pos = block.position.floored()
    for (let i = Math.max(0, currentIndex - 2); i < path.length; i++) {
      const move = path[i]
      for (const place of move.toPlace) {
        if (place.vec.equals(pos)) {
          switch (place.type) {
            case 'solid':
              return block.boundingBox === 'block'
            case 'water':
              return BlockInfo.waters.has(block.type)
            case 'replaceable':
              return BlockInfo.replaceables.has(block.type)
          }
        }
      }

      for (const br of move.toBreak) {
        log(`[debug] check break position: ${br.vec}, ${pos}, ${block.boundingBox}`)
        if (br.vec.equals(pos)) {
          return block.boundingBox === 'empty' && !BlockInfo.liquids.has(block.type)
        }
      }
    }

    return false
  }

  isPositionNearPath (pos: Vec3 | undefined, path: Move[] | undefined = this.currentPath): boolean {
    if (pos == null || path == null) return false

    for (let i = this.currentIndex; i < path.length; i++) {
      const move = path[i]
      let comparisonPoint: Vec3 | null = null

      comparisonPoint = closestPointOnLineSegment(pos, move.entryPos, move.exitPos)

      const dx = Math.abs(comparisonPoint.x - pos.x - 0.5)
      const dy = Math.abs(comparisonPoint.y - pos.y - 0.5)
      const dz = Math.abs(comparisonPoint.z - pos.z - 0.5)

      if (dx <= 1 && dy <= 2 && dz <= 1) {
        return true
      }
    }

    return false
  }

  private registerAll (
    goal: goals.GoalDynamic,
    opts: { onHasUpdate?: () => void, onInvalid?: () => void, onCleanup?: () => void, forAll?: () => void }
  ): () => void {
    const boundEvent = goal._hasChanged.bind(goal)
    const boundValid = goal.isValid.bind(goal)

    const fuckEvent: Array<[keyof BotEvents, (...args: Parameters<BotEvents[keyof BotEvents]>) => void]> = []
    const fuckValid: Array<[keyof BotEvents, (...args: Parameters<BotEvents[keyof BotEvents]>) => void]> = []

    const newOnHasUpdate = (): void => {
      if (opts.onHasUpdate != null) opts.onHasUpdate()
      if (opts.forAll != null) opts.forAll()
      for (const [key, val] of fuckEvent) {
        this.bot.off(key, val)
      }
    }
    const newOnInvalid = (): void => {
      if (opts.onInvalid != null) opts.onInvalid()
      if (opts.forAll != null) opts.forAll()
      for (const [key, val] of fuckValid) {
        this.bot.off(key, val)
      }
      for (const [key, val] of fuckEvent) {
        this.bot.off(key, val)
      }
    }

    const cleanup = (): void => {
      if (opts.onCleanup != null) opts.onCleanup()
      if (opts.forAll != null) opts.forAll()
      for (const [key, val] of fuckValid) {
        this.bot.off(key, val)
      }
      for (const [key, val] of fuckEvent) {
        this.bot.off(key, val)
      }
    }

    for (const key of goal._eventKeys) {
      const listener = (...args: Parameters<BotEvents[keyof BotEvents]>): void => {
        if (this.resetReason === 'goalReassignment') return cleanup()
        if (boundEvent(key, ...args)) newOnHasUpdate()
      }
      this.bot.on(key, listener)
      fuckEvent.push([key, listener])
    }

    for (const key of goal._validKeys) {
      const listener1 = (...args: Parameters<BotEvents[keyof BotEvents]>): void => {
        if ((this.resetReason === 'goalReassignment')) return cleanup()
        if (!boundValid(key, ...args)) newOnInvalid()
      }
      this.bot.on(key, listener1)
      fuckValid.push([key, listener1])
    }

    goal.cleanup = cleanup

    return cleanup
  }

  getPathTo (goal: goals.Goal, settings = this.defaultMoveSettings, searchScale = 1): PathGenerator {
    const { movements } = this.activeMappings
    return this.getPathFromTo(this.bot.entity.position, this.bot.entity.velocity, goal, settings, movements, searchScale)
  }

  async * getPathFromTo (
    startPos: Vec3,
    startVel: Vec3,
    goal: goals.Goal,
    settings = this.defaultMoveSettings,
    movements = this.activeMappings.movements,
    searchScale = 1
  ): PathGenerator {
    this.abortCalculation = false
    this.clearResetReason()

    const actualStartPos = getNormalizedPos(this.bot, startPos).clone()
    startPos = getSupportedStartPos(this.world, actualStartPos)
    log('Generating path from %O to %O', startPos, goal)

    const startMove = new Move(
      startPos.x, startPos.y, startPos.z, [], [], getScaffoldCount(this.bot), 0,
      new IdleMovement(this.bot, this.world), actualStartPos, startVel.clone(),
      actualStartPos.clone(), startVel.clone()
    )

    this.executionRunner.setCurrentMove(startMove)
    this.executionRunner.setCurrentExecutor(new IdleMovementExecutor(this.bot, this.world, this.defaultMoveSettings))

    this.bot.pathingUtil.refresh()

    if (this.pathfinderSettings.partialPathProducer) {
      this._currentProducer = new PartialPathProducer(
        startMove,
        goal,
        settings,
        this.bot,
        this.world,
        movements,
        searchScale
      )
    } else {
      this._currentProducer = new ContinuousPathProducer(
        startMove,
        goal,
        settings,
        this.bot,
        this.world,
        movements,
        searchScale
      )
    }
    log('Path producer initialized: %s', this._currentProducer.constructor.name)

    let result, astarContext

    do {
      const res = this._currentProducer.advance()
      result = res.result
      astarContext = res.astarContext

      if (this.abortCalculation || this.disposed) result.status = 'canceled'

      if (result.status === 'success') {
        this.bot.emit('pathGenerated', result)
        MovementHandler.count = 0
        MovementHandler.totCount = 0
        log('Path generation successful. Length: %d', result.path.length)
        yield { result, astarContext }
        return { result, astarContext }
      }

      if (this.abortCalculation) {
        result.status = 'canceled'
        log('Path generation canceled.')
        yield { result, astarContext }
        return { result, astarContext }
      }

      yield { result, astarContext }

      if (result.status === 'partial' || result.status === 'partialSuccess') {
        await new Promise<void>(resolve => setImmediate(resolve))
      }
    } while (result.status === 'partial' || result.status === 'partialSuccess')

    log('Path generation ended with status: %s', result.status)
    return {
      result,
      astarContext
    }
  }

  async getPathFromToRaw (startPos: Vec3, startVel: Vec3, goal: goals.Goal): Promise<PathInfo | null> {
    for await (const res of this.getPathFromTo(startPos, startVel, goal)) {
      if (res.result.status !== 'success') {
        if (res.result.status === 'noPath' || res.result.status === 'timeout') return null
      } else {
        return res.result
      }
    }
    return null
  }

  async goto (goal: goals.Goal | null, performOpts: PerformOpts = {}): Promise<void> {
    log('goto called')
    if (this.disposed) throw new Error('Pathfinder has been destroyed.')
    if (goal == null) {
      await this.stop()
      return
    }

    const requestId = ++this.goalRequestId

    if (!this.executeTask.done) {
      log('Cancelling previous goto task to start new one.')
      await this.interrupt(this.defaultMoveSettings.movementTimeoutMs, true, 'goalReassignment')
      await this.executeTask.promise
      log('Cancelled other goal! Beginning new one: %O', goal)
    }
    if (requestId !== this.goalRequestId || this.disposed) return

    // Survival owns movement while eating or arresting an accidental fall.
    // A new command stays cancellable and starts from the recovered position.
    this.abortCalculation = false
    while (this.bot.launcherSurvival?.busy && requestId === this.goalRequestId && !this.disposed) {
      await this.waitForTick()
    }
    if (requestId !== this.goalRequestId || this.disposed) return

    this.cleanupClient()
    this.executeTask = new Task()
    this.currentGotoGoal = goal
    this.bot.emit('goalSet', goal)

    this._gotoMappings = this.snapshotMappings()

    let completed = false
    try {
      await this._goto(goal, performOpts)
      completed = !this.abortCalculation && !this.disposed
    } finally {
      try {
        await this.cleanupAll(goal, this.currentExecutor, completed)
      } finally {
        delete this._gotoMappings
        this.executeTask.finish()
        this.cleanupClient()
      }
    }
  }

  private async _goto (goal: goals.Goal, performOpts: PerformOpts = {}): Promise<void> {
    const dynamic = goal instanceof goals.GoalDynamic && goal.dynamic
    const doForever = dynamic && goal.neverfinish
    let shore: goals.Goal | undefined
    let continuation: Path | undefined
    let failures = 0
    let waitingAtGoal = false
    const rejectedShores: goals.Goal[] = []
    let shoreRetryAt = 0
    const prefixVisits = new Map<string, number>()
    while (!this.disposed) {
      await this.pendingReset
      if (this.executionRunner.getResetReason() === 'goalReassignment' || this.disposed) return
      if (performance.now() >= shoreRetryAt) rejectedShores.length = 0
      if (dynamic) goal.update()
      let toWaitOn = new Promise<void>(() => {})
      let cleanup = (): void => {}
      if (dynamic) {
        toWaitOn = new Promise<void>((resolve) => {
          cleanup = this.registerAll(goal, {
            onHasUpdate: () => {
              shore = undefined
              continuation = undefined
              prefixVisits.clear()
              rejectedShores.length = 0
              // A rebound's ice contact is still part of the committed flight.
              if (!(goal instanceof goals.GoalFollowEntity) ||
                  ((this.bot.entity.onGround || (this.bot.entity as any).isInWater) && this.currentExecutor?.canInterrupt !== false)) {
                void this.reset('goalUpdated').catch(() => {})
              }
            },
            onInvalid: () => { void this.cancel().catch(() => {}) },
            forAll: resolve
          })
          this.wakeGoal = cleanup
        })
      }

      try {
        const pos = this.bot.entity.position
        if (doForever && goal.isEnd({ x: pos.x, y: pos.y, z: pos.z, exitPos: pos } as Move) &&
            (this.bot.entity.onGround || (this.bot.entity as any).isInWater || this.world.getBlockInfo(pos).climbable)) {
          failures = 0
          if (!waitingAtGoal) {
            await this.cleanupBot()
            if (this.world.getBlockInfo(pos).climbable) this.bot.setControlState('sneak', true)
          }
          waitingAtGoal = true
          await this.waitForRetry(500, toWaitOn)
          continue
        }
        waitingAtGoal = false
        // Keep the same exits across partial routes and movement recovery.
        // Re-scanning around every new position can send a swimmer back and
        // forth between different banks without ever reaching dry ground.
        shore ??= await findShoreGoal(this.bot, this.world, goal, () => this.abortCalculation || this.disposed, rejectedShores)
        if (this.executionRunner.getResetReason() === 'goalReassignment' || this.disposed) return
        const routingGoal = shore ?? goal
        let path: Path | undefined
        if (continuation != null) {
          const first = continuation.path[0]
          const last = continuation.path[continuation.path.length - 1]
          // A moving follow target may have changed without an entity event.
          // Reuse only when we actually landed at this plan's starting bank
          // and its final node still satisfies the current destination.
          if (this.bot.entity.onGround && first != null && last != null && goal.isEnd(last) &&
              Math.abs(pos.y - first.entryPos.y) < 0.2 && pos.xzDistanceTo(first.entryPos) < 0.8) path = continuation
          continuation = undefined
        }
        let executionGoal = routingGoal
        let prefix = false
        let unverifiedIceTakeoff = false
        const searchOrigin = pos.clone()
        const searchStarted = performance.now()
        if (path != null) this.bot.emit('pathGenerated', path)
        else for await (const res of this.getPathTo(routingGoal, this.defaultMoveSettings, Math.min(3, failures + 1))) {
          if (res.result.status === 'success') path = res.result
          const opts = this.pathfinderSettings
          if (res.result.status === 'partial' && opts.routePrefixMs > 0 &&
              performance.now() - searchStarted >= opts.routePrefixMs && res.result.path.length >= 5) {
            let moves = res.result.path.slice(0, opts.routePrefixLength)
            // The closest partial node can cross costly stone before the
            // search has compared a cheaper tower or bridge. Commit mining
            // only once the route is complete; a walking prefix can still run.
            const firstDig = moves.findIndex(move => move.toBreak.length > 0)
            if (firstDig >= 0) moves = moves.slice(0, firstDig)
            if (moves.length < 5) continue
            const last = moves[moves.length - 1]
            if ((prefixVisits.get(last.hash) ?? 0) >= 2) continue // Search past a repeatedly visited dead end.
            // Stopping a walking prefix on the ice consumes the run-up before
            // we know whether the search can reach the opposite platform.
            const iceRim = Movement.cardinalDirs.some(dir => {
              let rim = last.exitPos
              for (let distance = 0; distance <= 6; distance++) {
                const next = rim.plus(dir)
                if (!this.world.getBlockInfo(next.offset(0, -1, 0)).physical) {
                  return isIceBlock(this.world.getBlockInfo(rim.offset(0, -1, 0)).block?.name) &&
                    routingGoal.heuristic({ ...last, exitPos: next, x: Math.floor(next.x), y: Math.floor(next.y), z: Math.floor(next.z) } as Move) < routingGoal.heuristic(last)
                }
                if (![0, 1].every(y => this.world.getBlockInfo(next.offset(0, y, 0)).walkthrough)) break
                rim = next
              }
              return false
            })
            if (iceRim) { unverifiedIceTakeoff = true; continue }
            const elevatedGoal = shore == null &&
              (goal instanceof goals.GoalBlock || goal instanceof goals.GoalNear || goal instanceof goals.GoalFollowEntity) &&
              goal.y > last.exitPos.y + 0.5 && !this.world.getBlockInfo(new Vec3(goal.x, goal.y, goal.z)).water
            // A partial search may get horizontally closer to a bridge by
            // abandoning the shore, without finding any way back up. Executing
            // that prefix repeats the water/shore loop. Wait for a full route
            // or a prefix that keeps a dry foothold. Compare against the end
            // of the prefix, including when the bridge starts at our height.
            const losesFoothold = elevatedGoal &&
              (last.metadata?.waterLanding === true || this.world.getBlockInfo(last.exitPos).water)
            if (!losesFoothold && routingGoal.heuristic(last) < routingGoal.heuristic(moves[0]) - 2) {
              path = { ...res.result, path: moves }
              executionGoal = goals.GoalBlock.fromVec(last.exitPos)
              prefix = true
              this.bot.emit('pathGenerated', path)
              break
            }
          }
          if (res.result.status === 'noPath' || res.result.status === 'timeout') {
            // A short, costly climb can be the only way off a shore ledge.
            // Waiting for an entire high mountain route on every retry drops
            // that climb forever. Commit one supported rise, then search from
            // the new height with the original destination and fresh inventory.
            if (res.result.status === 'timeout' && opts.routePrefixMs > 0 && shore == null &&
                this.bot.entity.onGround && !this.world.getBlockInfo(searchOrigin).liquid &&
                (goal instanceof goals.GoalBlock || goal instanceof goals.GoalNear || goal instanceof goals.GoalFollowEntity) &&
                goal.y > searchOrigin.y + 0.5 && !this.world.getBlockInfo(new Vec3(goal.x, goal.y, goal.z)).water) {
              const moves = selectAscentPrefix(res.result, this.world, goal, searchOrigin, opts.routePrefixLength, prefixVisits)
              if (moves != null) {
                path = { ...res.result, path: moves }
                executionGoal = goals.GoalBlock.fromVec(moves[moves.length - 1].exitPos)
                prefix = true
                this.bot.emit('pathGenerated', path)
                break
              }
            }
            if (unverifiedIceTakeoff) throw new Error(`Pathfinding failed: ${res.result.status}; no verified route beyond the ice with the available runway and speed`)
            throw new NavigationError(res.result.status, `Pathfinding failed: ${res.result.status}`)
          }
          if (res.result.status === 'canceled') break
        }

        if (this.resetReason === 'goalReassignment' || this.disposed) {
          if (performOpts.errorOnAbort) throw new Error('Goto: Goal was canceled.')
          return
        }
        if (this.resetReason != null) {
          if (performOpts.errorOnReset) throw new Error(`Goto reset: ${this.resetReason}`)
          await this.cleanupBot()
          continue
        }
        if (path == null) throw new Error('Pathfinding ended without a path.')

        if (!prefix && shore == null && goal instanceof goals.GoalFollowEntity) {
          executionGoal = new goals.GoalNear(goal.x, goal.y, goal.z, Math.sqrt(goal.sqDist))
        }
        const last = path.path[path.path.length - 1]
        const continueSwimming = (): boolean => prefix && this.resetReason == null && !this.disposed &&
          last != null && last.toPlace.length === 0 && last.toBreak.length === 0 &&
          /^(Forward|Diagonal)$/.test(last.moveType.constructor.name) &&
          this.world.getBlockInfo(last.exitPos).water && canContinueSwimming(this.bot)
        await this.perform(path, executionGoal, 0, continueSwimming)
        await this.pendingReset
        if (this.resetReason != null) {
          if (this.resetReason === 'goalReassignment') return
          if (performOpts.errorOnReset) throw new Error(`Goto reset: ${this.resetReason}`)
          await this.cleanupBot()
          continue
        }
        await this.cleanupBot(false, continueSwimming())
        if (prefix) {
          prefixVisits.set(last.hash, (prefixVisits.get(last.hash) ?? 0) + 1)
          if (prefixVisits.size > 32) prefixVisits.delete(prefixVisits.keys().next().value!)
          continue
        }
        const arrived = this.bot.entity.position
        const actual = { ...path.path[path.path.length - 1], x: Math.floor(arrived.x), y: Math.floor(arrived.y + 1e-4),
          z: Math.floor(arrived.z), exitPos: arrived } as Move
        if ((shore != null || goal instanceof goals.GoalBlock || goal instanceof goals.GoalNear) && !routingGoal.isEnd(actual)) {
          throw new NavigationError('recovery', 'Movement ended before reaching the route goal.')
        }
        if (shore != null) {
          if (shore instanceof ShoreRouteGoal) continuation = shore.continuation
          shore = undefined
          continue
        }
        if (goal instanceof goals.GoalFollowEntity) {
          goal.update()
          if (!goal.isEnd(actual)) continue
        }
        if (!doForever) return
        if (this.world.getBlockInfo(this.bot.entity.position).climbable) this.bot.setControlState('sneak', true)
        failures = 0
        waitingAtGoal = true
        await this.waitForRetry(500, toWaitOn)
        if (this.resetReason === 'goalReassignment' || this.disposed) return
      } catch (error) {
        await this.pendingReset
        if (this.resetReason === 'goalReassignment' || this.disposed) return
        if (!(error instanceof NavigationError) || performOpts.errorOnReset || (!doForever && failures >= 2)) throw error
        failures++
        if (shore != null && error.reason === 'noPath') {
          // A usable ascent is still useless when its bank cannot be reached
          // from this water basin. Try the other exits before revisiting it.
          rejectedShores.push(shore)
          shoreRetryAt = performance.now() + 8000
          shore = undefined
        }
        await this.cleanupBot()
        // A stopped follow task never hears about the next terrain/target
        // change. Keep it alive, with a bounded backoff and cancellable waits.
        await this.waitForRetry(doForever ? Math.min(3000, 250 * 2 ** Math.min(failures - 1, 4)) : 100, toWaitOn)
      } finally {
        cleanup()
        delete this.wakeGoal
      }
    }
  }

  async perform (path: Path, goal: goals.Goal, entry = 0, continueSwimming?: () => boolean): Promise<void> {
    return await this.executionRunner.perform(path, goal, entry, continueSwimming)
  }

  async recovery (move: Move, path: Path, goal: goals.Goal, entry = 0): Promise<void> {
    return await this.executionRunner.recovery(move, path, goal, entry)
  }

  async cleanupBot (forceSafety = false, keepControls = false): Promise<void> {
    if (!keepControls) this.bot.clearControlStates()

    // rough code. just need any of them.

    let exec
    for (const [, executor] of this.activeMappings.movements) {
      exec ??= executor
      executor.reset()
    }

    if (forceSafety && exec != null) {
      if (this.abortCalculation || this.disposed) return
      if (this.world.getBlockInfo(this.bot.entity.position).climbable) {
        this.bot.setControlState('sneak', true)
        return
      }
      const safetyDeadline = performance.now() + this.defaultMoveSettings.movementTimeoutMs
      let normVel
      do {
        normVel = this.bot.entity.onGround ? this.bot.entity.velocity.offset(0, -this.bot.entity.velocity.y, 0) : this.bot.entity.velocity
        const ectx = exec.simForward({ ticks: 2 })
        if (ectx.state.isInWater || ectx.state.isInLava) return
        if (this.bot.entity.onGround && !ectx.state.onGround && ectx.position.y < this.bot.entity.position.y) {
          this.bot.setControlState('sneak', true)
        }

        log(normVel, normVel.norm())
        await this.waitForTick()
      } while (!this.abortCalculation && !this.disposed && performance.now() < safetyDeadline && normVel.norm() > 5e-4)

      this.bot.setControlState('sneak', false)
    }
  }

  cleanupClient (): void {
    this.abortCalculation = false
    this.clearResetReason()
    delete this.currentGotoGoal
    this.currentPath = undefined
    this.currentExecutor = undefined
    this.currentMove = undefined
    this.executionRunner.setCurrentIndex(0)
    delete this._currentProducer
  }

  async cleanupAll (goal: goals.Goal, executor = this.currentExecutor, completed = true): Promise<void> {
    if (goal instanceof goals.GoalDynamic && goal.dynamic) {
      goal.cleanup?.()
    }

    await this.cleanupBot(true)

    if (executor != null && completed) {
      await goal.onFinish(executor)
    }
    this.world.cleanup?.()

    if (!completed) {
      log('Cleanup: Goal aborted.')
      this.bot.emit('goalAborted', goal)
    } else {
      log('Cleanup: Goal finished.')
      this.bot.emit('goalFinished', goal)
    }

    this.abortCalculation = false

    log('Task finished, cleanup client.')
  }
}
