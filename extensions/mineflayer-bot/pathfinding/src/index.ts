/* eslint-disable @typescript-eslint/no-unused-vars */
import { Bot } from 'mineflayer'
import { BlockInfo } from './mineflayer-specific/world/cacheWorld'
import { PathfinderOptions, ThePathfinder } from './ThePathfinder'
import { Vec3 } from 'vec3'

import utilPlugin from '@nxg-org/mineflayer-util-plugin'
import physicsUtil, { initSetup } from '@nxg-org/mineflayer-physics-util'

import type { Block, ResetReason } from './types'
import { HandlerOpts, PlaceBlockOptions } from './types'
import { PathingUtil } from './PathingUtil'
import { installClimbablePhysics } from './mineflayer-specific/climbablePhysics'
import { installLowCeilingJumps } from './mineflayer-specific/lowCeilingJumps'
import { installSupportingBlockPhysics } from './mineflayer-specific/supportingBlockPhysics'
import { installMiningToolMaterials } from './mineflayer-specific/miningTools'
import { installItemEnchantmentCompatibility } from './mineflayer-specific/itemEnchantments'

import * as goals from './mineflayer-specific/goals'
import { Path } from './mineflayer-specific/algs'
import type { MovementOptions, MovementSetup } from './mineflayer-specific/movements'
import { MovementProvider } from './mineflayer-specific/movements'
import type { OptimizationSetup } from './mineflayer-specific/post'

export { ThePathfinder } from './ThePathfinder'
export { NavigationError, NavigationTaskError } from './mineflayer-specific/exceptions'
export type { PathfinderOptions } from './ThePathfinder'
export { installSurfaceSwimming } from './mineflayer-specific/surfaceSwimming'
export { installLowCeilingJumps } from './mineflayer-specific/lowCeilingJumps'
export { waitForMiningGround } from './mineflayer-specific/miningGround'
export { installMiningToolMaterials, miningBlock } from './mineflayer-specific/miningTools'
export { getItemEnchantments, normalizeEnchantments, installItemEnchantmentCompatibility } from './mineflayer-specific/itemEnchantments'
export * as waterDrop from './mineflayer-specific/movements/waterDrop'

export function createPlugin (opts?: HandlerOpts) {
  return function (bot: Bot) {
    if (bot.pathfinder instanceof ThePathfinder) return
    installItemEnchantmentCompatibility(bot)
    installMiningToolMaterials(bot)
    BlockInfo.init(bot.registry) // set up block info
    if (!bot.hasPlugin(utilPlugin)) bot.loadPlugin(utilPlugin)
    if (!bot.hasPlugin(physicsUtil)) bot.loadPlugin(physicsUtil)
    initSetup(bot.registry)
    installClimbablePhysics(bot)
    installSupportingBlockPhysics(bot)
    bot.pathfinder = new ThePathfinder(bot, opts)
    const fabric = (bot as Bot & { fabric?: import('node:events').EventEmitter }).fabric
    if (fabric) {
      const refresh = () => {
        BlockInfo.init(bot.registry)
        bot.pathfinder.world.cleanup?.()
      }
      fabric.on('adapted', refresh)
      fabric.on('configuration', refresh)
      bot.once('end', () => {
        fabric.removeListener('adapted', refresh)
        fabric.removeListener('configuration', refresh)
      })
    }
    bot.pathingUtil = new PathingUtil(bot)
    installLowCeilingJumps(bot, bot.pathfinder.defaultMoveSettings.allowLowCeilingJumps)
  }
}

declare module 'mineflayer' {
  interface Bot {
    pathfinder: ThePathfinder
    pathingUtil: PathingUtil
    launcherSurvival?: { readonly busy: boolean, readonly kind: string | null }

    _placeBlockWithOptions: (referenceBlock: Block, faceVector: Vec3, options?: PlaceBlockOptions) => Promise<void>
  }

  interface BotEvents {
    pathGenerated: (path: Path) => void
    resetPath: (reason: ResetReason) => void
    enteredRecovery: (errorCount: number) => void
    exitedRecovery: (errorCount: number) => void
    goalSet: (goal: goals.Goal) => void
    goalFinished: (goal: goals.Goal) => void
    goalAborted: (goal: goals.Goal) => void
  }
}

export * as goals from './mineflayer-specific/goals'

export { MovementExecutor, MovementProvider } from './mineflayer-specific/movements'
export type { BuildableMoveExecutor, BuildableMoveProvider, MovementSetup } from './mineflayer-specific/movements'
export type { MovementOptions } from './mineflayer-specific/movements'

// Exclusion zones ("keep out" areas), like upstream mineflayer-pathfinder.
// Only the type is exported; users write their own zone functions
// (see examples/exclusionZones.js for ready-to-copy box/radius helpers).
export type { ExclusionArea } from './mineflayer-specific/movements/exclusionZones'
export { MovementOptimizer } from './mineflayer-specific/post'
export type { BuildableMoveOptimizer, OptimizationSetup, OptimizationMap } from './mineflayer-specific/post'
export { Move } from './mineflayer-specific/move'

export * as movementProviders from './mineflayer-specific/movements/movementProviders'
